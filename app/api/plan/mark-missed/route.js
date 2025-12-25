import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'appmarkrai@gmail.com';

async function ensureDevUser() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', DEV_USER_EMAIL)
    .maybeSingle();

  if (!data && (!error || error.code === 'PGRST116')) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        email: DEV_USER_EMAIL,
        name: 'Dev Tester',
        has_completed_onboarding: false
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    return created?.id ?? null;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data?.id ?? null;
}

async function resolveUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId || process.env.NODE_ENV !== 'development') {
    return userId;
  }

  return await ensureDevUser();
}

export async function POST(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { blockId } = body;

    if (!blockId) {
      return NextResponse.json(
        { error: "Block ID is required" },
        { status: 400 }
      );
    }

    // Get block details
    const { data: block } = await supabaseAdmin
      .from('blocks')
      .select('*')
      .eq('id', blockId)
      .eq('user_id', userId)
      .single();

    if (!block) {
      return NextResponse.json(
        { error: "Block not found" },
        { status: 404 }
      );
    }

    // Check if block is already missed
    if (block.status === 'missed') {
      return NextResponse.json(
        { error: "Block is already marked as missed" },
        { status: 400 }
      );
    }

    // Check if block is already completed
    if (block.status === 'done') {
      return NextResponse.json(
        { error: "Cannot mark a completed block as missed" },
        { status: 400 }
      );
    }

    // Update block status to missed
    const { error: updateError } = await supabaseAdmin
      .from('blocks')
      .update({
        status: 'missed',
        completed_at: new Date().toISOString()
      })
      .eq('id', blockId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Failed to update block: ${updateError.message}`);
    }

    // Log the event
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: userId,
        event_type: 'block_missed',
        event_data: {
          block_id: blockId,
          missed_at: new Date().toISOString()
        }
      });

    // Try rescheduling: same-day first, then next-week
    try {
      const blockDate = new Date(block.scheduled_at);
      
      // Get user preferences
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
        .eq('id', userId)
        .single();

      if (!user) {
        console.warn('User preferences not found, skipping reschedule');
        return NextResponse.json({ 
          success: true,
          rescheduled: false,
          message: 'Block marked as missed. Will be rescheduled in your next weekly plan.'
        });
      }

      // STEP 1: Try same-day reschedule
      console.log(`🔄 Attempting to reschedule block ${blockId}...`);
      const sameDaySlot = await findSameDayBufferSlot(
        userId,
        blockDate,
        user,
        block.duration_minutes || 30,
        blockId
      );

      if (sameDaySlot) {
        // Reschedule to same-day buffer slot
        const { error: rescheduleError } = await supabaseAdmin
          .from('blocks')
          .update({
            scheduled_at: sameDaySlot.toISOString(),
            status: 'scheduled',
            completed_at: null
          })
          .eq('id', blockId)
          .eq('user_id', userId);
        
        if (rescheduleError) {
          console.error('Failed to reschedule block:', rescheduleError);
          throw new Error('Failed to reschedule block');
        }
        
        console.log(`✅ Block ${blockId} rescheduled to same-day slot: ${sameDaySlot.toISOString()}`);
        
        return NextResponse.json({ 
          success: true,
          rescheduled: true,
          rescheduledTo: 'same-day',
          newScheduledAt: sameDaySlot.toISOString(),
          newTime: sameDaySlot.toISOString(),
          blockId,
          message: 'Block rescheduled to later today.'
        });
      }
      
      // STEP 2: No same-day slot - try next week
      console.log(`❌ No same-day slot found, trying next week...`);
      
      const nextWeekResult = await findNextWeekBufferSlot(
        userId,
        blockDate,
        user,
        block.duration_minutes || 30
      );

      if (nextWeekResult) {
        // Reschedule to next-week buffer slot
        const { error: rescheduleError } = await supabaseAdmin
          .from('blocks')
          .update({
            scheduled_at: nextWeekResult.slot.toISOString(),
            status: 'scheduled',
            completed_at: null
          })
          .eq('id', blockId)
          .eq('user_id', userId);
        
        if (rescheduleError) {
          console.error('Failed to reschedule block to next week:', rescheduleError);
          throw new Error('Failed to reschedule block');
        }
        
        console.log(`✅ Block ${blockId} rescheduled to next week: ${nextWeekResult.slot.toISOString()}`);
        
        // Format day name for message
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[nextWeekResult.slot.getUTCDay()];
        
        return NextResponse.json({ 
          success: true,
          rescheduled: true,
          rescheduledTo: 'next-week',
          newScheduledAt: nextWeekResult.slot.toISOString(),
          newTime: nextWeekResult.slot.toISOString(),
          blockId,
          message: `Block rescheduled to ${dayName} next week.`
        });
      }
      
      // STEP 3: No slot found anywhere - block stays missed
      console.log(`❌ No buffer slot found for block ${blockId} (same-day or next-week)`);
      
      return NextResponse.json({ 
        success: true,
        rescheduled: false,
        message: 'No available slot this week or next. This topic will be rescheduled in your next weekly plan.'
      });
      
    } catch (rescheduleError) {
      console.error('Failed to attempt reschedule:', rescheduleError);
      return NextResponse.json({ 
        success: true,
        rescheduled: false,
        message: 'Block marked as missed. Will be rescheduled in your next weekly plan.'
      });
    }
  } catch (error) {
    console.error("Mark missed error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark block as missed" },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
function parseTimeToMinutes(timeString = '00:00') {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Combine a date with a time string to create a full datetime
 */
function combineDateAndTime(baseDate, timeString) {
  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = timeString.split(':');
  const hours = Number(hourStr) || 0;
  const minutes = Number(minuteStr) || 0;
  const seconds = Number(secondStr) || 0;
  const combined = new Date(baseDate);
  combined.setUTCHours(hours, minutes, seconds, 0);
  return combined;
}

/**
 * Get the Monday of the week containing a given date
 */
function getMonday(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d;
}

/**
 * Get the Monday of the next week from a given date
 */
function getNextWeekMonday(date) {
  const monday = getMonday(date);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

/**
 * Load repeatable events for a specific day
 */
async function loadRepeatableEventsForDay(userId, dayDate) {
  try {
    const { data, error } = await supabaseAdmin
      .from('repeatable_events')
      .select('id, label, start_time, end_time, days_of_week, start_date, end_date')
      .eq('user_id', userId);

    if (error || !data || data.length === 0) {
      return [];
    }

    const events = [];
    const day = new Date(dayDate);
    day.setUTCHours(0, 0, 0, 0);
    const utcDay = day.getUTCDay();

    data.forEach((event) => {
      // Check if event applies to this day of week
      if (!Array.isArray(event.days_of_week) || !event.days_of_week.includes(utcDay)) {
        return;
      }

      // Check if event has started
      if (event.start_date) {
        const eventStart = new Date(event.start_date);
        eventStart.setUTCHours(0, 0, 0, 0);
        if (day < eventStart) return;
      }

      // Check if event has ended
      if (event.end_date) {
        const eventEnd = new Date(event.end_date);
        eventEnd.setUTCHours(23, 59, 59, 999);
        if (day > eventEnd) return;
      }

      const startDateTime = combineDateAndTime(day, event.start_time);
      const endDateTime = combineDateAndTime(day, event.end_time);

      if (endDateTime <= startDateTime) return;

      events.push({
        start: startDateTime,
        end: endDateTime
      });
    });

    return events;
  } catch (error) {
    console.error('Repeatable events fetch exception:', error);
    return [];
  }
}

/**
 * Get blocked times for a specific day (unavailable_times + repeatable_events)
 */
async function getBlockedTimesForDay(userId, dayDate) {
  const dayStart = new Date(dayDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Get unavailable times
  const { data: blockedTimes } = await supabaseAdmin
    .from('unavailable_times')
    .select('start_datetime, end_datetime')
    .eq('user_id', userId)
    .gte('start_datetime', dayStart.toISOString())
    .lt('end_datetime', dayEnd.toISOString());

  // Get repeatable events
  const repeatableEvents = await loadRepeatableEventsForDay(userId, dayDate);

  // Combine all blocked times
  const allBlockedTimes = [
    ...(blockedTimes || []).map(bt => ({
      start: new Date(bt.start_datetime),
      end: new Date(bt.end_datetime)
    })),
    ...repeatableEvents
  ];

  return allBlockedTimes;
}

/**
 * Get existing scheduled blocks for a specific day
 */
async function getExistingBlocksForDay(userId, dayDate, excludeBlockId = null) {
  const dayStart = new Date(dayDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  let query = supabaseAdmin
    .from('blocks')
    .select('id, scheduled_at, duration_minutes')
    .eq('user_id', userId)
    .gte('scheduled_at', dayStart.toISOString())
    .lt('scheduled_at', dayEnd.toISOString())
    .in('status', ['scheduled', 'done']);

  if (excludeBlockId) {
    query = query.neq('id', excludeBlockId);
  }

  const { data: existingBlocks } = await query;
  return existingBlocks || [];
}

/**
 * Check if next week has any scheduled blocks
 */
async function hasNextWeekBlocks(userId, nextWeekMonday) {
  const weekEnd = new Date(nextWeekMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const { data: blocks, error } = await supabaseAdmin
    .from('blocks')
    .select('id')
    .eq('user_id', userId)
    .gte('scheduled_at', nextWeekMonday.toISOString())
    .lt('scheduled_at', weekEnd.toISOString())
    .in('status', ['scheduled', 'done'])
    .limit(1);

  if (error) {
    console.error('Error checking next week blocks:', error);
    return false;
  }

  return blocks && blocks.length > 0;
}

/**
 * CORE FUNCTION: Find a buffer slot for a specific day
 * 
 * This is the generic function that can be used for any day (same-day or future).
 * It respects:
 * - Study window times (earliest/latest)
 * - Blocked times (unavailable_times + repeatable_events)
 * - Existing scheduled blocks
 * - Max cluster size (3 blocks)
 * 
 * @param {Date} targetDate - The date to search for slots
 * @param {Object} userPreferences - User's time preferences
 * @param {Array} existingBlocks - Already scheduled blocks for this day
 * @param {Array} blockedTimes - Blocked time intervals for this day
 * @param {number} blockDuration - Duration of the block to schedule (minutes)
 * @param {Date|null} afterTime - Only search for slots after this time (null = start of day)
 * @returns {Date|null} - The slot start time, or null if no slot found
 */
function findBufferSlotForDay({
  targetDate,
  userPreferences,
  existingBlocks,
  blockedTimes,
  blockDuration,
  afterTime = null
}) {
  const durationMinutes = blockDuration || 30;
  
  // Get day info
  const dayStart = new Date(targetDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  
  const dayIndex = dayStart.getUTCDay();
  const isWeekend = dayIndex === 0 || dayIndex === 6;
  const weekendSplit = userPreferences.use_same_weekend_times === false;

  // Get study window for this day
  const earliestStr = isWeekend && weekendSplit
    ? userPreferences.weekend_earliest_time || '08:00'
    : userPreferences.weekday_earliest_time || '06:00';
  const latestStr = isWeekend && weekendSplit
    ? userPreferences.weekend_latest_time || '23:30'
    : userPreferences.weekday_latest_time || '22:00';

  const earliestMinutes = parseTimeToMinutes(earliestStr);
  const latestMinutes = parseTimeToMinutes(latestStr);
  
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex];
  console.log(`🔍 Searching ${dayName} ${dayStart.toISOString().split('T')[0]} slots: ${earliestStr} - ${latestStr}`);

  // Build existing block times for overlap checking
  const existingBlockTimes = (existingBlocks || []).map(block => {
    const start = new Date(block.scheduled_at);
    const end = new Date(start.getTime() + (block.duration_minutes || 30) * 60 * 1000);
    return { start, end };
  });

  // Check if slot overlaps with any interval
  function overlaps(slotStart, slotEnd, intervals) {
    return intervals.some(({ start, end }) => slotStart < end && slotEnd > start);
  }

  // Check if adding a block at this slot would exceed max cluster size (3)
  function wouldExceedMaxCluster(slotStart, slotEnd) {
    const MAX_CLUSTER_SIZE = 3;
    const CLUSTER_GAP_MINUTES = 30;
    
    // Get all blocks on this day including the proposed slot
    const allBlocks = [
      ...existingBlockTimes,
      { start: slotStart, end: slotEnd }
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
    
    // Find clusters (consecutive blocks within 30 min gap)
    let clusterSize = 1;
    for (let i = 1; i < allBlocks.length; i++) {
      const gap = (allBlocks[i].start.getTime() - allBlocks[i - 1].end.getTime()) / (1000 * 60);
      if (gap <= CLUSTER_GAP_MINUTES) {
        clusterSize++;
        if (clusterSize > MAX_CLUSTER_SIZE) {
          return true;
        }
      } else {
        clusterSize = 1;
      }
    }
    
    return false;
  }

  // Determine search start time
  let searchStartMinutes = earliestMinutes;
  
  if (afterTime) {
    const afterTimeMinutes = afterTime.getUTCHours() * 60 + afterTime.getUTCMinutes();
    // Start searching after the missed block ends (add duration to skip past it)
    searchStartMinutes = Math.max(earliestMinutes, afterTimeMinutes + durationMinutes);
  }

  // Search for available slots (30-minute increments)
  for (let minutes = searchStartMinutes; minutes + durationMinutes <= latestMinutes; minutes += 30) {
    const slotStart = new Date(dayStart);
    slotStart.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setUTCMinutes(slotStart.getUTCMinutes() + durationMinutes);

    // Check 1: Overlaps with existing blocks?
    if (overlaps(slotStart, slotEnd, existingBlockTimes)) {
      continue;
    }

    // Check 2: Overlaps with blocked times?
    if (overlaps(slotStart, slotEnd, blockedTimes)) {
      continue;
    }

    // Check 3: Would exceed max cluster size?
    if (wouldExceedMaxCluster(slotStart, slotEnd)) {
      console.log(`   ⚠️ Slot ${slotStart.toISOString()} would exceed max cluster size (3)`);
      continue;
    }

    // Found a valid slot!
    console.log(`   ✅ Found valid slot: ${slotStart.toISOString()}`);
    return slotStart;
  }

  // No slot found
  console.log(`   ❌ No valid slot found for ${dayStart.toISOString().split('T')[0]}`);
  return null;
}

/**
 * Find a same-day buffer slot for rescheduling
 * Wrapper around findBufferSlotForDay that fetches the required data
 */
async function findSameDayBufferSlot(userId, blockDate, userPreferences, blockDuration, excludeBlockId) {
  // Get existing blocks for same day
  const existingBlocks = await getExistingBlocksForDay(userId, blockDate, excludeBlockId);
  console.log(`📊 Found ${existingBlocks.length} existing blocks on same day`);

  // Get blocked times for same day
  const blockedTimes = await getBlockedTimesForDay(userId, blockDate);
  console.log(`🚫 Found ${blockedTimes.length} blocked intervals on same day`);

  // Find buffer slot
  return findBufferSlotForDay({
    targetDate: blockDate,
    userPreferences,
    existingBlocks,
    blockedTimes,
    blockDuration,
    afterTime: blockDate // Only search after the missed block time
  });
}

/**
 * Find a buffer slot in next week for rescheduling
 * 
 * Only tries to reschedule if next week already has scheduled blocks.
 * Searches each day of next week (Mon-Sun) for an available buffer slot.
 * 
 * @returns {Object|null} - { slot: Date, day: string } or null if no slot found
 */
async function findNextWeekBufferSlot(userId, blockDate, userPreferences, blockDuration) {
  // Get next week's Monday
  const nextWeekMonday = getNextWeekMonday(blockDate);
  
  console.log(`📅 Checking next week starting ${nextWeekMonday.toISOString().split('T')[0]}...`);

  // Check if next week has any scheduled blocks
  const hasBlocks = await hasNextWeekBlocks(userId, nextWeekMonday);
  
  if (!hasBlocks) {
    console.log(`   ℹ️ Next week has no scheduled blocks - skipping (will be handled by plan generation)`);
    return null;
  }
  
  console.log(`   ✅ Next week has scheduled blocks - searching for buffer slots...`);

  // Search each day of next week (Monday to Sunday)
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const targetDay = new Date(nextWeekMonday);
    targetDay.setUTCDate(nextWeekMonday.getUTCDate() + dayOffset);

    // Get existing blocks for this day
    const existingBlocks = await getExistingBlocksForDay(userId, targetDay);
    
    // Get blocked times for this day
    const blockedTimes = await getBlockedTimesForDay(userId, targetDay);

    // Find buffer slot (no afterTime constraint for future days)
    const slot = findBufferSlotForDay({
      targetDate: targetDay,
      userPreferences,
      existingBlocks,
      blockedTimes,
      blockDuration,
      afterTime: null // Search from start of day
    });

    if (slot) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[slot.getUTCDay()];
      console.log(`✅ Found next-week slot on ${dayName}: ${slot.toISOString()}`);
      return { slot, day: dayName };
    }
  }

  console.log(`❌ No buffer slot found in next week`);
  return null;
}
