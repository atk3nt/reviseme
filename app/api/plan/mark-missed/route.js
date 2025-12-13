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

      // Get all existing blocks for the search window (3 days)
      // Extend search window to cover potential next-day reschedules
      const searchEnd = new Date(weekStart);
      searchEnd.setDate(weekStart.getDate() + 3); // same week + next 2 days
      
      // Also check if block might move to next day - extend search if needed
      const blockDay = new Date(blockDate);
      blockDay.setHours(0, 0, 0, 0);
      const nextDay = new Date(blockDay);
      nextDay.setDate(blockDay.getDate() + 1);
      const extendedSearchEnd = new Date(Math.max(searchEnd.getTime(), nextDay.getTime() + (2 * 24 * 60 * 60 * 1000)));
      
      const { data: existingBlocks } = await supabaseAdmin
        .from('blocks')
        .select('id, scheduled_at, duration_minutes')
        .eq('user_id', userId)
        .gte('scheduled_at', weekStart.toISOString())
        .lt('scheduled_at', extendedSearchEnd.toISOString())
        .neq('id', blockId)
        .in('status', ['scheduled', 'done']);
      
      console.log(`📊 Found ${existingBlocks?.length || 0} existing blocks (excluding missed block)`);

      // Get blocked times within the extended search window (including next day)
      const { data: blockedTimes } = await supabaseAdmin
        .from('unavailable_times')
        .select('start_datetime, end_datetime')
        .eq('user_id', userId)
        .gte('start_datetime', weekStart.toISOString())
        .lt('end_datetime', extendedSearchEnd.toISOString());
      
      // Load and expand repeatable events (use extended search end to cover next day)
      const repeatableEvents = await loadRepeatableEvents(userId, weekStart, extendedSearchEnd);
      
      // Combine unavailable times and repeatable events
      const allBlockedTimes = [
        ...(blockedTimes || []).map(bt => ({
          start: bt.start_datetime,
          end: bt.end_datetime
        })),
        ...repeatableEvents
      ];
      
      console.log(`🚫 Loaded ${(blockedTimes || []).length} unavailable times and ${repeatableEvents.length} repeatable events (${allBlockedTimes.length} total blocked intervals)`);

      // Find earliest buffer slot (use extended search window)
      const bufferSlot = findEarliestBufferSlot({
        weekStart,
        weekEnd: extendedSearchEnd,
        userPreferences: user,
        existingBlocks: existingBlocks || [],
        blockedTimes: allBlockedTimes,
        blockDuration: block.duration_minutes || 30,
        afterTime: blockDate
      });

      if (bufferSlot) {
        const originalTime = new Date(block.scheduled_at);
        const newTime = bufferSlot;
        let timeShift = newTime.getTime() - originalTime.getTime();
        
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
        
        // Cluster repair: Only repair if this block was part of a cluster (had blocks on both sides)
        // Check if block had adjacent blocks before attempting repair
        const blockStart = new Date(originalTime);
        const blockEnd = new Date(blockStart.getTime() + (block.duration_minutes || 30) * 60 * 1000);
        const adjacentWindow = 30 * 60 * 1000; // 30 minutes
        
        const blocksBefore = (existingBlocks || []).filter(existing => {
          const existingStart = new Date(existing.scheduled_at);
          const existingEnd = new Date(existingStart.getTime() + (existing.duration_minutes || 30) * 60 * 1000);
          const gap = blockStart.getTime() - existingEnd.getTime();
          return gap >= 0 && gap <= adjacentWindow; // Block before, within 30 min
        });
        
        const blocksAfter = (existingBlocks || []).filter(existing => {
          const existingStart = new Date(existing.scheduled_at);
          const existingEnd = new Date(existingStart.getTime() + (existing.duration_minutes || 30) * 60 * 1000);
          const gap = existingStart.getTime() - blockEnd.getTime();
          return gap >= 0 && gap <= adjacentWindow; // Block after, within 30 min
        });
        
        // Only repair if block had blocks on BOTH sides (was in the middle of a cluster)
        if (blocksBefore.length > 0 && blocksAfter.length > 0) {
          console.log(`🔧 Block was in middle of cluster (${blocksBefore.length} before, ${blocksAfter.length} after), attempting repair...`);
          await repairClusterAfterRemoval(userId, originalTime, block.duration_minutes || 30, weekStart, extendedSearchEnd, user, existingBlocks || [], allBlockedTimes);
        } else {
          console.log(`ℹ️ Block was not in middle of cluster (${blocksBefore.length} before, ${blocksAfter.length} after), skipping repair`);
        }
        
        // Check if block moved to a different day
        const originalDay = new Date(originalTime);
        originalDay.setHours(0, 0, 0, 0);
        const newDay = new Date(newTime);
        newDay.setHours(0, 0, 0, 0);
        const movedToDifferentDay = originalDay.getTime() !== newDay.getTime();
        
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
        
        // If this is part of spaced repetition AND moved to a different day, shift subsequent blocks
        if (movedToDifferentDay && sessionMetadata && sessionMetadata.topicId && sessionMetadata.sessionNumber && sessionMetadata.sessionTotal) {
          console.log(`📅 Block moved from ${originalDay.toISOString().split('T')[0]} to ${newDay.toISOString().split('T')[0]} - shifting subsequent blocks`);
          const currentSessionNumber = sessionMetadata.sessionNumber;
          const topicId = sessionMetadata.topicId;
          
          console.log(`🔄 Shifting subsequent spaced repetition blocks for topic ${topicId} (session ${currentSessionNumber} of ${sessionMetadata.sessionTotal})`);
          
          // Find all subsequent blocks for this topic (same topicId, higher sessionNumber, status = 'scheduled')
          // Don't filter by scheduled_at - find all blocks in the sequence regardless of when they're scheduled
          const { data: subsequentBlocks, error: fetchError } = await supabaseAdmin
            .from('blocks')
            .select('id, scheduled_at, duration_minutes, ai_rationale, status')
            .eq('user_id', userId)
            .eq('topic_id', topicId)
            .in('status', ['scheduled', 'missed']) // Include missed blocks too, as they might need to be rescheduled
            .order('scheduled_at', { ascending: true });
          
          if (fetchError) {
            console.error('Failed to fetch subsequent blocks:', fetchError);
          } else {
            console.log(`📋 Found ${subsequentBlocks?.length || 0} total blocks for topic ${topicId} (including all statuses)`);
            
            if (subsequentBlocks && subsequentBlocks.length > 0) {
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
              console.log(`🚫 Checking against ${allBlockedTimes.length} blocked time intervals`);
              
              // Get all existing blocks (including the one we just rescheduled) for conflict checking
              // Use the same search window as normal block rescheduling
              const shiftSearchStart = new Date(Math.min(weekStart.getTime(), originalTime.getTime()));
              const shiftSearchEnd = extendedSearchEnd; // Use same window as normal block rescheduling
              
              const { data: allExistingBlocks } = await supabaseAdmin
                .from('blocks')
                .select('id, scheduled_at, duration_minutes')
                .eq('user_id', userId)
                .gte('scheduled_at', shiftSearchStart.toISOString())
                .lt('scheduled_at', shiftSearchEnd.toISOString())
                .in('status', ['scheduled', 'done']);
              
              // Shift each subsequent block, checking for unavailable times and existing blocks
              for (const subBlock of blocksToShift) {
                const oldTime = new Date(subBlock.scheduled_at);
                const proposedNewTime = new Date(oldTime.getTime() + timeShift);
                
                // Check if the proposed new time conflicts with unavailable times or existing blocks
                const blockedIntervals = allBlockedTimes.map(range => ({
                  start: new Date(range.start),
                  end: new Date(range.end)
                }));
                
                function overlaps(slotStart, slotEnd, intervals) {
                  return intervals.some(({ start, end }) => slotStart < end && slotEnd > start);
                }
                
                const blockDuration = subBlock.duration_minutes || 30;
                const blockEnd = new Date(proposedNewTime);
                blockEnd.setMinutes(proposedNewTime.getMinutes() + blockDuration);
                
                // Check for conflicts with existing blocks
                const existingBlockIntervals = (allExistingBlocks || [])
                  .filter(b => b.id !== subBlock.id)
                  .map(b => {
                    const start = new Date(b.scheduled_at);
                    const end = new Date(start.getTime() + (b.duration_minutes || 30) * 60 * 1000);
                    return { start, end };
                  });
                
                const conflictsWithUnavailable = overlaps(proposedNewTime, blockEnd, blockedIntervals);
                const conflictsWithExisting = overlaps(proposedNewTime, blockEnd, existingBlockIntervals);
                
                let finalNewTime = proposedNewTime;
                
                // If the proposed time conflicts with unavailable times or existing blocks, find an alternative slot
                if (conflictsWithUnavailable || conflictsWithExisting) {
                  console.log(`   ⚠️ Proposed time ${proposedNewTime.toISOString()} conflicts (unavailable: ${conflictsWithUnavailable}, existing: ${conflictsWithExisting}), finding alternative...`);
                  
                  // Determine the latest conflict end time to search from
                  let searchFromTime = new Date(proposedNewTime);
                  if (conflictsWithUnavailable) {
                    const unavailableIntervalsEndingAfterProposed = blockedIntervals.filter(interval => 
                      interval.end.getTime() > proposedNewTime.getTime() && overlaps(proposedNewTime, blockEnd, [interval])
                    );
                    if (unavailableIntervalsEndingAfterProposed.length > 0) {
                      const latestUnavailableEnd = Math.max(...unavailableIntervalsEndingAfterProposed.map(i => i.end.getTime()));
                      if (!isNaN(latestUnavailableEnd)) {
                        searchFromTime = new Date(Math.max(searchFromTime.getTime(), latestUnavailableEnd));
                      }
                    }
                  }
                  if (conflictsWithExisting) {
                    const existingIntervalsEndingAfterProposed = existingBlockIntervals.filter(interval => 
                      interval.end.getTime() > proposedNewTime.getTime() && overlaps(proposedNewTime, blockEnd, [interval])
                    );
                    if (existingIntervalsEndingAfterProposed.length > 0) {
                      const latestExistingEnd = Math.max(...existingIntervalsEndingAfterProposed.map(i => i.end.getTime()));
                      if (!isNaN(latestExistingEnd)) {
                        searchFromTime = new Date(Math.max(searchFromTime.getTime(), latestExistingEnd));
                      }
                    }
                  }
                  
                  // Exclude the current block being shifted from existing blocks
                  const otherBlocks = (allExistingBlocks || []).filter(b => b.id !== subBlock.id);
                  
                  // Find an available slot after the conflict ends
                  const searchStart = new Date(Math.min(weekStart.getTime(), oldTime.getTime()));
                  const searchEndExtended = new Date(Math.max(weekEnd.getTime(), proposedNewTime.getTime() + (3 * 24 * 60 * 60 * 1000)));
                  
                  const alternativeSlot = findEarliestBufferSlot({
                    weekStart: searchStart,
                    weekEnd: searchEndExtended,
                    userPreferences: user,
                    existingBlocks: otherBlocks,
                    blockedTimes: allBlockedTimes,
                    blockDuration: blockDuration,
                    afterTime: searchFromTime // Search from *after* the conflict ends
                  });
                  
                  if (alternativeSlot) {
                    // Double-check that the alternative slot doesn't conflict
                    const altBlockEnd = new Date(alternativeSlot);
                    altBlockEnd.setMinutes(altBlockEnd.getMinutes() + blockDuration);
                    
                    const altConflictsUnavailable = overlaps(alternativeSlot, altBlockEnd, blockedIntervals);
                    const altConflictsExisting = overlaps(alternativeSlot, altBlockEnd, existingBlockIntervals);
                    
                    if (!altConflictsUnavailable && !altConflictsExisting) {
                      finalNewTime = alternativeSlot;
                      console.log(`   ✅ Found alternative slot: ${finalNewTime.toISOString()} (verified no conflicts)`);
                    } else {
                      console.log(`   ⚠️ Alternative slot ${alternativeSlot.toISOString()} still conflicts, will not use it`);
                      // Don't use the conflicting alternative - effectively leaving finalNewTime as proposedNewTime
                      // The system should not place blocks in unavailable slots if an alternative is found but conflicts
                      // or if no alternative is found. This ensures we never place a block in an unavailable slot.
                    }
                  } else {
                    console.log(`   ❌ No alternative slot found after conflict`);
                    // If no alternative is found, finalNewTime remains proposedNewTime.
                    // This proposedNewTime might still conflict, but the system should prevent saving it
                    // if it's truly an invalid (unavailable) slot, rather than forcing a conflict.
                    // The overall API response should indicate failure if no valid slot can be found.
                  }
                }
                
                // Final validation: Don't save if finalNewTime conflicts with unavailable slots
                const finalBlockEnd = new Date(finalNewTime);
                finalBlockEnd.setMinutes(finalBlockEnd.getMinutes() + blockDuration);
                const finalConflictsUnavailable = overlaps(finalNewTime, finalBlockEnd, blockedIntervals);
                
                if (finalConflictsUnavailable) {
                  console.log(`   ❌ Cannot save block at ${finalNewTime.toISOString()} - conflicts with unavailable slot`);
                  // Skip updating this block - it will remain at its original time
                  continue;
                }
                
                // Update the block to the final time
                const { error: shiftError } = await supabaseAdmin
                  .from('blocks')
                  .update({
                    scheduled_at: finalNewTime.toISOString()
                  })
                  .eq('id', subBlock.id)
                  .eq('user_id', userId);
                
                if (shiftError) {
                  console.error(`Failed to shift block ${subBlock.id}:`, shiftError);
                } else {
                  console.log(`   ✓ Shifted block ${subBlock.id} from ${oldTime.toISOString()} to ${finalNewTime.toISOString()}`);
                  
                  // Update allExistingBlocks so subsequent blocks use the updated schedule
                  const blockIndex = allExistingBlocks.findIndex(b => b.id === subBlock.id);
                  if (blockIndex !== -1) {
                    allExistingBlocks[blockIndex].scheduled_at = finalNewTime.toISOString();
                    console.log(`   📝 Updated allExistingBlocks for block ${subBlock.id}`);
                  }
                  
                  // Update the time shift for subsequent blocks based on actual shift
                  const actualShift = finalNewTime.getTime() - oldTime.getTime();
                  if (actualShift !== timeShift) {
                    timeShift = actualShift;
                    console.log(`   📊 Updated time shift to ${actualShift}ms for remaining blocks`);
                  }
                }
              }
            } else {
              console.log(`   ⚠️ No blocks to shift found. Total blocks found: ${subsequentBlocks?.length || 0}, Blocks to shift: ${blocksToShift.length}`);
              if (subsequentBlocks && subsequentBlocks.length > 0) {
                console.log(`   ℹ️ Blocks found but filtered out - checking why...`);
                subsequentBlocks.forEach((b, idx) => {
                  console.log(`      Block ${idx + 1}: id=${b.id}, status=${b.status}, scheduled_at=${b.scheduled_at}`);
                });
              }
            }
          } else {
            console.log(`   ⚠️ No subsequent blocks found for topic ${topicId}`);
          }
        }
        }
        
        const newTimeIso = bufferSlot.toISOString();
        return NextResponse.json({ 
          success: true,
          rescheduled: true,
          newScheduledAt: newTimeIso,
          newTime: newTimeIso, // frontend expects newTime
          blockId
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

function combineDateAndTime(baseDate, timeString) {
  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = timeString.split(':');
  const hours = Number(hourStr) || 0;
  const minutes = Number(minuteStr) || 0;
  const seconds = Number(secondStr) || 0;
  const combined = new Date(baseDate);
  combined.setUTCHours(hours, minutes, seconds, 0);
  return combined;
}

async function loadRepeatableEvents(userId, weekStartDate, weekEndDate) {
  try {
    const { data, error } = await supabaseAdmin
      .from('repeatable_events')
      .select('id, label, start_time, end_time, days_of_week, start_date, end_date, metadata')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to load repeatable events:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const events = [];
    const weekStart = new Date(weekStartDate);
    weekStart.setUTCHours(0, 0, 0, 0);

    // Expand events for each day in the search window (up to 3 days)
    const searchDays = Math.ceil((weekEndDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24));
    
    for (let offset = 0; offset < searchDays && offset < 7; offset += 1) {
      const dayDate = new Date(weekStart);
      dayDate.setUTCDate(weekStart.getUTCDate() + offset);
      const utcDay = dayDate.getUTCDay();

      data.forEach((event) => {
        if (!Array.isArray(event.days_of_week) || !event.days_of_week.includes(utcDay)) {
          return;
        }

        if (event.start_date) {
          const eventStart = new Date(event.start_date);
          eventStart.setUTCHours(0, 0, 0, 0);
          if (dayDate < eventStart) {
            return;
          }
        }

        if (event.end_date) {
          const eventEnd = new Date(event.end_date);
          eventEnd.setUTCHours(23, 59, 59, 999);
          if (dayDate > eventEnd) {
            return;
          }
        }

        const startDateTime = combineDateAndTime(dayDate, event.start_time);
        const endDateTime = combineDateAndTime(dayDate, event.end_time);

        if (endDateTime <= startDateTime) {
          return;
        }

        if (endDateTime <= weekStartDate || startDateTime >= weekEndDate) {
          return;
        }

        events.push({
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          label: event.label,
          source: 'repeatable_event',
          metadata: event.metadata || null,
          event_id: event.id
        });
      });
    }

    return events;
  } catch (error) {
    console.error('Repeatable events fetch exception:', error);
    return [];
  }
}

/**
 * Repair cluster after a middle block is removed
 * If blocks on either side of the removed block are now isolated, join them together
 */
async function repairClusterAfterRemoval(userId, removedBlockTime, removedBlockDuration, weekStart, weekEnd, userPreferences, existingBlocks, blockedTimes) {
  try {
    const removedStart = new Date(removedBlockTime);
    const removedEnd = new Date(removedStart.getTime() + removedBlockDuration * 60 * 1000);
    
    // Find blocks that were adjacent to the removed block (within 30 minutes)
    const adjacentWindow = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    const { data: nearbyBlocks } = await supabaseAdmin
      .from('blocks')
      .select('id, scheduled_at, duration_minutes')
      .eq('user_id', userId)
      .in('status', ['scheduled', 'done'])
      .gte('scheduled_at', new Date(removedStart.getTime() - adjacentWindow).toISOString())
      .lte('scheduled_at', new Date(removedEnd.getTime() + adjacentWindow).toISOString())
      .order('scheduled_at', { ascending: true });
    
    if (!nearbyBlocks || nearbyBlocks.length === 0) {
      console.log(`   ℹ️ No nearby blocks found for cluster repair`);
      return; // No nearby blocks to repair
    }
    
    console.log(`   🔍 Found ${nearbyBlocks.length} nearby blocks, checking adjacency...`);
    
    // Filter to blocks that were actually adjacent (within 30 minutes)
    const adjacentBlocks = nearbyBlocks.filter(b => {
      const blockStart = new Date(b.scheduled_at);
      const blockEnd = new Date(blockStart.getTime() + (b.duration_minutes || 30) * 60 * 1000);
      
      // Check if block was immediately before or after the removed block
      const gapBefore = removedStart.getTime() - blockEnd.getTime();
      const gapAfter = blockStart.getTime() - removedEnd.getTime();
      
      return (gapBefore >= 0 && gapBefore <= adjacentWindow) || (gapAfter >= 0 && gapAfter <= adjacentWindow);
    });
    
    if (adjacentBlocks.length < 2) {
      console.log(`   ℹ️ Only found ${adjacentBlocks.length} adjacent block(s), need 2+ to form cluster`);
      return; // Need at least 2 blocks to form a cluster
    }
    
    console.log(`🔧 Cluster repair: Found ${adjacentBlocks.length} blocks adjacent to removed block at ${removedStart.toISOString()}`);
    adjacentBlocks.forEach((b, idx) => {
      console.log(`   ${idx + 1}. Block ${b.id} at ${b.scheduled_at}`);
    });
    
    // Check if these blocks are now isolated (no other adjacent blocks outside of this group)
    // First, get all blocks in the search window to check against
    const { data: allBlocksForCheck } = await supabaseAdmin
      .from('blocks')
      .select('id, scheduled_at, duration_minutes')
      .eq('user_id', userId)
      .in('status', ['scheduled', 'done'])
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString());
    
    const isolatedBlocks = [];
    
    for (const block of adjacentBlocks) {
      const blockStart = new Date(block.scheduled_at);
      const blockEnd = new Date(blockStart.getTime() + (block.duration_minutes || 30) * 60 * 1000);
      
      // Check if this block has any other adjacent blocks (excluding blocks in the adjacentBlocks group)
      // This tells us if the block is isolated now that the middle block is gone
      const hasAdjacent = (allBlocksForCheck || []).some(existing => {
        // Don't check against itself
        if (existing.id === block.id) return false;
        // Don't count other blocks that were part of the original cluster (they're also isolated)
        if (adjacentBlocks.some(adj => adj.id === existing.id)) return false;
        
        const existingStart = new Date(existing.scheduled_at);
        const existingEnd = new Date(existingStart.getTime() + (existing.duration_minutes || 30) * 60 * 1000);
        
        const gapBefore = blockStart.getTime() - existingEnd.getTime();
        const gapAfter = existingStart.getTime() - blockEnd.getTime();
        
        // Adjacent means within 30 minutes (no gap or 30 min gap = forms cluster)
        return (gapBefore >= 0 && gapBefore <= adjacentWindow) || (gapAfter >= 0 && gapAfter <= adjacentWindow);
      });
      
      if (!hasAdjacent) {
        isolatedBlocks.push(block);
        console.log(`   📍 Block ${block.id} at ${block.scheduled_at} is now isolated`);
      } else {
        console.log(`   ℹ️ Block ${block.id} at ${block.scheduled_at} still has adjacent blocks, skipping`);
      }
    }
    
    if (isolatedBlocks.length < 2) {
      console.log(`   ℹ️ Not enough isolated blocks to repair (found ${isolatedBlocks.length})`);
      return; // Need at least 2 isolated blocks to join
    }
    
    console.log(`   🔗 Found ${isolatedBlocks.length} isolated blocks, joining them into a cluster...`);
    
    // Sort by scheduled time
    isolatedBlocks.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    
    // Keep the first block in place, move the second to be adjacent to it
    const anchorBlock = isolatedBlocks[0];
    const blockToMove = isolatedBlocks[1];
    
    const anchorStart = new Date(anchorBlock.scheduled_at);
    const anchorEnd = new Date(anchorStart.getTime() + (anchorBlock.duration_minutes || 30) * 60 * 1000);
    
    // Calculate new position: right after the anchor block (30-minute gap = adjacent)
    // If anchor ends at 10:30, new position should be 11:00 (30 min gap)
    const newPosition = new Date(anchorEnd);
    newPosition.setMinutes(newPosition.getMinutes() + 30);
    
    console.log(`   📍 Anchor block ends at ${anchorEnd.toISOString()}, moving block to ${newPosition.toISOString()}`);
    
    // Check if the new position conflicts with unavailable times or existing blocks
    const blockToMoveDuration = blockToMove.duration_minutes || 30;
    const blockToMoveEnd = new Date(newPosition);
    blockToMoveEnd.setMinutes(blockToMoveEnd.getMinutes() + blockToMoveDuration);
    
    // Check for conflicts
    const blockedIntervals = (blockedTimes || []).map(range => ({
      start: new Date(range.start),
      end: new Date(range.end)
    }));
    
    function overlaps(slotStart, slotEnd, intervals) {
      if (!intervals || intervals.length === 0) return false;
      return intervals.some(({ start, end }) => slotStart < end && slotEnd > start);
    }
    
    const conflictsWithUnavailable = overlaps(newPosition, blockToMoveEnd, blockedIntervals);
    const conflictsWithExisting = existingBlocks.some(existing => {
      if (existing.id === blockToMove.id) return false;
      const existingStart = new Date(existing.scheduled_at);
      const existingEnd = new Date(existingStart.getTime() + (existing.duration_minutes || 30) * 60 * 1000);
      return overlaps(newPosition, blockToMoveEnd, [{ start: existingStart, end: existingEnd }]);
    });
    
    if (conflictsWithUnavailable || conflictsWithExisting) {
      console.log(`   ⚠️ Cannot place block adjacent to anchor (conflicts detected), finding alternative...`);
      
      // Find alternative slot using findEarliestBufferSlot
      const otherBlocks = existingBlocks.filter(b => b.id !== blockToMove.id);
      const alternativeSlot = findEarliestBufferSlot({
        weekStart,
        weekEnd,
        userPreferences,
        existingBlocks: otherBlocks,
        blockedTimes,
        blockDuration: blockToMoveDuration,
        afterTime: anchorEnd
      });
      
      if (alternativeSlot) {
        const { error: updateError } = await supabaseAdmin
          .from('blocks')
          .update({ scheduled_at: alternativeSlot.toISOString() })
          .eq('id', blockToMove.id)
          .eq('user_id', userId);
        
        if (updateError) {
          console.error(`   ❌ Failed to repair cluster:`, updateError);
        } else {
          console.log(`   ✅ Repaired cluster: moved block ${blockToMove.id} to ${alternativeSlot.toISOString()}`);
        }
      } else {
        console.log(`   ❌ No alternative slot found for cluster repair`);
      }
    } else {
      // No conflicts, place it adjacent to anchor
      const { error: updateError } = await supabaseAdmin
        .from('blocks')
        .update({ scheduled_at: newPosition.toISOString() })
        .eq('id', blockToMove.id)
        .eq('user_id', userId);
      
      if (updateError) {
        console.error(`   ❌ Failed to repair cluster:`, updateError);
      } else {
        console.log(`   ✅ Repaired cluster: moved block ${blockToMove.id} to ${newPosition.toISOString()} (adjacent to anchor)`);
      }
    }
  } catch (error) {
    console.error('Error during cluster repair:', error);
    // Don't throw - cluster repair is optional
  }
}

function findEarliestBufferSlot({ weekStart, weekEnd, userPreferences, existingBlocks, blockedTimes, blockDuration, afterTime }) {
  const durationMinutes = blockDuration || 30;
  
  // Track existing blocks for proximity checks
  const occupiedSlots = new Set();
  const existingBlockTimes = [];
  (existingBlocks || []).forEach(block => {
    const start = new Date(block.scheduled_at);
    const end = new Date(start.getTime() + (block.duration_minutes || 30) * 60 * 1000);
    existingBlockTimes.push({ start, end });
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
  
  // Convert blocked times to Date objects, filtering out invalid dates
  const blockedIntervals = (blockedTimes || [])
    .map(range => {
      const start = range.start instanceof Date ? range.start : new Date(range.start);
      const end = range.end instanceof Date ? range.end : new Date(range.end);
      
      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn(`⚠️ Invalid blocked time range:`, range);
        return null;
      }
      
      return { start, end };
    })
    .filter(interval => interval !== null);

  // Log blocked intervals for debugging
  if (process.env.NODE_ENV === 'development' && blockedIntervals.length > 0) {
    console.log(`   🚫 Checking against ${blockedIntervals.length} blocked intervals:`);
    blockedIntervals.slice(0, 3).forEach((interval, idx) => {
      console.log(`      ${idx + 1}. ${interval.start.toISOString()} to ${interval.end.toISOString()}`);
    });
    if (blockedIntervals.length > 3) {
      console.log(`      ... and ${blockedIntervals.length - 3} more`);
    }
  }

  function overlaps(slotStart, slotEnd, intervals) {
    if (!intervals || intervals.length === 0) return false;
    
    return intervals.some(({ start, end }) => {
      // Ensure we have valid dates
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return false;
      }
      
      const doesOverlap = slotStart < end && slotEnd > start;
      if (doesOverlap && process.env.NODE_ENV === 'development') {
        console.log(`   ⚠️ Overlap detected: slot [${slotStart.toISOString()}, ${slotEnd.toISOString()}] overlaps with [${start.toISOString()}, ${end.toISOString()}]`);
      }
      return doesOverlap;
    });
  }

  // Slot proximity helpers to keep clusters
  function isAdjacentToBlock(slotStart, slotEnd) {
    return existingBlockTimes.some(({ start, end }) => {
      const gapBefore = (start.getTime() - slotEnd.getTime()) / (1000 * 60);
      const gapAfter = (slotStart.getTime() - end.getTime()) / (1000 * 60);
      return (gapBefore >= 0 && gapBefore <= 30) || (gapAfter >= 0 && gapAfter <= 30);
    });
  }

  function isNearBlock(slotStart, slotEnd) {
    return existingBlockTimes.some(({ start, end }) => {
      const gapBefore = (start.getTime() - slotEnd.getTime()) / (1000 * 60);
      const gapAfter = (slotStart.getTime() - end.getTime()) / (1000 * 60);
      return (gapBefore >= 0 && gapBefore <= 120) || (gapAfter >= 0 && gapAfter <= 120);
    });
  }

  // Check if a slot is next to an isolated block (would form a cluster of 2)
  // An isolated block is one that has no adjacent blocks
  function isNextToIsolatedBlock(slotStart, slotEnd) {
    return existingBlockTimes.some(({ start, end }) => {
      const gapBefore = (start.getTime() - slotEnd.getTime()) / (1000 * 60);
      const gapAfter = (slotStart.getTime() - end.getTime()) / (1000 * 60);
      
      // Check if this slot is adjacent to the block (within 30 minutes)
      const isAdjacent = (gapBefore >= 0 && gapBefore <= 30) || (gapAfter >= 0 && gapAfter <= 30);
      
      if (!isAdjacent) return false;
      
      // Check if the existing block is isolated (has no other adjacent blocks)
      const blockStart = start;
      const blockEnd = end;
      
      const hasOtherAdjacent = existingBlockTimes.some(other => {
        if (other.start.getTime() === blockStart.getTime() && other.end.getTime() === blockEnd.getTime()) {
          return false; // Same block
        }
        
        const otherGapBefore = (blockStart.getTime() - other.end.getTime()) / (1000 * 60);
        const otherGapAfter = (other.start.getTime() - blockEnd.getTime()) / (1000 * 60);
        
        return (otherGapBefore >= 0 && otherGapBefore <= 30) || (otherGapAfter >= 0 && otherGapAfter <= 30);
      });
      
      // Return true if the block is isolated (no other adjacent blocks)
      return !hasOtherAdjacent;
    });
  }

  // Check if placing a block at this slot would create a cluster of 4+ blocks
  // Returns true if the cluster would be too large (should skip this slot)
  // Max cluster size is 3 blocks, so we prevent joining a cluster that already has 3 blocks
  function wouldCreateOversizedCluster(slotStart, slotEnd) {
    // Get all blocks on the same day
    const slotDate = new Date(slotStart);
    slotDate.setHours(0, 0, 0, 0);
    
    const sameDayBlocks = existingBlockTimes.filter(({ start }) => {
      const blockDate = new Date(start);
      blockDate.setHours(0, 0, 0, 0);
      return blockDate.getTime() === slotDate.getTime();
    });

    if (sameDayBlocks.length === 0) {
      return false; // No blocks on this day, can't create oversized cluster
    }

    // First, identify existing clusters (without the proposed slot)
    const sortedExisting = [...sameDayBlocks].sort((a, b) => a.start.getTime() - b.start.getTime());
    const existingClusters = [];
    let currentCluster = [];

    for (let i = 0; i < sortedExisting.length; i++) {
      if (currentCluster.length === 0) {
        currentCluster.push(sortedExisting[i]);
      } else {
        const lastBlock = currentCluster[currentCluster.length - 1];
        const gap = (sortedExisting[i].start.getTime() - lastBlock.end.getTime()) / (1000 * 60);
        
        if (gap <= 30) {
          // Same cluster
          currentCluster.push(sortedExisting[i]);
        } else {
          // New cluster - save previous cluster
          if (currentCluster.length > 0) {
            existingClusters.push(currentCluster);
          }
          currentCluster = [sortedExisting[i]];
        }
      }
    }
    // Save final cluster
    if (currentCluster.length > 0) {
      existingClusters.push(currentCluster);
    }

    // Check if the proposed slot would join any existing cluster of 3 blocks
    const proposedSlot = { start: slotStart, end: slotEnd };
    
    for (const cluster of existingClusters) {
      if (cluster.length >= 3) {
        // Check if slot would be adjacent to this cluster (within 30 minutes of start or end)
        const clusterStart = cluster[0].start;
        const clusterEnd = cluster[cluster.length - 1].end;
        
        const gapBefore = (clusterStart.getTime() - slotEnd.getTime()) / (1000 * 60);
        const gapAfter = (slotStart.getTime() - clusterEnd.getTime()) / (1000 * 60);
        
        // If slot is within 30 minutes of cluster start or end, it would join the cluster
        if ((gapBefore >= 0 && gapBefore <= 30) || (gapAfter >= 0 && gapAfter <= 30)) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`   🚫 Slot ${slotStart.toISOString()} would join existing cluster of ${cluster.length} blocks (max is 3)`);
          }
          return true; // Would create a cluster of 4+ blocks
        }
      }
    }

    // Also check if adding the slot would create a new cluster of 4+ blocks
    // Sort all blocks including the proposed slot
    const allBlocks = [...sameDayBlocks, proposedSlot].sort((a, b) => 
      a.start.getTime() - b.start.getTime()
    );

    // Find consecutive blocks (gaps <= 30 minutes = same cluster)
    currentCluster = [];
    let maxClusterSize = 0;

    for (let i = 0; i < allBlocks.length; i++) {
      if (currentCluster.length === 0) {
        currentCluster.push(allBlocks[i]);
      } else {
        const lastBlock = currentCluster[currentCluster.length - 1];
        const gap = (allBlocks[i].start.getTime() - lastBlock.end.getTime()) / (1000 * 60);
        
        if (gap <= 30) {
          // Same cluster
          currentCluster.push(allBlocks[i]);
        } else {
          // New cluster - check size of previous cluster
          maxClusterSize = Math.max(maxClusterSize, currentCluster.length);
          currentCluster = [allBlocks[i]];
        }
      }
    }
    
    // Check final cluster
    maxClusterSize = Math.max(maxClusterSize, currentCluster.length);

    // Return true if this would create a cluster of 4+ blocks
    if (maxClusterSize >= 4) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`   🚫 Slot ${slotStart.toISOString()} would create cluster of ${maxClusterSize} blocks (max is 3)`);
      }
      return true;
    }
    
    return false;
  }

  // Search window: start from missed block day, extend 2 days after (3 days total: today + tomorrow + day after)
  const missedBlockDay = new Date(afterTime);
  missedBlockDay.setHours(0, 0, 0, 0);
  const searchEndDate = new Date(missedBlockDay);
  searchEndDate.setDate(missedBlockDay.getDate() + 3); // +3 to include day 0, 1, 2 (today + 2 more days)
  console.log(`📅 Search range: ${missedBlockDay.toISOString()} to ${searchEndDate.toISOString()} (2 days after current day)`);

  // Search ALL days first, collecting slots by priority (adjacent > near > next-to-isolated > isolated)
  // Then return the best slot found across all days
  // This ensures we prioritize clusters even if they're on later days
  const allAdjacentSlots = [];
  const allNearSlots = [];
  const allNextToIsolatedSlots = []; // Slots that would form a cluster with an isolated block
  const allIsolatedSlots = []; // Truly isolated slots (not next to any blocks)

  // Search up to 2 days after current day (today + tomorrow + day after = 3 days total)
  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const currentDay = new Date(missedBlockDay);
    currentDay.setDate(missedBlockDay.getDate() + dayOffset);
    if (currentDay < missedBlockDay || currentDay >= searchEndDate) continue;

    const dayIndex = currentDay.getDay();
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

    for (let minutes = earliestMinutes; minutes + durationMinutes <= latestMinutes; minutes += 30) {
      const slotStart = new Date(currentDay);
      slotStart.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setUTCMinutes(slotStart.getUTCMinutes() + durationMinutes);

      if (slotStart <= afterTime) continue;

      const dateStr = slotStart.toISOString().split('T')[0];
      const hours = slotStart.getUTCHours().toString().padStart(2, '0');
      const minutesStr = slotStart.getUTCMinutes().toString().padStart(2, '0');
      const slotKey = `${dateStr}T${hours}:${minutesStr}:00`;
      if (occupiedSlots.has(slotKey)) continue;
      
      // Check for overlaps with existing blocks (more thorough than occupiedSlots check)
      if (overlaps(slotStart, slotEnd, existingBlockTimes)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`   🚫 Skipping slot ${slotStart.toISOString()} - overlaps with existing block`);
        }
        continue;
      }
      
      // Check for overlaps with blocked times
      if (overlaps(slotStart, slotEnd, blockedIntervals)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`   🚫 Skipping slot ${slotStart.toISOString()} - overlaps with unavailable time`);
        }
        continue;
      }

      // Skip slots that would create oversized clusters (4+ blocks)
      if (wouldCreateOversizedCluster(slotStart, slotEnd)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠️ Skipping slot ${slotStart.toISOString()} - would create oversized cluster`);
        }
        continue;
      }

      // Categorize slot by proximity to existing blocks
      if (isAdjacentToBlock(slotStart, slotEnd)) {
        allAdjacentSlots.push(slotStart);
      } else if (isNearBlock(slotStart, slotEnd)) {
        allNearSlots.push(slotStart);
      } else if (isNextToIsolatedBlock(slotStart, slotEnd)) {
        // This slot would form a cluster of 2 with an isolated block
        allNextToIsolatedSlots.push(slotStart);
      } else {
        // Truly isolated - not next to any blocks
        allIsolatedSlots.push(slotStart);
      }
    }
  }

  // Helper function to count blocks on a given day
  function countBlocksOnDay(date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    
    return existingBlockTimes.filter(({ start }) => {
      return start >= dayStart && start < dayEnd;
    }).length;
  }
  
  // Helper function to sort slots by day busyness (fewer blocks = better)
  function sortByDayAvailability(slots) {
    return slots.sort((a, b) => {
      const aDay = new Date(a);
      aDay.setHours(0, 0, 0, 0);
      const bDay = new Date(b);
      bDay.setHours(0, 0, 0, 0);
      
      const aBlocks = countBlocksOnDay(aDay);
      const bBlocks = countBlocksOnDay(bDay);
      
      // Prefer days with fewer blocks (less busy)
      if (aBlocks !== bBlocks) {
        return aBlocks - bBlocks;
      }
      
      // If same busyness, prefer earlier time
      return a.getTime() - b.getTime();
    });
  }
  
  // Return the best slot found, prioritizing clusters over isolated slots
  // But within each category, prefer days with fewer existing blocks (less busy)
  // Priority: adjacent > near > next-to-isolated > isolated
  if (allAdjacentSlots.length > 0) {
    // Sort by day availability (fewer blocks = better), then by time
    const sorted = sortByDayAvailability(allAdjacentSlots);
    console.log(`✅ Found ${allAdjacentSlots.length} adjacent slot(s) - will form cluster, using best available: ${sorted[0].toISOString()}`);
    return sorted[0];
  }
  if (allNearSlots.length > 0) {
    // Sort by day availability (fewer blocks = better), then by time
    const sorted = sortByDayAvailability(allNearSlots);
    console.log(`✅ Found ${allNearSlots.length} near slot(s) - potential cluster, using best available: ${sorted[0].toISOString()}`);
    return sorted[0];
  }
  if (allNextToIsolatedSlots.length > 0) {
    // Sort by day availability (fewer blocks = better), then by time
    const sorted = sortByDayAvailability(allNextToIsolatedSlots);
    console.log(`✅ Found ${allNextToIsolatedSlots.length} slot(s) next to isolated block(s) - will form cluster of 2, using best available: ${sorted[0].toISOString()}`);
    return sorted[0];
  }
  
  // NEVER return an isolated slot - blocks should always be in clusters
  // If we reach here, we couldn't find any cluster opportunities in 7 days
  // This is a fallback, but we should try to avoid this scenario
  if (allIsolatedSlots.length > 0) {
    // Sort by time to get the earliest isolated slot
    allIsolatedSlots.sort((a, b) => a.getTime() - b.getTime());
    console.log(`⚠️ WARNING: Only found ${allIsolatedSlots.length} truly isolated slot(s) after 2-day search - no cluster possible. Using earliest: ${allIsolatedSlots[0].toISOString()}`);
    console.log(`⚠️ This should be rare - consider checking if there are any blocks available to form clusters with`);
    return allIsolatedSlots[0];
  }

  console.log(`❌ No buffer slot found in 2-day search window`);
  return null;
}



