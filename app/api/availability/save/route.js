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

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getNextMonday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonday = getMonday(today);
  const nextMonday = new Date(currentMonday);
  // If today is Monday, next Monday is in 7 days
  // If today is any other day, next Monday is the Monday of next week
  if (today.getTime() === currentMonday.getTime()) {
    nextMonday.setDate(currentMonday.getDate() + 7);
  } else {
    nextMonday.setDate(currentMonday.getDate() + 7);
  }
  return nextMonday;
}

/**
 * Save availability preferences and unavailable times
 * POST /api/availability/save
 */
export async function POST(req) {
  let rescheduleResultForResponse = { rescheduled: 0, conflicts: 0 };
  
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      timePreferences,
      blockedTimes = [],
      weekStartDate // Optional: if provided, save per-week preferences
    } = body;

    if (!timePreferences) {
      return NextResponse.json(
        { error: "Time preferences are required" },
        { status: 400 }
      );
    }

    // If weekStartDate is provided, save per-week preferences
    if (weekStartDate) {
      const weekStart = new Date(weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      
      // Check if the week has ANY blocks (generated or rescheduled)
      // Users can only change preferences if the week has ZERO blocks
      // Once blocks exist (even rescheduled), the week is "locked" and must be regenerated
      const { data: existingBlocks, error: blocksError } = await supabaseAdmin
        .from('blocks')
        .select('id')
        .eq('user_id', userId)
        .gte('scheduled_at', weekStart.toISOString())
        .lt('scheduled_at', weekEnd.toISOString())
        .limit(1); // Only need to check if any exist

      if (blocksError) {
        console.error('Error checking for scheduled blocks:', blocksError);
        return NextResponse.json(
          { error: "Failed to check if week is scheduled" },
          { status: 500 }
        );
      }

      // If ANY blocks exist (generated or rescheduled), block changes
      // Users must regenerate the week after changing preferences
      if (existingBlocks && existingBlocks.length > 0) {
        return NextResponse.json(
          { error: "Cannot change study window times for a week that already has blocks scheduled. Please regenerate the week after changing preferences." },
          { status: 400 }
        );
      }

      // Save or update per-week time preferences
      const weekStartDateStr = weekStart.toISOString().split('T')[0];
      
      // Format time strings to TIME format (HH:MM:SS)
      const formatTimeForDB = (timeStr) => {
        if (!timeStr) return null;
        // If already in HH:MM:SS format, return as is
        if (timeStr.split(':').length === 3) return timeStr;
        // If in HH:MM format, add seconds
        if (timeStr.split(':').length === 2) return `${timeStr}:00`;
        return timeStr;
      };
      
      const updateData = {
        weekday_earliest_time: formatTimeForDB(timePreferences.weekdayEarliest),
        weekday_latest_time: formatTimeForDB(timePreferences.weekdayLatest),
        weekend_earliest_time: formatTimeForDB(timePreferences.weekendEarliest),
        weekend_latest_time: formatTimeForDB(timePreferences.weekendLatest),
        use_same_weekend_times: timePreferences.useSameWeekendTimes !== false,
        updated_at: new Date().toISOString()
      };
      
      console.log('💾 Saving week time preferences:', {
        weekStartDateStr,
        userId,
        updateData
      });
      
      // First, verify the table exists by trying a simple query
      const { error: tableCheckError } = await supabaseAdmin
        .from('week_time_preferences')
        .select('id')
        .limit(0);
      
      if (tableCheckError) {
        console.error('❌ Table week_time_preferences does not exist or is not accessible:', {
          error: tableCheckError,
          code: tableCheckError.code,
          message: tableCheckError.message,
          details: tableCheckError.details,
          hint: tableCheckError.hint
        });
        
        // If table doesn't exist, just save to global preferences instead and continue
        console.warn('⚠️ Table not found, saving to global preferences instead');
        const { error: userUpdateError } = await supabaseAdmin
          .from('users')
          .update({
            weekday_earliest_time: formatTimeForDB(timePreferences.weekdayEarliest),
            weekday_latest_time: formatTimeForDB(timePreferences.weekdayLatest),
            weekend_earliest_time: formatTimeForDB(timePreferences.weekendEarliest),
            weekend_latest_time: formatTimeForDB(timePreferences.weekendLatest),
            use_same_weekend_times: timePreferences.useSameWeekendTimes !== false
          })
          .eq('id', userId);
        
        if (userUpdateError) {
          console.error('❌ Also failed to save global preferences:', userUpdateError);
          return NextResponse.json(
            { 
              error: "Failed to save time preferences",
              details: tableCheckError.message || "The week_time_preferences table needs to be created",
              hint: "Please run migration 010_add_week_time_preferences.sql in your Supabase SQL editor. Error: " + (userUpdateError.message || 'Unknown')
            },
            { status: 500 }
          );
        }
        
        // Continue with the rest of the save (blocked times) - don't return early
        console.log('✅ Saved to global preferences, continuing with blocked times...');
      } else {
        // Table exists, proceed with per-week save
        // Check if record exists
        const { data: existing, error: checkError } = await supabaseAdmin
          .from('week_time_preferences')
          .select('id')
          .eq('user_id', userId)
          .eq('week_start_date', weekStartDateStr)
          .maybeSingle();
        
        let weekPrefError = null;
        
        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 means "no rows returned" which is fine for maybeSingle()
          console.error('❌ Error checking for existing week preferences:', checkError);
          weekPrefError = checkError;
        } else if (existing) {
          // Update existing record
          const { error: updateError } = await supabaseAdmin
            .from('week_time_preferences')
            .update(updateData)
            .eq('id', existing.id)
            .eq('user_id', userId);
          
          weekPrefError = updateError;
        } else {
          // Insert new record
          const { error: insertError } = await supabaseAdmin
            .from('week_time_preferences')
            .insert({
              user_id: userId,
              week_start_date: weekStartDateStr,
              ...updateData
            });
          
          weekPrefError = insertError;
        }

        if (weekPrefError) {
          console.error('❌ Error saving week time preferences:', {
            error: weekPrefError,
            code: weekPrefError.code,
            message: weekPrefError.message,
            details: weekPrefError.details,
            hint: weekPrefError.hint,
            weekStartDateStr,
            userId
          });
          
          // Check if table doesn't exist
          if (weekPrefError.code === '42P01' || weekPrefError.message?.includes('does not exist')) {
            return NextResponse.json(
              { 
                error: "Week time preferences table not found",
                details: "Please run migration 010_add_week_time_preferences.sql in your Supabase SQL editor",
                hint: "The week_time_preferences table needs to be created first"
              },
              { status: 500 }
            );
          }
          
          // Log the full error for debugging
          console.error('Full error object:', JSON.stringify(weekPrefError, null, 2));
          
          // For now, fall back to saving global preferences if per-week save fails
          // This allows the save to succeed even if the table has issues
          console.warn('⚠️ Failed to save per-week preferences, falling back to global preferences');
          
          const { error: userUpdateError } = await supabaseAdmin
            .from('users')
            .update({
              weekday_earliest_time: formatTimeForDB(timePreferences.weekdayEarliest),
              weekday_latest_time: formatTimeForDB(timePreferences.weekdayLatest),
              weekend_earliest_time: formatTimeForDB(timePreferences.weekendEarliest),
              weekend_latest_time: formatTimeForDB(timePreferences.weekendLatest),
              use_same_weekend_times: timePreferences.useSameWeekendTimes !== false
            })
            .eq('id', userId);
          
          if (userUpdateError) {
            console.error('❌ Also failed to save global preferences:', userUpdateError);
            return NextResponse.json(
              { 
                error: "Failed to save time preferences",
                details: weekPrefError.message || weekPrefError.details || 'Unknown error',
                hint: weekPrefError.hint || 'Check the server logs for more details. Error code: ' + (weekPrefError.code || 'unknown')
              },
              { status: 500 }
            );
          }
          
          console.log('✅ Saved to global preferences as fallback');
        } else {
          console.log('✅ Successfully saved week time preferences for week:', weekStartDateStr);
        }
      }

      // Also ensure changes are applied to the next upcoming week (if different from weekStartDate)
      // This ensures changes always apply to the next week, regardless of which week user is viewing
      const nextMonday = getNextMonday();
      const nextWeekStartDateStr = nextMonday.toISOString().split('T')[0];

      // Only apply to next week if it's different from the weekStartDate provided
      if (nextWeekStartDateStr !== weekStartDateStr) {
        const nextWeekEnd = new Date(nextMonday);
        nextWeekEnd.setDate(nextMonday.getDate() + 7);
        
        const { data: nextWeekBlocks } = await supabaseAdmin
          .from('blocks')
          .select('id')
          .eq('user_id', userId)
          .gte('scheduled_at', nextMonday.toISOString())
          .lt('scheduled_at', nextWeekEnd.toISOString())
          .limit(1);

        // Only save to next week if it has no blocks
        if (!nextWeekBlocks || nextWeekBlocks.length === 0) {
          // Check if week_time_preferences table exists
          const { error: tableCheckError } = await supabaseAdmin
            .from('week_time_preferences')
            .select('id')
            .limit(0);
          
          if (!tableCheckError) {
            // Table exists, save per-week preferences for next week
            const { data: existingNextWeekPref } = await supabaseAdmin
              .from('week_time_preferences')
              .select('id')
              .eq('user_id', userId)
              .eq('week_start_date', nextWeekStartDateStr)
              .maybeSingle();

            const nextWeekPrefData = {
              weekday_earliest_time: formatTimeForDB(timePreferences.weekdayEarliest),
              weekday_latest_time: formatTimeForDB(timePreferences.weekdayLatest),
              weekend_earliest_time: formatTimeForDB(timePreferences.weekendEarliest),
              weekend_latest_time: formatTimeForDB(timePreferences.weekendLatest),
              use_same_weekend_times: timePreferences.useSameWeekendTimes !== false,
              updated_at: new Date().toISOString()
            };

            if (existingNextWeekPref) {
              // Update existing
              await supabaseAdmin
                .from('week_time_preferences')
                .update(nextWeekPrefData)
                .eq('id', existingNextWeekPref.id)
                .eq('user_id', userId);
            } else {
              // Insert new
              await supabaseAdmin
                .from('week_time_preferences')
                .insert({
                  user_id: userId,
                  week_start_date: nextWeekStartDateStr,
                  ...nextWeekPrefData
                });
            }
            
            console.log(`✅ Also applied time preferences to next upcoming week: ${nextWeekStartDateStr}`);
          }
        } else {
          console.log(`ℹ️ Next week (${nextWeekStartDateStr}) already has blocks, skipping per-week preference save`);
        }
      }
    } else {
      // No weekStartDate provided - update global user time preferences AND apply to next upcoming week
      // Format time strings to TIME format (HH:MM:SS)
      const formatTimeForDB = (timeStr) => {
        if (!timeStr) return null;
        // If already in HH:MM:SS format, return as is
        if (timeStr.split(':').length === 3) return timeStr;
        // If in HH:MM format, add seconds
        if (timeStr.split(':').length === 2) return `${timeStr}:00`;
        return timeStr;
      };

      const updateData = {
        weekday_earliest_time: formatTimeForDB(timePreferences.weekdayEarliest),
        weekday_latest_time: formatTimeForDB(timePreferences.weekdayLatest),
        weekend_earliest_time: formatTimeForDB(timePreferences.weekendEarliest),
        weekend_latest_time: formatTimeForDB(timePreferences.weekendLatest),
        use_same_weekend_times: timePreferences.useSameWeekendTimes !== false
      };

      // Update global preferences
      const { error: userUpdateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (userUpdateError) {
        console.error('Error updating user time preferences:', userUpdateError);
        return NextResponse.json(
          { error: "Failed to save time preferences" },
          { status: 500 }
        );
      }

      // Also save to next upcoming week (if no blocks exist yet)
      const nextMonday = getNextMonday();
      const nextWeekStartDateStr = nextMonday.toISOString().split('T')[0];

      // Check if next week has blocks
      const weekEnd = new Date(nextMonday);
      weekEnd.setDate(nextMonday.getDate() + 7);
      
      const { data: nextWeekBlocks } = await supabaseAdmin
        .from('blocks')
        .select('id')
        .eq('user_id', userId)
        .gte('scheduled_at', nextMonday.toISOString())
        .lt('scheduled_at', weekEnd.toISOString())
        .limit(1);

      // Only save to next week if it has no blocks
      if (!nextWeekBlocks || nextWeekBlocks.length === 0) {
        // Check if week_time_preferences table exists
        const { error: tableCheckError } = await supabaseAdmin
          .from('week_time_preferences')
          .select('id')
          .limit(0);
        
        if (!tableCheckError) {
          // Table exists, save per-week preferences for next week
          const { data: existingWeekPref } = await supabaseAdmin
            .from('week_time_preferences')
            .select('id')
            .eq('user_id', userId)
            .eq('week_start_date', nextWeekStartDateStr)
            .maybeSingle();

          const weekPrefData = {
            ...updateData,
            updated_at: new Date().toISOString()
          };

          if (existingWeekPref) {
            // Update existing
            await supabaseAdmin
              .from('week_time_preferences')
              .update(weekPrefData)
              .eq('id', existingWeekPref.id)
              .eq('user_id', userId);
          } else {
            // Insert new
            await supabaseAdmin
              .from('week_time_preferences')
              .insert({
                user_id: userId,
                week_start_date: nextWeekStartDateStr,
                ...weekPrefData
              });
          }
          
          console.log(`✅ Applied time preferences to next upcoming week: ${nextWeekStartDateStr}`);
        }
      } else {
        console.log(`ℹ️ Next week (${nextWeekStartDateStr}) already has blocks, skipping per-week preference save`);
      }
    }

    // Delete existing unavailable times only within the date range we're updating
    // This preserves blocked times from onboarding that are outside weeks 0-3
    if (blockedTimes.length > 0) {
      try {
        // Get the date range of blocked times we're saving
        const dates = blockedTimes
          .map(bt => {
            const date = new Date(bt.start);
            if (isNaN(date.getTime())) {
              console.warn('⚠️ Invalid date in blocked time:', bt.start);
              return null;
            }
            return date;
          })
          .filter(d => d !== null);
        
        if (dates.length === 0) {
          console.error('❌ No valid dates found in blockedTimes');
          return NextResponse.json(
            { error: "Invalid date format in blocked times" },
            { status: 400 }
          );
        }
        
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        maxDate.setDate(maxDate.getDate() + 1); // Include end date
        
        console.log('🗑️ Deleting unavailable times in range:', {
          minDate: minDate.toISOString(),
          maxDate: maxDate.toISOString(),
          blockedTimesCount: blockedTimes.length
        });
        
        // Only delete unavailable times within this date range
        const { error: deleteError } = await supabaseAdmin
          .from('unavailable_times')
          .delete()
          .eq('user_id', userId)
          .gte('start_datetime', minDate.toISOString())
          .lt('start_datetime', maxDate.toISOString());

        if (deleteError) {
          console.error('❌ Error deleting existing unavailable times:', deleteError);
          // Continue anyway - we'll try to insert new ones
        } else {
          console.log('✅ Successfully deleted unavailable times in range');
        }
      } catch (error) {
        console.error('❌ Error calculating date range for deletion:', error);
        // Continue anyway - we'll try to insert new ones
      }
    } else {
      // If no blocked times to save, don't delete anything (preserve existing)
      console.log('ℹ️ No blocked times to save, preserving existing unavailable times');
    }

    // Insert new unavailable times (if any)
    if (blockedTimes.length > 0) {
      try {
        const unavailableEntries = blockedTimes
          .map(blocked => {
            // Validate dates
            const startDate = new Date(blocked.start);
            const endDate = new Date(blocked.end);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              console.warn('⚠️ Invalid date in blocked time:', blocked);
              return null;
            }
            
            const entry = {
              user_id: userId,
              start_datetime: startDate.toISOString(),
              end_datetime: endDate.toISOString(),
              reason: blocked.reason || null
            };
            
            return entry;
          })
          .filter(entry => entry !== null); // Remove invalid entries

        if (unavailableEntries.length === 0) {
          console.error('❌ No valid entries to insert after validation');
          return NextResponse.json(
            { error: "No valid blocked times to save" },
            { status: 400 }
          );
        }

        console.log(`💾 Inserting ${unavailableEntries.length} unavailable time entries...`);
        console.log('Sample entry:', unavailableEntries[0]);
        
        // Insert unavailable times
        const { data: insertedData, error: insertError } = await supabaseAdmin
          .from('unavailable_times')
          .insert(unavailableEntries)
          .select();

        if (insertError) {
          console.error('❌ Error saving unavailable times:', insertError);
          console.error('Error code:', insertError.code);
          console.error('Error message:', insertError.message);
          console.error('Error details:', insertError.details);
          console.error('Error hint:', insertError.hint);
          console.error('Failed entries (first 3):', unavailableEntries.slice(0, 3));
          
          return NextResponse.json(
            { error: "Failed to save unavailable times", details: insertError.message || insertError.details || insertError.hint || 'Unknown error' },
            { status: 500 }
          );
        }
        
        console.log(`✅ Successfully saved ${insertedData?.length || unavailableEntries.length} unavailable time entries`);
        
        // Check for conflicts with existing scheduled blocks and reschedule them
        rescheduleResultForResponse = await rescheduleConflictingBlocks(userId, unavailableEntries);
        
      } catch (error) {
        console.error('❌ Unexpected error in insert block:', error);
        return NextResponse.json(
          { error: "Failed to save unavailable times", details: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Availability preferences saved",
      rescheduled: rescheduleResultForResponse?.rescheduled || 0,
      conflicts: rescheduleResultForResponse?.conflicts || 0,
      rescheduledDetails: rescheduleResultForResponse?.details || []
    });

  } catch (error) {
    console.error('Error saving availability:', error);
    return NextResponse.json(
      { error: "Failed to save availability preferences" },
      { status: 500 }
    );
  }
}

/**
 * Reschedule blocks that conflict with newly saved unavailable times
 * Uses cluster-aware rescheduling (same logic as mark-missed)
 */
async function rescheduleConflictingBlocks(userId, unavailableEntries) {
  if (!unavailableEntries || unavailableEntries.length === 0) {
    return;
  }

  try {
    // Get date range of unavailable times
    const dates = unavailableEntries.map(entry => new Date(entry.start_datetime));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    maxDate.setDate(maxDate.getDate() + 1); // Include end date

    // Find all scheduled blocks that overlap with unavailable times (with topic info)
    const { data: allBlocks } = await supabaseAdmin
      .from('blocks')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        topic_id,
        topics!inner(
          name,
          specs!inner(
            subject
          )
        )
      `)
      .eq('user_id', userId)
      .gte('scheduled_at', minDate.toISOString())
      .lt('scheduled_at', maxDate.toISOString())
      .in('status', ['scheduled', 'missed']);

    if (!allBlocks || allBlocks.length === 0) {
      console.log('ℹ️ No blocks found in date range to check for conflicts');
      return { rescheduled: 0, conflicts: 0 };
    }

    // Check for overlaps
    const conflictingBlocks = [];
    const blockedIntervals = unavailableEntries.map(entry => ({
      start: new Date(entry.start_datetime),
      end: new Date(entry.end_datetime)
    }));

    function overlaps(blockStart, blockEnd, intervals) {
      return intervals.some(({ start, end }) => blockStart < end && blockEnd > start);
    }

    allBlocks.forEach(block => {
      const blockStart = new Date(block.scheduled_at);
      const blockEnd = new Date(blockStart.getTime() + (block.duration_minutes || 30) * 60 * 1000);
      
      if (overlaps(blockStart, blockEnd, blockedIntervals)) {
        conflictingBlocks.push(block);
      }
    });

    if (conflictingBlocks.length === 0) {
      console.log('✅ No conflicts found with scheduled blocks');
      return { rescheduled: 0, conflicts: 0 };
    }

    console.log(`⚠️ Found ${conflictingBlocks.length} conflicting block(s), rescheduling...`);

    // Get user preferences for rescheduling
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
      .eq('id', userId)
      .single();

    if (!user) {
      console.warn('⚠️ User preferences not found, cannot reschedule conflicts');
      return { rescheduled: 0, conflicts: conflictingBlocks.length };
    }

    // Get all existing blocks for cluster-aware rescheduling (3-day window)
    const searchEnd = new Date(maxDate);
    searchEnd.setDate(maxDate.getDate() + 3); // 3-day search window

    const { data: existingBlocks } = await supabaseAdmin
      .from('blocks')
      .select('id, scheduled_at, duration_minutes')
      .eq('user_id', userId)
      .gte('scheduled_at', minDate.toISOString())
      .lt('scheduled_at', searchEnd.toISOString())
      .in('status', ['scheduled', 'done']);

    // Get all blocked times (including the newly saved ones)
    const { data: allBlockedTimes } = await supabaseAdmin
      .from('unavailable_times')
      .select('start_datetime, end_datetime')
      .eq('user_id', userId)
      .gte('start_datetime', minDate.toISOString())
      .lt('end_datetime', searchEnd.toISOString());

    const blockedTimesForReschedule = (allBlockedTimes || []).map(bt => ({
      start: bt.start_datetime,
      end: bt.end_datetime
    }));

    // Reschedule each conflicting block
    let rescheduledCount = 0;
    const rescheduledDetails = []; // Track details for each rescheduled block
    
    for (const conflictBlock of conflictingBlocks) {
      const conflictTime = new Date(conflictBlock.scheduled_at);
      // Handle both single topic object and array (Supabase can return either)
      const topic = Array.isArray(conflictBlock.topics) ? conflictBlock.topics[0] : conflictBlock.topics;
      const topicName = topic?.name || 'Unknown Topic';
      const subject = Array.isArray(topic?.specs) ? topic.specs[0]?.subject : topic?.specs?.subject || 'Unknown Subject';
      
      // Use the same cluster-aware rescheduling logic
      // Exclude the conflicting block itself from existing blocks
      const otherBlocks = (existingBlocks || []).filter(b => b.id !== conflictBlock.id);
      
      const newSlot = findEarliestBufferSlot({
        conflictTime,
        userPreferences: user,
        existingBlocks: otherBlocks,
        blockedTimes: blockedTimesForReschedule,
        blockDuration: (conflictBlock.duration_minutes || 30) / 60
      });

      if (newSlot) {
        // Update the block to the new time
        const { error: updateError } = await supabaseAdmin
          .from('blocks')
          .update({
            scheduled_at: newSlot.toISOString(),
            status: 'scheduled' // Reset to scheduled if it was missed
          })
          .eq('id', conflictBlock.id)
          .eq('user_id', userId);

        if (updateError) {
          console.error(`❌ Failed to reschedule block ${conflictBlock.id}:`, updateError);
        } else {
          console.log(`✅ Rescheduled block ${conflictBlock.id} from ${conflictTime.toISOString()} to ${newSlot.toISOString()}`);
          rescheduledCount++;
          
          // Store reschedule details
          rescheduledDetails.push({
            blockId: conflictBlock.id,
            topicName,
            subject,
            oldTime: conflictTime.toISOString(),
            newTime: newSlot.toISOString(),
            duration: conflictBlock.duration_minutes || 30
          });
        }
      } else {
        // Mark as missed if no slot found
        const { error: updateError } = await supabaseAdmin
          .from('blocks')
          .update({ status: 'missed' })
          .eq('id', conflictBlock.id)
          .eq('user_id', userId);

        if (updateError) {
          console.error(`❌ Failed to mark block ${conflictBlock.id} as missed:`, updateError);
        } else {
          console.log(`⚠️ No slot found for block ${conflictBlock.id}, marked as missed`);
          
          // Store missed block details
          rescheduledDetails.push({
            blockId: conflictBlock.id,
            topicName,
            subject,
            oldTime: conflictTime.toISOString(),
            newTime: null, // No new time - marked as missed
            duration: conflictBlock.duration_minutes || 30,
            markedAsMissed: true
          });
        }
      }
    }

    console.log(`✅ Rescheduled ${rescheduledCount} out of ${conflictingBlocks.length} conflicting blocks`);
    return { 
      rescheduled: rescheduledCount, 
      conflicts: conflictingBlocks.length,
      details: rescheduledDetails
    };
  } catch (error) {
    console.error('❌ Error rescheduling conflicting blocks:', error);
    // Don't fail the whole request if rescheduling fails
    return { rescheduled: 0, conflicts: conflictingBlocks?.length || 0 };
  }
}

/**
 * Find earliest available slot for rescheduling (cluster-aware, 3-day window)
 * Reuses the same logic from mark-missed route
 */
function findEarliestBufferSlot({ conflictTime, userPreferences, existingBlocks, blockedTimes, blockDuration }) {
  const durationMinutes = Math.round((blockDuration || 0.5) * 60);
  
  // Create a set of occupied slots (existing blocks)
  const occupiedSlots = new Set();
  const existingBlockTimes = [];
  (existingBlocks || []).forEach(block => {
    const start = new Date(block.scheduled_at);
    const end = new Date(start.getTime() + (block.duration_minutes || 30) * 60 * 1000);
    existingBlockTimes.push({ start, end });
    
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
  
  // Create blocked intervals
  const blockedIntervals = (blockedTimes || []).map(range => ({
    start: new Date(range.start),
    end: new Date(range.end)
  }));

  function overlaps(slotStart, slotEnd, intervals) {
    return intervals.some(({ start, end }) => slotStart < end && slotEnd > start);
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

  // Check if placing a block at this slot would create a cluster of 4+ blocks
  // Returns true if the cluster would be too large (should skip this slot)
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

    // Sort blocks by time
    const allBlocks = [...sameDayBlocks, { start: slotStart, end: slotEnd }].sort((a, b) => 
      a.start.getTime() - b.start.getTime()
    );

    // Find consecutive blocks (gaps <= 30 minutes = same cluster)
    let currentCluster = [];
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
    return maxClusterSize >= 4;
  }

  function parseTimeToMinutes(timeString = '00:00') {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Limit search to same day + next 2 days (3 days total)
  const conflictDay = new Date(conflictTime);
  conflictDay.setHours(0, 0, 0, 0);
  const searchEndDate = new Date(conflictDay);
  searchEndDate.setDate(conflictDay.getDate() + 3);
  console.log(`📅 Reschedule search range: ${conflictDay.toISOString()} to ${searchEndDate.toISOString()}`);

  const adjacentSlots = [];
  const nearSlots = [];
  const isolatedSlots = [];

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const currentDay = new Date(conflictDay);
    currentDay.setDate(conflictDay.getDate() + dayOffset);
    if (currentDay < conflictDay || currentDay >= searchEndDate) continue;

    const dayIndex = currentDay.getDay();
    const isWeekend = dayIndex >= 5;
    const weekendSplit = userPreferences.use_same_weekend_times === false;

    const earliestStr = isWeekend && weekendSplit
      ? userPreferences.weekend_earliest_time || '08:00'
      : userPreferences.weekday_earliest_time || '04:30';

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

      if (slotStart <= conflictTime) continue;

      const dateStr = slotStart.toISOString().split('T')[0];
      const hours = slotStart.getUTCHours().toString().padStart(2, '0');
      const minutesStr = slotStart.getUTCMinutes().toString().padStart(2, '0');
      const slotKey = `${dateStr}T${hours}:${minutesStr}:00`;
      if (occupiedSlots.has(slotKey)) continue;
      if (overlaps(slotStart, slotEnd, blockedIntervals)) continue;

      // Skip slots that would create oversized clusters (4+ blocks)
      if (wouldCreateOversizedCluster(slotStart, slotEnd)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠️ Skipping slot ${slotStart.toISOString()} - would create oversized cluster`);
        }
        continue;
      }

      if (isAdjacentToBlock(slotStart, slotEnd)) {
        adjacentSlots.push(slotStart);
      } else if (isNearBlock(slotStart, slotEnd)) {
        nearSlots.push(slotStart);
      } else {
        isolatedSlots.push(slotStart);
      }
    }
  }

  if (adjacentSlots.length > 0) {
    console.log(`✅ Found ${adjacentSlots.length} adjacent slot(s) - will form cluster`);
    return adjacentSlots[0];
  }
  if (nearSlots.length > 0) {
    console.log(`✅ Found ${nearSlots.length} near slot(s) - potential cluster`);
    return nearSlots[0];
  }
  if (isolatedSlots.length > 0) {
    console.log(`⚠️ Only found ${isolatedSlots.length} isolated slot(s) - no cluster possible`);
    return isolatedSlots[0];
  }

  console.log(`❌ No buffer slot found`);
  return null;
}

/**
 * Get availability preferences and unavailable times
 * GET /api/availability/save
 */
export async function GET(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get query params
    const { searchParams } = new URL(req.url);
    const weekStartDate = searchParams.get('weekStartDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Get user time preferences (default/global)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
      .eq('id', userId)
      .single();

    if (userError) {
      return NextResponse.json(
        { error: "Failed to load preferences" },
        { status: 500 }
      );
    }

    // Helper to convert HH:MM:SS to HH:MM format (for input fields)
    const formatTimeForInput = (timeString) => {
      if (!timeString) return null;
      // If already in HH:MM format, return as is
      if (timeString.split(':').length === 2) return timeString;
      // If in HH:MM:SS format, remove seconds
      if (timeString.split(':').length === 3) {
        const [hours, minutes] = timeString.split(':');
        return `${hours}:${minutes}`;
      }
      return timeString;
    };

    // Get unavailable times (optional: provide date range)

    let unavailableQuery = supabaseAdmin
      .from('unavailable_times')
      .select('*')
      .eq('user_id', userId)
      .order('start_datetime', { ascending: true });

    if (startDate) {
      unavailableQuery = unavailableQuery.gte('start_datetime', startDate);
    }
    if (endDate) {
      unavailableQuery = unavailableQuery.lte('start_datetime', endDate);
    }

    const { data: unavailableTimes, error: unavailableError } = await unavailableQuery;

    if (unavailableError) {
      console.error('Error loading unavailable times:', unavailableError);
    }

    // If weekStartDate is provided, check for per-week preferences and if week is scheduled
    let isScheduled = false;
    let weekPreferences = null;
    if (weekStartDate) {
      const weekStart = new Date(weekStartDate);
      const weekStartDateStr = weekStart.toISOString().split('T')[0];
      
      const { data: weekPrefs, error: weekPrefError } = await supabaseAdmin
        .from('week_time_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDateStr)
        .maybeSingle();

      if (weekPrefError) {
        console.error('Error loading week preferences:', weekPrefError);
        // Continue with global preferences
      } else if (weekPrefs) {
        weekPreferences = weekPrefs;
      }

      // Check if the week has scheduled blocks
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      
      const { data: existingBlocks } = await supabaseAdmin
        .from('blocks')
        .select('id')
        .eq('user_id', userId)
        .gte('scheduled_at', weekStart.toISOString())
        .lt('scheduled_at', weekEnd.toISOString())
        .limit(1);

      isScheduled = existingBlocks && existingBlocks.length > 0;
    }

    // Return time preferences (per-week if available, otherwise global)
    const timePrefs = weekPreferences ? {
      weekdayEarliest: formatTimeForInput(weekPreferences.weekday_earliest_time) || formatTimeForInput(user.weekday_earliest_time) || '4:30',
      weekdayLatest: formatTimeForInput(weekPreferences.weekday_latest_time) || formatTimeForInput(user.weekday_latest_time) || '23:30',
      weekendEarliest: formatTimeForInput(weekPreferences.weekend_earliest_time) || formatTimeForInput(user.weekend_earliest_time) || '8:00',
      weekendLatest: formatTimeForInput(weekPreferences.weekend_latest_time) || formatTimeForInput(user.weekend_latest_time) || '23:30',
      useSameWeekendTimes: weekPreferences && weekPreferences.use_same_weekend_times !== undefined ? weekPreferences.use_same_weekend_times : (user.use_same_weekend_times !== false)
    } : {
      weekdayEarliest: formatTimeForInput(user.weekday_earliest_time) || '4:30',
      weekdayLatest: formatTimeForInput(user.weekday_latest_time) || '23:30',
      weekendEarliest: formatTimeForInput(user.weekend_earliest_time) || '8:00',
      weekendLatest: formatTimeForInput(user.weekend_latest_time) || '23:30',
      useSameWeekendTimes: user.use_same_weekend_times !== false
    };

    return NextResponse.json({
      success: true,
      timePreferences: timePrefs,
      isScheduled: isScheduled,
      blockedTimes: (unavailableTimes || []).map(ut => ({
        start: ut.start_datetime,
        end: ut.end_datetime,
        reason: ut.reason,
        source: ut.source || null // Ensure source field exists (null for manual blocks)
      }))
    });

  } catch (error) {
    console.error('Error loading availability:', error);
    return NextResponse.json(
      { error: "Failed to load availability preferences" },
      { status: 500 }
    );
  }
}


