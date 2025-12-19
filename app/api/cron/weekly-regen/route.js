import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/libs/supabase";
import { generateStudyPlan } from "@/libs/scheduler";

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function sanitizeBlockedTimes(blockedTimes = []) {
  return blockedTimes.map((range) => ({
    start: range.start,
    end: range.end,
    label: range.label || null,
    source: range.source || null,
    metadata: range.metadata || null,
    event_id: range.event_id || null
  }));
}

function dedupeBlockedTimes(blockedTimes = []) {
  const seen = new Set();
  return blockedTimes.filter((range) => {
    const key = `${range.start}|${range.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toDatabaseRows(blocks, userId) {
  return blocks
    .filter((block) => block.topic_id !== null) // Skip break blocks
    .map((block) => ({
      user_id: userId,
      topic_id: block.topic_id,
      scheduled_at: block.scheduled_at,
      duration_minutes: block.duration_minutes,
      status: 'scheduled',
      ai_rationale: block.ai_rationale ?? null
    }));
}

async function loadBlockedTimes(userId, startDate, endDate) {
  try {
    const { data, error } = await supabaseAdmin
      .from('unavailable_times')
      .select('start_datetime, end_datetime')
      .eq('user_id', userId)
      .lt('start_datetime', endDate.toISOString())
      .gt('end_datetime', startDate.toISOString());

    if (error) {
      console.error('Failed to load unavailable times:', error);
      return [];
    }

    return (data || []).map((row) => ({
      start: row.start_datetime,
      end: row.end_datetime
    }));
  } catch (error) {
    console.error('Unavailable times fetch exception:', error);
    return [];
  }
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

    for (let offset = 0; offset < 7; offset += 1) {
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
    console.error('Repeatable events processing error:', error);
    return [];
  }
}

/**
 * Calculate availability (hours per day) from time preferences and blocked times.
 * Matches frontend logic from slide-22/page.js but uses target week dates.
 * 
 * @param {Object} timePreferences - { weekdayEarliest, weekdayLatest, weekendEarliest, weekendLatest, useSameWeekendTimes }
 * @param {Array} blockedTimes - Array of { start: ISO string, end: ISO string }
 * @param {string} targetWeekStart - ISO date string (YYYY-MM-DD) for Monday of target week
 * @returns {Object} - { monday: hours, tuesday: hours, ..., sunday: hours }
 */
function calculateAvailabilityFromPreferences(timePreferences, blockedTimes = [], targetWeekStart) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const availability = {};
  
  // Parse target week start date (Monday)
  const targetMonday = new Date(`${targetWeekStart}T00:00:00Z`);
  
  days.forEach((day, dayIndex) => {
    // Determine if it's a weekday or weekend
    const isWeekend = dayIndex >= 5; // Saturday (5) or Sunday (6)
    
    // Get earliest/latest times based on preferences
    let earliest, latest;
    if (isWeekend && !timePreferences.useSameWeekendTimes) {
      earliest = timePreferences.weekendEarliest || '08:00';
      latest = timePreferences.weekendLatest || '23:30';
    } else {
      earliest = timePreferences.weekdayEarliest || '08:00';
      latest = timePreferences.weekdayLatest || '21:00';
    }
    
    // Parse times to minutes
    const [earliestHour, earliestMin] = earliest.split(':').map(Number);
    const [latestHour, latestMin] = latest.split(':').map(Number);
    
    const earliestMinutes = earliestHour * 60 + earliestMin;
    const latestMinutes = latestHour * 60 + latestMin;
    const totalMinutes = latestMinutes - earliestMinutes;
    
    // Calculate the date for this day in the target week
    const dayDate = new Date(targetMonday);
    dayDate.setUTCDate(targetMonday.getUTCDate() + dayIndex);
    dayDate.setUTCHours(0, 0, 0, 0);
    
    // Count blocked minutes for this day
    let blockedMinutes = 0;
    blockedTimes.forEach(blocked => {
      const blockedStart = new Date(blocked.start);
      const blockedEnd = new Date(blocked.end);
      
      // Check if blocked time falls on this day (compare UTC date components)
      const blockedStartYear = blockedStart.getUTCFullYear();
      const blockedStartMonth = blockedStart.getUTCMonth();
      const blockedStartDate = blockedStart.getUTCDate();
      const dayYear = dayDate.getUTCFullYear();
      const dayMonth = dayDate.getUTCMonth();
      const dayDateNum = dayDate.getUTCDate();
      
      if (blockedStartYear === dayYear && 
          blockedStartMonth === dayMonth && 
          blockedStartDate === dayDateNum) {
        const blockedStartMinutes = blockedStart.getUTCHours() * 60 + blockedStart.getUTCMinutes();
        const blockedEndMinutes = blockedEnd.getUTCHours() * 60 + blockedEnd.getUTCMinutes();
        
        // Calculate overlap with available time window
        const overlapStart = Math.max(earliestMinutes, blockedStartMinutes);
        const overlapEnd = Math.min(latestMinutes, blockedEndMinutes);
        
        if (overlapStart < overlapEnd) {
          blockedMinutes += overlapEnd - overlapStart;
        }
      }
    });
    
    // Calculate available hours (total - blocked) / 60
    const availableMinutes = totalMinutes - blockedMinutes;
    availability[day] = Math.max(0, availableMinutes / 60); // Convert to hours
  });
  
  return availability;
}

export async function GET(req) {
  try {
    // Verify this is a cron request (optional: add secret header check)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TEST MODE: Test availability function with mock data
    const testMode = req.nextUrl.searchParams.get('test') === 'true';
    if (testMode) {
      const mockTimePreferences = {
        weekdayEarliest: '08:00',
        weekdayLatest: '21:00',
        weekendEarliest: '10:00',
        weekendLatest: '18:00',
        useSameWeekendTimes: false
      };
      
      const mockBlockedTimes = [
        {
          start: '2024-01-15T12:00:00Z', // Monday 12:00
          end: '2024-01-15T13:00:00Z'   // Monday 13:00 (1 hour blocked)
        },
        {
          start: '2024-01-16T14:00:00Z', // Tuesday 14:00
          end: '2024-01-16T16:00:00Z'   // Tuesday 16:00 (2 hours blocked)
        }
      ];
      
      const nextWeekStart = new Date();
      nextWeekStart.setDate(nextWeekStart.getDate() + (8 - nextWeekStart.getDay())); // Next Monday
      const nextWeekStartStr = nextWeekStart.toISOString().split('T')[0];
      
      const testAvailability = calculateAvailabilityFromPreferences(
        mockTimePreferences,
        mockBlockedTimes,
        nextWeekStartStr
      );
      
      return NextResponse.json({
        success: true,
        test: true,
        nextWeekStart: nextWeekStartStr,
        timePreferences: mockTimePreferences,
        blockedTimes: mockBlockedTimes,
        availability: testAvailability,
        totalHours: Object.values(testAvailability).reduce((sum, h) => sum + h, 0).toFixed(1)
      });
    }

    // Get all users who have completed onboarding
    // TEST MODE: Use dev user if specified
    const testUserId = req.nextUrl.searchParams.get('testUserId');
    let usersQuery = supabaseAdmin
      .from('users')
      .select('id');
    
    if (testUserId) {
      // Test with specific user (bypass onboarding check for testing)
      usersQuery = usersQuery.eq('id', testUserId);
      console.log(`🧪 TEST MODE: Using test user ${testUserId}`);
    } else {
      usersQuery = usersQuery.eq('has_completed_onboarding', true);
    }
    
    const { data: users, error: usersError } = await usersQuery;

    if (usersError) {
      console.error('Failed to fetch users:', usersError);
      return NextResponse.json({ 
        error: "Failed to fetch users",
        details: usersError.message 
      }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No users with completed onboarding found" 
      });
    }

    // Calculate next week start (Monday)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = getMonday(today);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 7);
    const nextWeekStart = new Date(currentWeekStart);
    nextWeekStart.setDate(currentWeekStart.getDate() + 7); // Next Monday
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 7);

    const nextWeekStartStr = nextWeekStart.toISOString().split('T')[0];

    console.log(`📅 Generating plans for next week: ${nextWeekStartStr} (${users.length} users)`);

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // Generate plans for all users
    for (const user of users) {
      const userId = user.id;
      try {
        // Load user onboarding data
        const { data: userData, error: userDataError } = await supabaseAdmin
          .from('users')
          .select('onboarding_data, weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
          .eq('id', userId)
          .single();

        if (userDataError || !userData) {
          console.warn(`⚠️ User ${userId}: Failed to load user data, skipping`);
          console.warn(`   Error:`, userDataError);
          results.skipped++;
          continue;
        }
        
        console.log(`✅ User ${userId}: User data loaded successfully`);

        const onboardingData = userData.onboarding_data || {};
        const selectedSubjects = onboardingData.selectedSubjects || [];
        const subjectBoards = onboardingData.subjectBoards || {};

        // In development, use default subjects if none selected
        if (selectedSubjects.length === 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔧 Dev mode: Using default subjects for user ${userId}`);
            selectedSubjects.push('maths', 'biology'); // Default subjects for testing
          } else {
            console.warn(`⚠️ User ${userId}: No subjects selected, skipping`);
            results.skipped++;
            continue;
          }
        }

        // Convert subjects to scheduler format
        const subjectMapping = {
          'maths': 'Mathematics',
          'psychology': 'Psychology',
          'biology': 'Biology',
          'chemistry': 'Chemistry',
          'business': 'Business',
          'sociology': 'Sociology',
          'physics': 'Physics',
          'economics': 'Economics',
          'history': 'History',
          'geography': 'Geography',
          'computerscience': 'Computer Science'
        };

        const subjects = selectedSubjects.map(subj => {
          const dbSubject = subjectMapping[subj] || subj;
          const board = subjectBoards[subj];
          return board ? `${dbSubject} ${board.toUpperCase()}` : dbSubject;
        });

        // Load topic ratings
        const { data: ratingsData } = await supabaseAdmin
          .from('user_topic_confidence')
          .select('topic_id, rating')
          .eq('user_id', userId);

        const ratings = {};
        (ratingsData || []).forEach(r => {
          ratings[r.topic_id] = r.rating;
        });

        // Load time preferences
        const formatTime = (timeStr) => {
          if (!timeStr) return null;
          return timeStr.substring(0, 5); // Extract HH:MM from HH:MM:SS
        };

        const timePreferences = {
          weekdayEarliest: formatTime(userData.weekday_earliest_time) || '08:00',
          weekdayLatest: formatTime(userData.weekday_latest_time) || '21:00',
          weekendEarliest: formatTime(userData.weekend_earliest_time) || '08:00',
          weekendLatest: formatTime(userData.weekend_latest_time) || '21:00',
          useSameWeekendTimes: userData.use_same_weekend_times !== false
        };

        // Load blocked times for next week
        const unavailableTimes = await loadBlockedTimes(userId, nextWeekStart, nextWeekEnd);
        const repeatableEvents = await loadRepeatableEvents(userId, nextWeekStart, nextWeekEnd);

        // IMPORTANT: We no longer copy one-off blocked times from current week
        // Only use times that are specifically set for next week + repeatable events
        // Users are prompted via the ConfirmAvailabilityBanner to set their availability for next week
        if (unavailableTimes.length === 0) {
          console.log(`📅 User ${userId}: No unavailable times set for next week - using only repeatable events and time preferences`);
          // Don't copy current week's unavailable times - they were one-off events
          // The user should set next week's availability separately via the confirmation flow
        }

        const blockedTimes = dedupeBlockedTimes(
          sanitizeBlockedTimes([
            ...unavailableTimes,
            ...repeatableEvents
          ])
        );

        // Calculate availability from time preferences and blocked times
        const availability = calculateAvailabilityFromPreferences(
          timePreferences,
          blockedTimes,
          nextWeekStartStr
        );
        console.log(`📊 User ${userId}: Availability calculated:`, availability);
        console.log(`📊 User ${userId}: Total weekly hours:`, 
          Object.values(availability).reduce((sum, h) => sum + h, 0).toFixed(1));
        console.log(`📊 User ${userId}: Blocked times count:`, blockedTimes.length);

        // Load ongoing topics (topics with incomplete spaced repetition sequences)
        const { data: ongoingBlocks } = await supabaseAdmin
          .from('blocks')
          .select('topic_id, scheduled_at, ai_rationale')
          .eq('user_id', userId)
          .lt('scheduled_at', currentWeekEnd.toISOString())
          .in('status', ['scheduled', 'done']); // Blocks that were scheduled or completed

        const ongoingTopics = {};
        if (ongoingBlocks) {
          const topicMap = new Map(); // Track highest session number per topic
          
          ongoingBlocks.forEach(block => {
            if (!block.topic_id || !block.ai_rationale) return;
            
            try {
              const rationale = typeof block.ai_rationale === 'string' 
                ? JSON.parse(block.ai_rationale) 
                : block.ai_rationale;
              
              if (rationale && rationale.version === 'spaced_repetition_v1' && 
                  rationale.sessionNumber && rationale.sessionTotal) {
                const topicId = block.topic_id;
                const sessionNumber = rationale.sessionNumber;
                const sessionTotal = rationale.sessionTotal;
                
                // Track the highest session number and latest date for this topic
                if (!topicMap.has(topicId) || topicMap.get(topicId).sessionNumber < sessionNumber) {
                  topicMap.set(topicId, {
                    sessionsScheduled: sessionNumber,
                    sessionsRequired: sessionTotal,
                    lastSessionDate: new Date(block.scheduled_at)
                  });
                }
              }
            } catch (e) {
              // Not valid JSON, skip
            }
          });
          
          // Only include topics that are incomplete (sessionsScheduled < sessionsRequired)
          topicMap.forEach((state, topicId) => {
            if (state.sessionsScheduled < state.sessionsRequired) {
              ongoingTopics[topicId] = state;
            }
          });
        }

        // Generate plan for next week
        const plan = await generateStudyPlan({
          subjects,
          ratings,
          topicStatus: {},
          availability: availability, // Use calculated availability
          timePreferences,
          blockedTimes,
          studyBlockDuration: 0.5,
          targetWeekStart: nextWeekStartStr,
          missedTopicIds: [], // No missed topics - handled within week via real-time rescheduling
          ongoingTopics // Pass ongoing topic states
        });

        if (!plan || plan.length === 0) {
          console.warn(`⚠️ User ${userId}: Generated plan is empty`);
          results.skipped++;
          continue;
        }

        // Delete existing blocks for the target week only (avoid touching previous Sunday)
        await supabaseAdmin
          .from('blocks')
          .delete()
          .eq('user_id', userId)
          .gte('scheduled_at', nextWeekStart.toISOString())
          .lt('scheduled_at', nextWeekEnd.toISOString());

        // Save new blocks
        const records = toDatabaseRows(plan, userId);
        
        if (records.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from('blocks')
            .insert(records);

          if (insertError) {
            throw new Error(`Failed to insert blocks: ${insertError.message}`);
          }

          console.log(`✅ User ${userId}: Generated ${records.length} blocks for week ${nextWeekStartStr}`);
          results.success++;
        } else {
          results.skipped++;
        }

      } catch (error) {
        results.failed++;
        results.errors.push({
          user_id: userId,
          error: error.message
        });
        console.error(`❌ User ${userId}: Failed to generate plan - ${error.message}`);
      }
    }

    // Log the cron job execution
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: null, // System event
        event_type: 'cron_weekly_regen',
        event_data: {
          next_week_start: nextWeekStartStr,
          users_processed: users.length,
          success_count: results.success,
          failed_count: results.failed,
          skipped_count: results.skipped
        }
      });

    return NextResponse.json({
      success: true,
      message: `Weekly regeneration completed. Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
      results
    });
  } catch (error) {
    console.error("Weekly regeneration cron error:", error);
    return NextResponse.json(
      { error: error.message || "Weekly regeneration failed" },
      { status: 500 }
    );
  }
}


