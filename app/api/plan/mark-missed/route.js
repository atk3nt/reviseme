import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'dev-test@markr.local';

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

    // Reschedule the missed block to the earliest available buffer slot
    try {
    const blockDate = new Date(block.scheduled_at);
    const weekStart = getStartOfWeek(blockDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      // Get user preferences
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
        .eq('id', userId)
        .single();

      if (!user) {
        console.warn('User preferences not found, skipping reschedule');
        return NextResponse.json({ success: true });
      }

      // Get all existing blocks for the week and next week (excluding the missed one)
      // We search 2 weeks ahead, so we need blocks from both weeks
      const searchEnd = new Date(weekEnd);
      searchEnd.setDate(weekEnd.getDate() + 7); // Include next week
      
      const { data: existingBlocks } = await supabaseAdmin
        .from('blocks')
        .select('scheduled_at, duration_minutes')
        .eq('user_id', userId)
        .gte('scheduled_at', weekStart.toISOString())
        .lt('scheduled_at', searchEnd.toISOString())
        .neq('id', blockId)
        .in('status', ['scheduled', 'done']);
      
      console.log(`📊 Found ${existingBlocks?.length || 0} existing blocks (excluding missed block)`);

      // Get blocked times
      const { data: blockedTimes } = await supabaseAdmin
        .from('unavailable_times')
        .select('start_datetime, end_datetime')
        .eq('user_id', userId)
        .gte('start_datetime', weekStart.toISOString())
        .lt('end_datetime', weekEnd.toISOString());

      // Get blocked times for next week too (since we search 2 weeks)
      // Reuse searchEnd from above (already set to weekEnd + 7 days)
      const { data: nextWeekBlockedTimes } = await supabaseAdmin
        .from('unavailable_times')
        .select('start_datetime, end_datetime')
        .eq('user_id', userId)
        .gte('start_datetime', weekEnd.toISOString())
        .lt('end_datetime', searchEnd.toISOString());
      
      const allBlockedTimes = [
        ...(blockedTimes || []).map(bt => ({
          start: bt.start_datetime,
          end: bt.end_datetime
        })),
        ...(nextWeekBlockedTimes || []).map(bt => ({
          start: bt.start_datetime,
          end: bt.end_datetime
        }))
      ];

      // Find earliest buffer slot
      const bufferSlot = findEarliestBufferSlot({
        weekStart,
        weekEnd,
        userPreferences: user,
        existingBlocks: existingBlocks || [],
        blockedTimes: allBlockedTimes,
        blockDuration: block.duration_minutes || 30,
        afterTime: blockDate
      });

      if (bufferSlot) {
        const originalTime = new Date(block.scheduled_at);
        const newTime = bufferSlot;
        const timeShift = newTime.getTime() - originalTime.getTime();
        
        // Reschedule the missed block to the buffer slot
        const { error: rescheduleError } = await supabaseAdmin
          .from('blocks')
          .update({
            scheduled_at: bufferSlot.toISOString(),
            status: 'scheduled',
            completed_at: null
          })
          .eq('id', blockId)
          .eq('user_id', userId);
        
        if (rescheduleError) {
          console.error('Failed to reschedule block:', rescheduleError);
          throw new Error('Failed to reschedule block');
        }
        
        console.log(`✅ Block ${blockId} rescheduled from ${block.scheduled_at} to ${bufferSlot.toISOString()}`);
        
        // Check if this is part of a spaced repetition sequence
        // Parse ai_rationale to get session metadata
        let sessionMetadata = null;
        try {
          if (block.ai_rationale) {
            const parsed = typeof block.ai_rationale === 'string' 
              ? JSON.parse(block.ai_rationale) 
              : block.ai_rationale;
            if (parsed && parsed.version === 'spaced_repetition_v1') {
              sessionMetadata = parsed;
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
        
        // If this is part of spaced repetition, shift subsequent blocks for the same topic
        if (sessionMetadata && sessionMetadata.topicId && sessionMetadata.sessionNumber && sessionMetadata.sessionTotal) {
          const currentSessionNumber = sessionMetadata.sessionNumber;
          const topicId = sessionMetadata.topicId;
          
          console.log(`🔄 Shifting subsequent spaced repetition blocks for topic ${topicId} (session ${currentSessionNumber} of ${sessionMetadata.sessionTotal})`);
          
          // Find all subsequent blocks for this topic (same topicId, higher sessionNumber, status = 'scheduled')
          const { data: subsequentBlocks, error: fetchError } = await supabaseAdmin
            .from('blocks')
            .select('id, scheduled_at, ai_rationale')
            .eq('user_id', userId)
            .eq('topic_id', topicId)
            .eq('status', 'scheduled')
            .gt('scheduled_at', originalTime.toISOString())
            .order('scheduled_at', { ascending: true });
          
          if (fetchError) {
            console.error('Failed to fetch subsequent blocks:', fetchError);
          } else if (subsequentBlocks && subsequentBlocks.length > 0) {
            // Filter to only blocks that are part of the same spaced repetition sequence
            const blocksToShift = [];
            for (const subBlock of subsequentBlocks) {
              try {
                let subMetadata = null;
                if (subBlock.ai_rationale) {
                  const parsed = typeof subBlock.ai_rationale === 'string'
                    ? JSON.parse(subBlock.ai_rationale)
                    : subBlock.ai_rationale;
                  if (parsed && parsed.version === 'spaced_repetition_v1' && parsed.topicId === topicId) {
                    subMetadata = parsed;
                  }
                }
                
                // Only shift if it's a later session in the same sequence
                if (subMetadata && subMetadata.sessionNumber > currentSessionNumber) {
                  blocksToShift.push(subBlock);
                }
              } catch (e) {
                // Skip blocks that don't have valid metadata
              }
            }
            
            if (blocksToShift.length > 0) {
              console.log(`📅 Shifting ${blocksToShift.length} subsequent blocks by ${timeShift}ms (${Math.round(timeShift / (1000 * 60 * 60))} hours)`);
              
              // Shift each subsequent block by the same time difference
              for (const subBlock of blocksToShift) {
                const oldTime = new Date(subBlock.scheduled_at);
                const newSubTime = new Date(oldTime.getTime() + timeShift);
                
                const { error: shiftError } = await supabaseAdmin
                  .from('blocks')
                  .update({
                    scheduled_at: newSubTime.toISOString()
                  })
                  .eq('id', subBlock.id)
                  .eq('user_id', userId);
                
                if (shiftError) {
                  console.error(`Failed to shift block ${subBlock.id}:`, shiftError);
                } else {
                  console.log(`   ✓ Shifted block ${subBlock.id} from ${oldTime.toISOString()} to ${newSubTime.toISOString()}`);
                }
              }
            } else {
              console.log('   No subsequent blocks to shift (all already completed or not part of sequence)');
            }
          }
        }
        
        return NextResponse.json({ 
          success: true,
          rescheduled: true,
          newScheduledAt: bufferSlot.toISOString()
        });
      } else {
        console.log(`❌ No buffer slot found for block ${blockId} - block will remain marked as missed`);
        // Block stays marked as missed - no rescheduling possible
        return NextResponse.json({ 
          success: true,
          rescheduled: false,
          message: 'No buffer slot available for rescheduling. The block will remain marked as missed.'
        });
      }
    } catch (rescheduleError) {
      console.error('Failed to reschedule missed block:', rescheduleError);
      // Don't fail the request if rescheduling fails - block is still marked as missed
      return NextResponse.json({ 
        success: true,
        rescheduled: false,
        error: 'Block marked as missed, but rescheduling failed'
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

// Helper function to get start of week (Monday)
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseTimeToMinutes(timeString = '00:00') {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function findEarliestBufferSlot({ weekStart, weekEnd, userPreferences, existingBlocks, blockedTimes, blockDuration, afterTime }) {
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const durationMinutes = blockDuration || 30;
  
  // Create a set of occupied slots (existing blocks)
  // These are the blocks that are already scheduled - we must NOT reschedule into these slots
  const occupiedSlots = new Set();
  (existingBlocks || []).forEach(block => {
    const start = new Date(block.scheduled_at);
    const end = new Date(start.getTime() + (block.duration_minutes || 30) * 60 * 1000);
    // Mark all 30-minute slots within this block as occupied
    let current = new Date(start);
    while (current < end) {
      const dateStr = current.toISOString().split('T')[0];
      const hours = current.getUTCHours().toString().padStart(2, '0');
      const minutes = current.getUTCMinutes().toString().padStart(2, '0');
      const key = `${dateStr}T${hours}:${minutes}:00`;
      occupiedSlots.add(key);
      current = new Date(current.getTime() + 30 * 60 * 1000);
    }
  });
  
  // Buffer slots are:
  // 1. Slots that were never filled during initial scheduling (the 20% we reserved)
  // 2. Any slot that's not occupied by existing blocks (excluding the missed block)
  // 3. Any slot that's not blocked by user-defined unavailable times
  // 4. Any slot that's within user's time preferences
  // 5. Any slot that's after the missed block time
  console.log(`🔍 Rescheduling: ${occupiedSlots.size} occupied slots, looking for buffer slot after ${afterTime.toISOString()}`);
  console.log(`📅 Week range: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

  // Create blocked intervals
  const blockedIntervals = (blockedTimes || []).map(range => ({
    start: new Date(range.start),
    end: new Date(range.end)
  }));
  console.log(`🚫 ${blockedIntervals.length} blocked time intervals`);

  function overlaps(slotStart, slotEnd, intervals) {
    return intervals.some(({ start, end }) => slotStart < end && slotEnd > start);
  }

  // Search day by day, starting from the same day (if there are later slots) or next day
  const missedBlockDay = new Date(afterTime);
  missedBlockDay.setHours(0, 0, 0, 0);
  
  // Start searching from the same day (for later slots) or next day
  // This allows rescheduling to later in the same day if possible
  const startDay = new Date(missedBlockDay);
  console.log(`📆 Missed block day: ${missedBlockDay.toISOString()}, starting search from same day`);
  
  // Extend search to next week if needed (2 weeks total)
  const searchEndDate = new Date(weekStart);
  searchEndDate.setDate(weekStart.getDate() + 14); // Search 2 weeks ahead
  console.log(`📅 Search range: ${startDay.toISOString()} to ${searchEndDate.toISOString()}`);
  
  let slotsChecked = 0;
  let slotsSkippedOccupied = 0;
  let slotsSkippedBlocked = 0;
  let slotsSkippedBeforeMissed = 0;

  // Search up to 14 days (current week + next week)
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const currentDay = new Date(weekStart);
    currentDay.setDate(weekStart.getDate() + dayOffset);
    
    // Skip days before the missed block day
    if (currentDay < missedBlockDay) {
      continue;
    }
    
    // Don't search beyond 2 weeks
    if (currentDay >= searchEndDate) {
      break;
    }

    // Calculate day index for this day (0-6 for week 1, 7-13 for week 2)
    const dayIndex = dayOffset % 7;
    const isWeekend = dayIndex >= 5;
    const weekendSplit = userPreferences.use_same_weekend_times === false;

    const earliestStr = isWeekend && weekendSplit
      ? userPreferences.weekend_earliest_time || '08:00'
      : userPreferences.weekday_earliest_time || '06:00';

    const latestStr = isWeekend && weekendSplit
      ? userPreferences.weekend_latest_time || '23:30'
      : userPreferences.weekday_latest_time || '22:00';

    const earliestMinutes = parseTimeToMinutes(earliestStr);
    const latestMinutes = parseTimeToMinutes(latestStr);

    // Check all possible 30-minute slots in this day
    for (let minutes = earliestMinutes; minutes + durationMinutes <= latestMinutes; minutes += 30) {
      slotsChecked++;
      const slotStart = new Date(currentDay);
      slotStart.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setUTCMinutes(slotStart.getUTCMinutes() + durationMinutes);

      // Skip if before the missed block time
      if (slotStart <= afterTime) {
        slotsSkippedBeforeMissed++;
        continue;
      }

      // Check if slot is occupied (use UTC to match how we stored them)
      const dateStr = slotStart.toISOString().split('T')[0];
      const hours = slotStart.getUTCHours().toString().padStart(2, '0');
      const minutesStr = slotStart.getUTCMinutes().toString().padStart(2, '0');
      const slotKey = `${dateStr}T${hours}:${minutesStr}:00`;
      if (occupiedSlots.has(slotKey)) {
        slotsSkippedOccupied++;
        continue;
      }

      // Check if slot overlaps with blocked times
      if (overlaps(slotStart, slotEnd, blockedIntervals)) {
        slotsSkippedBlocked++;
        continue;
      }

      // Found a buffer slot!
      console.log(`✅ Found buffer slot at ${slotStart.toISOString()} after checking ${slotsChecked} slots`);
      return slotStart;
    }
  }

  console.log(`❌ No buffer slot found. Checked ${slotsChecked} slots:`);
  console.log(`   - Skipped ${slotsSkippedBeforeMissed} (before missed time)`);
  console.log(`   - Skipped ${slotsSkippedOccupied} (occupied by existing blocks)`);
  console.log(`   - Skipped ${slotsSkippedBlocked} (blocked by unavailable times)`);
  return null; // No buffer slot found
}


