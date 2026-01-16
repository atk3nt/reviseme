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

    // Try rescheduling: same-day first, then rest of current week
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
        // Create a new rescheduled block and mark the old one as 'rescheduled'
        console.log(`📝 Rescheduling block ${blockId}: ${block.scheduled_at} → ${sameDaySlot.toISOString()}`);
        
        // Step 1: Create new block at the new time
        const { data: newBlock, error: createError } = await supabaseAdmin
          .from('blocks')
          .insert({
            user_id: userId,
            topic_id: block.topic_id,
            scheduled_at: sameDaySlot.toISOString(),
            duration_minutes: block.duration_minutes || 30,
            status: 'scheduled',
            ai_rationale: block.ai_rationale,
            session_number: block.session_number,
            session_total: block.session_total,
            rerating_score: block.rerating_score
          })
          .select()
          .single();
        
        if (createError) {
          console.error('❌ Failed to create rescheduled block:', createError);
          throw new Error('Failed to create rescheduled block');
        }
        
        // Step 2: Mark old block as 'rescheduled' and store reference to new block
        const { error: updateError } = await supabaseAdmin
          .from('blocks')
          .update({
            status: 'rescheduled',
            ai_rationale: `Rescheduled to ${sameDaySlot.toISOString()} (Block ID: ${newBlock.id})`
          })
          .eq('id', blockId)
          .eq('user_id', userId);
        
        if (updateError) {
          console.error('❌ Failed to mark old block as rescheduled:', updateError);
          // Don't throw - the new block is created, this is just a status update
        }
        
        console.log(`✅ Block rescheduled successfully:`, {
          oldBlockId: blockId,
          newBlockId: newBlock.id,
          oldTime: block.scheduled_at,
          newTime: sameDaySlot.toISOString()
        });
        
        return NextResponse.json({ 
          success: true,
          rescheduled: true,
          rescheduledTo: 'same-day',
          newScheduledAt: sameDaySlot.toISOString(),
          newTime: sameDaySlot.toISOString(),
          oldBlockId: blockId,
          newBlockId: newBlock.id,
          message: 'Block rescheduled to later today.'
        });
      }
      
      // STEP 2: No same-day slot - try remaining days in current week
      console.log(`❌ No same-day slot found, trying rest of current week...`);
      
      const currentWeekResult = await findCurrentWeekBufferSlot(
        userId,
        blockDate,
        user,
        block.duration_minutes || 30
      );

      if (currentWeekResult) {
        // Create a new rescheduled block and mark the old one as 'rescheduled'
        console.log(`📝 Rescheduling block ${blockId}: ${block.scheduled_at} → ${currentWeekResult.slot.toISOString()}`);
        
        // Step 1: Create new block at the new time
        const { data: newBlock, error: createError } = await supabaseAdmin
          .from('blocks')
          .insert({
            user_id: userId,
            topic_id: block.topic_id,
            scheduled_at: currentWeekResult.slot.toISOString(),
            duration_minutes: block.duration_minutes || 30,
            status: 'scheduled',
            ai_rationale: block.ai_rationale,
            session_number: block.session_number,
            session_total: block.session_total,
            rerating_score: block.rerating_score
          })
          .select()
          .single();
        
        if (createError) {
          console.error('❌ Failed to create rescheduled block:', createError);
          throw new Error('Failed to create rescheduled block');
        }
        
        // Step 2: Mark old block as 'rescheduled' and store reference to new block
        const { error: updateError } = await supabaseAdmin
          .from('blocks')
          .update({
            status: 'rescheduled',
            ai_rationale: `Rescheduled to ${currentWeekResult.slot.toISOString()} (Block ID: ${newBlock.id})`
          })
          .eq('id', blockId)
          .eq('user_id', userId);
        
        if (updateError) {
          console.error('❌ Failed to mark old block as rescheduled:', updateError);
          // Don't throw - the new block is created, this is just a status update
        }
        
        console.log(`✅ Block rescheduled successfully:`, {
          oldBlockId: blockId,
          newBlockId: newBlock.id,
          oldTime: block.scheduled_at,
          newTime: currentWeekResult.slot.toISOString()
        });
        
        // Format day name for message
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[currentWeekResult.slot.getUTCDay()];
        
        return NextResponse.json({ 
          success: true,
          rescheduled: true,
          rescheduledTo: 'current-week',
          newScheduledAt: currentWeekResult.slot.toISOString(),
          newTime: currentWeekResult.slot.toISOString(),
          oldBlockId: blockId,
          newBlockId: newBlock.id,
          message: `Block rescheduled to ${dayName} this week.`
        });
      }
      
      // STEP 3: No slot found in current week - block stays missed
      console.log(`❌ No buffer slot found for block ${blockId} in current week`);
      
      return NextResponse.json({ 
        success: true,
        rescheduled: false,
        message: 'No available slot remaining this week. This topic will be prioritized in your next weekly plan.'
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
    : userPreferences.weekday_earliest_time || '04:30';
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

  // Check if adding a block at this slot would exceed max cluster size
  // For rescheduling missed blocks, we're more lenient to help recovery
  function wouldExceedMaxCluster(slotStart, slotEnd) {
    // Don't enforce cluster limit for rescheduling - let users recover from missed blocks
    // The original scheduling already enforced cluster limits
    return false;
  }

  // Determine search start time
  let searchStartMinutes = earliestMinutes;
  
  if (afterTime) {
    const afterTimeMinutes = afterTime.getUTCHours() * 60 + afterTime.getUTCMinutes();
    // Start searching from the next 30-minute slot after the missed block time
    // Round up to next 30-min increment
    const nextSlotMinutes = Math.ceil((afterTimeMinutes + 1) / 30) * 30;
    searchStartMinutes = Math.max(earliestMinutes, nextSlotMinutes);
  }

  // Search for available slots (30-minute increments)
  let slotsChecked = 0;
  let slotsBlockedByExisting = 0;
  let slotsBlockedByBlocked = 0;
  
  for (let minutes = searchStartMinutes; minutes + durationMinutes <= latestMinutes; minutes += 30) {
    const slotStart = new Date(dayStart);
    slotStart.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setUTCMinutes(slotStart.getUTCMinutes() + durationMinutes);
    
    slotsChecked++;

    // Check 1: Overlaps with existing blocks?
    if (overlaps(slotStart, slotEnd, existingBlockTimes)) {
      slotsBlockedByExisting++;
      continue;
    }

    // Check 2: Overlaps with blocked times?
    if (overlaps(slotStart, slotEnd, blockedTimes)) {
      slotsBlockedByBlocked++;
      continue;
    }

    // Check 3: Would exceed max cluster size?
    // (Disabled for rescheduling to allow recovery from missed blocks)
    if (wouldExceedMaxCluster(slotStart, slotEnd)) {
      console.log(`   ⚠️ Slot ${slotStart.toISOString()} would exceed max cluster size`);
      continue;
    }

    // Found a valid slot!
    console.log(`   ✅ Found valid slot: ${slotStart.toISOString()}`);
    return slotStart;
  }

  // No slot found - log why
  console.log(`   📊 Checked ${slotsChecked} slots: ${slotsBlockedByExisting} blocked by existing blocks, ${slotsBlockedByBlocked} blocked by unavailable times`);
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
 * Find a buffer slot in the remaining days of the current week
 * 
 * Searches from the day after the missed block until the end of the current week (Sunday).
 * Only searches future days, not past days.
 * 
 * @returns {Object|null} - { slot: Date, day: string } or null if no slot found
 */
async function findCurrentWeekBufferSlot(userId, blockDate, userPreferences, blockDuration) {
  // Get the current week's Monday (start of week)
  const currentWeekMonday = getMonday(blockDate);
  
  // Calculate the end of the current week (Sunday at 23:59:59)
  const weekEnd = new Date(currentWeekMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  console.log(`📅 Checking remaining days in current week (${currentWeekMonday.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]})...`);

  // Start from the day after the missed block
  const searchStartDate = new Date(blockDate);
  searchStartDate.setUTCDate(searchStartDate.getUTCDate() + 1);
  searchStartDate.setUTCHours(0, 0, 0, 0);
  
  // If the next day is already past the week end, no days to search
  if (searchStartDate > weekEnd) {
    console.log(`   ℹ️ No remaining days in current week to search`);
    return null;
  }

  // Calculate how many days to search (from tomorrow to end of week)
  const daysToSearch = Math.ceil((weekEnd.getTime() - searchStartDate.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`   🔍 Searching ${daysToSearch} remaining day(s) in current week...`);

  // Search each remaining day of the current week
  for (let dayOffset = 0; dayOffset < daysToSearch; dayOffset++) {
    const targetDay = new Date(searchStartDate);
    targetDay.setUTCDate(searchStartDate.getUTCDate() + dayOffset);

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
      afterTime: null // Search from start of day for future days
    });

    if (slot) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[slot.getUTCDay()];
      console.log(`✅ Found current-week slot on ${dayName}: ${slot.toISOString()}`);
      return { slot, day: dayName };
    }
  }

  console.log(`❌ No buffer slot found in remaining days of current week`);
  return null;
}
