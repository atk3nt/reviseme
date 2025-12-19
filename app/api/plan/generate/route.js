import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { generateStudyPlan } from "@/libs/scheduler";

// Spaced repetition fix: Track ongoing topics across weeks - v2
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

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function resolveTargetWeek({ targetWeek, signupDate }) {
  if (targetWeek) {
    return { weekStart: targetWeek, actualStartDate: targetWeek };
  }
  const base = signupDate ? new Date(signupDate) : new Date();
  base.setDate(base.getDate() + 1); // day after signup/current day
  base.setHours(0, 0, 0, 0);
  
  const actualStartDate = base.toISOString().split('T')[0];
  const weekStart = getMonday(base).toISOString().split('T')[0];
  
  return { weekStart, actualStartDate };
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
    .filter((block) => block.topic_id !== null) // Skip break blocks (they don't have topic_id)
    .map((block) => ({
      user_id: userId,
      topic_id: block.topic_id,
      scheduled_at: block.scheduled_at,
      duration_minutes: block.duration_minutes,
      status: 'scheduled',
      ai_rationale: block.ai_rationale ?? null,
      session_number: block.session_number ?? null,
      session_total: block.session_total ?? null
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

async function loadRatingsFromDatabase(userId) {
  try {
    const { data: ratingsData, error: ratingsError } = await supabaseAdmin
      .from('user_topic_confidence')
      .select('topic_id, rating')
      .eq('user_id', userId);

    if (ratingsError) {
      console.error('Error loading ratings from database:', ratingsError);
      return {};
    }

    // Convert array to object format { topicId: rating }
    const ratingsObj = {};
    (ratingsData || []).forEach(rating => {
      ratingsObj[rating.topic_id] = rating.rating;
    });

    console.log(`📊 Loaded ${Object.keys(ratingsObj).length} ratings from database`);
    return ratingsObj;
  } catch (error) {
    console.error('Exception loading ratings from database:', error);
    return {};
  }
}

/**
 * Load the last re-rating timestamp for each topic.
 * This is used to reset session counts when a topic has been re-rated.
 * Only blocks AFTER the last re-rating should count toward the new cycle.
 * 
 * @param {string} userId - The user's ID
 * @returns {Object} - Map of topicId -> { lastReratingDate: Date, newRating: number }
 */
async function loadLastReratingDates(userId) {
  try {
    const { data: reratingLogs, error } = await supabaseAdmin
      .from('logs')
      .select('event_data, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'topic_rerated')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading re-rating logs:', error);
      return {};
    }

    // Build map of topic -> most recent re-rating info
    // Since we order by created_at DESC, first occurrence is the most recent
    const reratingMap = {};
    (reratingLogs || []).forEach(log => {
      const topicId = log.event_data?.topic_id;
      if (topicId && !reratingMap[topicId]) {
        reratingMap[topicId] = {
          lastReratingDate: new Date(log.created_at),
          newRating: log.event_data?.rerating_score
        };
      }
    });

    console.log(`🔄 Loaded re-rating history for ${Object.keys(reratingMap).length} topics`);
    return reratingMap;
  } catch (error) {
    console.error('Exception loading re-rating dates:', error);
    return {};
  }
}

export async function POST(req) {
  console.log('🔥🔥🔥 POST /api/plan/generate called - NEW CODE VERSION 3 🔥🔥🔥');
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      subjects = [],
      ratings = {},
      topicStatus = {},
      availability = {},
      timePreferences = {},
      blockedTimes: rawBlockedTimes = [],
      unavailableTimes = [],
      studyBlockDuration = 0.5,
      targetWeek,
      signupDate = null
    } = body || {};

    const incomingBlockedTimes = Array.isArray(rawBlockedTimes) && rawBlockedTimes.length > 0
      ? rawBlockedTimes
      : Array.isArray(unavailableTimes)
        ? unavailableTimes
        : [];

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'At least one subject is required' }, { status: 400 });
    }

    const { weekStart: targetWeekStart, actualStartDate } = resolveTargetWeek({ targetWeek, signupDate });
    const weekStartDate = getMonday(new Date(`${targetWeekStart}T00:00:00Z`));
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 7);
    
    // For partial weeks (e.g., signup on Friday, start on Saturday), track when scheduling actually begins
    const schedulingStartDate = new Date(`${actualStartDate}T00:00:00Z`);
    const isPartialWeek = schedulingStartDate > weekStartDate;
    
    if (isPartialWeek) {
      console.log('📅 Partial week detected:', {
        weekStart: targetWeekStart,
        actualStart: actualStartDate,
        daysInWeek: Math.ceil((weekEndDate - schedulingStartDate) / (1000 * 60 * 60 * 24))
      });
    }

    // Load time preferences from database - REQUIRED, no defaults
    let effectiveTimePreferences = { ...timePreferences };
    
    // Always load from database to ensure we have the user's actual preferences
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
      .eq('id', userId)
      .single();
    
    if (userData) {
      // Format time from database (HH:MM:SS) to HH:MM for frontend
      const formatTime = (timeStr) => {
        if (!timeStr) return null;
        return timeStr.substring(0, 5); // Extract HH:MM from HH:MM:SS
      };
      
      // Check for per-week time preferences for the target week
      const weekStartDateStr = targetWeekStart;
      let weekPreferences = null;
      
      const { data: weekPrefs } = await supabaseAdmin
        .from('week_time_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDateStr)
        .maybeSingle();
      
      if (weekPrefs) {
        weekPreferences = weekPrefs;
        console.log('📅 Found per-week time preferences for week:', weekStartDateStr, weekPreferences);
      } else {
        console.log('📅 No per-week preferences found, using global preferences for week:', weekStartDateStr);
      }
      
      console.log('🔍 Database time preferences:', {
        weekday_earliest_time: userData.weekday_earliest_time,
        weekday_latest_time: userData.weekday_latest_time,
        weekend_earliest_time: userData.weekend_earliest_time,
        weekend_latest_time: userData.weekend_latest_time,
        use_same_weekend_times: userData.use_same_weekend_times,
        hasWeekPreferences: !!weekPreferences
      });
      
      // Use per-week preferences if available, otherwise use global preferences
      // NEVER use defaults - if database is missing values, that's an error
      const dbWeekdayEarliest = formatTime(
        weekPreferences?.weekday_earliest_time || userData.weekday_earliest_time
      );
      const dbWeekdayLatest = formatTime(
        weekPreferences?.weekday_latest_time || userData.weekday_latest_time
      );
      const dbWeekendEarliest = formatTime(
        weekPreferences?.weekend_earliest_time || userData.weekend_earliest_time
      );
      const dbWeekendLatest = formatTime(
        weekPreferences?.weekend_latest_time || userData.weekend_latest_time
      );
      
      const dbUseSameWeekendTimes = weekPreferences?.use_same_weekend_times !== undefined
        ? weekPreferences.use_same_weekend_times
        : (userData.use_same_weekend_times !== null ? userData.use_same_weekend_times : true);
      
      console.log('🔍 Formatted database times:', {
        dbWeekdayEarliest,
        dbWeekdayLatest,
        dbWeekendEarliest,
        dbWeekendLatest,
        dbUseSameWeekendTimes,
        source: weekPreferences ? 'per-week' : 'global'
      });
      
      effectiveTimePreferences = {
        weekdayEarliest: effectiveTimePreferences.weekdayEarliest || dbWeekdayEarliest,
        weekdayLatest: effectiveTimePreferences.weekdayLatest || dbWeekdayLatest,
        weekendEarliest: effectiveTimePreferences.weekendEarliest || dbWeekendEarliest,
        weekendLatest: effectiveTimePreferences.weekendLatest || dbWeekendLatest,
        useSameWeekendTimes: effectiveTimePreferences.useSameWeekendTimes !== undefined 
          ? effectiveTimePreferences.useSameWeekendTimes 
          : dbUseSameWeekendTimes
      };
      
      console.log('✅ Final effectiveTimePreferences:', effectiveTimePreferences);
      
      // Validate that we have required weekday times
      if (!effectiveTimePreferences.weekdayEarliest || !effectiveTimePreferences.weekdayLatest) {
        console.error('❌ Missing time preferences in database for user:', userId, {
          effectiveTimePreferences,
          userData,
          weekPreferences
        });
        return NextResponse.json({ 
          error: 'Time preferences are required. Please complete onboarding to set your study window.',
          success: false
        }, { status: 400 });
      }
    } else {
      // No user data found - this shouldn't happen but handle gracefully
      console.error('❌ User not found:', userId);
      return NextResponse.json({ 
        error: 'User not found',
        success: false
      }, { status: 404 });
    }

    console.log('API plan generate payload', {
      userId,
      subjectsCount: subjects.length,
      timePreferences: effectiveTimePreferences,
      blockedSample: incomingBlockedTimes.slice ? incomingBlockedTimes.slice(0, 5) : []
    });

    let effectiveBlockedTimes = incomingBlockedTimes;
    if (!effectiveBlockedTimes || effectiveBlockedTimes.length === 0) {
      effectiveBlockedTimes = await loadBlockedTimes(userId, weekStartDate, weekEndDate);
      
      // If no unavailable times found for target week, and we're generating for a future week,
      // fall back to current week's unavailable times (aligned to target week)
      if (effectiveBlockedTimes.length === 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentWeekStart = getMonday(today);
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekStart.getDate() + 7);
        
        // Check if target week is in the future
        const isFutureWeek = weekStartDate > currentWeekStart;
        
        if (isFutureWeek) {
          console.log('📅 No unavailable times for target week, using current week\'s times (aligned to target week)');
          const currentWeekUnavailable = await loadBlockedTimes(userId, currentWeekStart, currentWeekEnd);
          
          // Align current week blocked times to target week (by day of week)
          effectiveBlockedTimes = currentWeekUnavailable.map((range) => {
            const originalStart = new Date(range.start);
            const originalEnd = new Date(range.end);
            
            // Get day of week (0=Sunday, 1=Monday, etc.) and convert to Monday=0
            const dayIndex = (originalStart.getUTCDay() + 6) % 7; // Monday = 0
            
            // Align to target week's same day
            const alignedStart = new Date(weekStartDate);
            alignedStart.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
            alignedStart.setUTCHours(originalStart.getUTCHours(), originalStart.getUTCMinutes(), 0, 0);
            
            const alignedEnd = new Date(weekStartDate);
            alignedEnd.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
            alignedEnd.setUTCHours(originalEnd.getUTCHours(), originalEnd.getUTCMinutes(), 0, 0);
            
            if (alignedEnd <= alignedStart) {
              alignedEnd.setUTCDate(alignedEnd.getUTCDate() + 1);
            }
            
            return {
              start: alignedStart.toISOString(),
              end: alignedEnd.toISOString()
            };
          });
          
          console.log(`✅ Aligned ${effectiveBlockedTimes.length} unavailable times from current week to target week`);
        }
      }
    }

    const repeatableEvents = await loadRepeatableEvents(userId, weekStartDate, weekEndDate);
    const combinedBlockedTimes = dedupeBlockedTimes(
      sanitizeBlockedTimes([
        ...(effectiveBlockedTimes || []),
        ...repeatableEvents
      ])
    );

    // ALWAYS recalculate availability from database time preferences (ignore frontend calculation)
    // This ensures we always use the user's actual preferences from the database, not stale localStorage values
    console.log('📊 Recalculating availability from database time preferences (ignoring frontend availability)');
    console.log('📊 Using effectiveTimePreferences:', effectiveTimePreferences);
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let effectiveAvailability = {};
    
    days.forEach((day, dayIndex) => {
      const isWeekend = dayIndex >= 5;
      let earliest, latest;
      if (isWeekend && !effectiveTimePreferences.useSameWeekendTimes) {
        // Use weekend times if specified, otherwise fall back to weekday times
        earliest = effectiveTimePreferences.weekendEarliest || effectiveTimePreferences.weekdayEarliest;
        latest = effectiveTimePreferences.weekendLatest || effectiveTimePreferences.weekdayLatest;
      } else {
        // Always use weekday times (required)
        earliest = effectiveTimePreferences.weekdayEarliest;
        latest = effectiveTimePreferences.weekdayLatest;
      }
      
      console.log(`📅 ${day} (${isWeekend ? 'weekend' : 'weekday'}): earliest=${earliest}, latest=${latest}`);
      
      // Validate we have times
      if (!earliest || !latest) {
        console.error('❌ Missing time preferences for day:', day, {
          isWeekend,
          useSameWeekendTimes: effectiveTimePreferences.useSameWeekendTimes,
          weekdayEarliest: effectiveTimePreferences.weekdayEarliest,
          weekdayLatest: effectiveTimePreferences.weekdayLatest,
          weekendEarliest: effectiveTimePreferences.weekendEarliest,
          weekendLatest: effectiveTimePreferences.weekendLatest
        });
        return; // Skip this day if times are missing (return from forEach callback)
      }
      
      const [earliestHour, earliestMin] = earliest.split(':').map(Number);
      const [latestHour, latestMin] = latest.split(':').map(Number);
      const earliestMinutes = earliestHour * 60 + earliestMin;
      const latestMinutes = latestHour * 60 + latestMin;
      const totalMinutes = latestMinutes - earliestMinutes;
      
      // Calculate blocked minutes for this day
      const dayDate = new Date(weekStartDate);
      dayDate.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
      dayDate.setUTCHours(0, 0, 0, 0);
      
      let blockedMinutes = 0;
      combinedBlockedTimes.forEach(blocked => {
        const blockedStart = new Date(blocked.start);
        const blockedEnd = new Date(blocked.end);
        
        // Use UTC for date comparison to avoid timezone issues
        if (blockedStart.getUTCFullYear() === dayDate.getUTCFullYear() &&
            blockedStart.getUTCMonth() === dayDate.getUTCMonth() &&
            blockedStart.getUTCDate() === dayDate.getUTCDate()) {
          const blockedStartMinutes = blockedStart.getUTCHours() * 60 + blockedStart.getUTCMinutes();
          const blockedEndMinutes = blockedEnd.getUTCHours() * 60 + blockedEnd.getUTCMinutes();
          const overlapStart = Math.max(earliestMinutes, blockedStartMinutes);
          const overlapEnd = Math.min(latestMinutes, blockedEndMinutes);
          if (overlapStart < overlapEnd) {
            blockedMinutes += overlapEnd - overlapStart;
          }
        }
      });
      
      const availableMinutes = totalMinutes - blockedMinutes;
      effectiveAvailability[day] = Math.max(0, availableMinutes / 60);
    });
    
    console.log('✅ Calculated availability from database:', effectiveAvailability);

    // Determine if this is a future week (for loading latest ratings from database)
    let effectiveTopicStatus = topicStatus || {};
    const currentWeekStart = getMonday(new Date());
    currentWeekStart.setHours(0, 0, 0, 0);
    const targetWeekStartDate = new Date(weekStartDate);
    targetWeekStartDate.setHours(0, 0, 0, 0);
    
    const isFutureWeek = targetWeekStartDate > currentWeekStart;
    
    // IMPORTANT: Load latest ratings from database FIRST (before block counting)
    // This ensures re-rated topics use their NEW rating when calculating required sessions
    let effectiveRatings = ratings;
    if (isFutureWeek) {
      console.log('📅 Target week is in the future - loading latest ratings from database BEFORE block counting');
      const dbRatings = await loadRatingsFromDatabase(userId);
      // Database ratings take precedence (reflects any re-rating changes)
      effectiveRatings = { ...ratings, ...dbRatings };
      console.log(`✅ Using database ratings for future week. Total ratings: ${Object.keys(effectiveRatings).length}`);
    } else {
      console.log('📅 Target week is current or past - using provided ratings');
    }
    
    console.log('🚀 SPACED REPETITION: Starting block counting and ongoing topic tracking');
    console.log('📅 Target week:', targetWeekStart);
    console.log('📅 Week start date:', weekStartDate.toISOString());
    
    // Load re-rating history to detect when topics have been re-rated
    // Blocks before the last re-rating don't count toward the new cycle
    const reratingHistory = await loadLastReratingDates(userId);
    
    // Load ALL previous blocks for this user (for counting and tracking last session dates)
    const { data: previousBlocks, error: blocksError } = await supabaseAdmin
      .from('blocks')
      .select('topic_id, scheduled_at')
      .eq('user_id', userId)
      .lt('scheduled_at', weekStartDate.toISOString())
      .in('status', ['scheduled', 'done']); // Only count scheduled or completed blocks

    console.log('📦 Loaded previous blocks:', {
      count: previousBlocks?.length || 0,
      error: blocksError?.message
    });

    const completedTopics = new Set(); // Track topics that have completed all required sessions
    const ongoingTopics = {}; // Track topics currently in spaced repetition (for gap days)
    
    // Helper: Determine required sessions based on rating (1=3, 2=2, 3-5=1)
    const getRequiredSessions = (rating) => {
      if (rating === 1) return 3;
      if (rating === 2) return 2;
      return 1; // ratings 3, 4, 5
    };
    
    if (previousBlocks && previousBlocks.length > 0) {
      // Count blocks per topic AND track last session date
      // IMPORTANT: Skip ALL blocks for topics that have been re-rated (they start fresh)
      const topicData = new Map(); // { topicId: { count, lastDate } }
      let skippedDueToRerate = 0;
      
      previousBlocks.forEach(block => {
        if (!block.topic_id) return; // Skip blocks without topic_id
        
        const blockDate = new Date(block.scheduled_at);
        
        // If this topic was re-rated, skip ALL its blocks (fresh cycle starts)
        // Re-rating resets everything - no date comparison needed
        if (reratingHistory[block.topic_id]) {
          skippedDueToRerate++;
          return; // Skip ALL blocks for re-rated topics
        }
        
        // Only count blocks for topics that haven't been re-rated
        const existing = topicData.get(block.topic_id);
        
        if (!existing) {
          topicData.set(block.topic_id, { count: 1, lastDate: blockDate });
        } else {
          topicData.set(block.topic_id, {
            count: existing.count + 1,
            lastDate: blockDate > existing.lastDate ? blockDate : existing.lastDate
          });
        }
      });
      
      if (skippedDueToRerate > 0) {
        console.log(`🔄 Skipped ${skippedDueToRerate} blocks from previous rating cycles (before/at re-rating)`);
      }
      
      // Log detailed info about re-rated topics
      if (Object.keys(reratingHistory).length > 0) {
        console.log('🔄 Re-rated topics detail:', Object.entries(reratingHistory).map(([topicId, info]) => {
          const blocksForTopic = topicData.get(topicId);
          const newRating = effectiveRatings[topicId];
          const sessionsNeeded = newRating === 1 ? 3 : newRating === 2 ? 2 : 1;
          return {
            topicId: topicId.substring(0, 8) + '...',
            newRating,
            sessionsNeeded,
            blocksCountedAfterRerate: blocksForTopic?.count || 0,
            reratedAt: info.lastReratingDate.toISOString()
          };
        }));
      }
      
      console.log('📊 Block count analysis (after re-rating filter):', {
        total: previousBlocks.length,
        countedBlocks: previousBlocks.length - skippedDueToRerate,
        uniqueTopics: topicData.size,
        reratedTopics: Object.keys(reratingHistory).length,
        sample: Array.from(topicData.entries()).slice(0, 5).map(([id, data]) => ({
          topicId: id.substring(0, 8) + '...',
          blockCount: data.count,
          lastDate: data.lastDate.toISOString().split('T')[0],
          wasRerated: !!reratingHistory[id]
        }))
      });
      
      // Separate topics into completed vs ongoing (for within-week spaced repetition)
      // NOTE: effectiveRatings already contains the LATEST ratings (including re-ratings)
      topicData.forEach((data, topicId) => {
        const rating = effectiveRatings[topicId];
        const requiredSessions = rating !== undefined ? getRequiredSessions(rating) : 1;
        
        if (data.count >= requiredSessions) {
          // Topic completed all sessions for the CURRENT rating
          completedTopics.add(topicId);
        } else {
          // Topic is ongoing (incomplete sessions) - track for gap day enforcement
          ongoingTopics[topicId] = {
            sessionsScheduled: data.count,
            sessionsRequired: requiredSessions,
            lastSessionDate: data.lastDate
          };
        }
      });
      
      console.log('✅ Topic status:', {
        completed: completedTopics.size,
        ongoing: Object.keys(ongoingTopics).length,
        completedSample: Array.from(completedTopics).slice(0, 3).map(id => id.substring(0, 8) + '...'),
        ongoingSample: Object.entries(ongoingTopics).slice(0, 3).map(([id, data]) => ({
          topicId: id.substring(0, 8) + '...',
          sessions: `${data.sessionsScheduled}/${data.sessionsRequired}`,
          lastDate: data.lastSessionDate.toISOString().split('T')[0]
        }))
      });
    }
    
    // Exclude all completed topics from scheduling
    completedTopics.forEach(topicId => {
      effectiveTopicStatus[topicId] = 'skip';
    });
    
    console.log(`✅ Excluding ${completedTopics.size} completed topics from scheduling`);

    // Collect re-rated topic IDs that need new sessions (not yet completed in new cycle)
    // These should be PRIORITIZED over new topics that haven't been covered yet
    const reratedTopicIds = Object.keys(reratingHistory).filter(topicId => {
      // Only include if:
      // 1. Not already completed in the new cycle
      // 2. Has a rating that requires sessions (1-3)
      if (completedTopics.has(topicId)) return false;
      
      const rating = effectiveRatings[topicId];
      // Ratings 1-3 need spaced repetition, 4-5 are "mastered" (maintenance only)
      return rating !== undefined && rating <= 3;
    });

    if (reratedTopicIds.length > 0) {
      console.log(`🔄 Found ${reratedTopicIds.length} re-rated topics that need priority scheduling:`, 
        reratedTopicIds.slice(0, 5).map(id => ({
          topicId: id.substring(0, 8) + '...',
          newRating: effectiveRatings[id],
          sessionsNeeded: effectiveRatings[id] === 1 ? 3 : effectiveRatings[id] === 2 ? 2 : 1
        }))
      );
    }

    let plan;
    try {
      console.log('🔍 Calling generateStudyPlan with:', {
        subjectsCount: subjects.length,
        ratingsCount: Object.keys(effectiveRatings).length,
        availabilityKeys: Object.keys(effectiveAvailability || {}),
        hasTimePreferences: !!effectiveTimePreferences,
        blockedTimesCount: combinedBlockedTimes.length,
        completedTopicsCount: completedTopics.size,
        ongoingTopicsCount: Object.keys(ongoingTopics).length,
        reratedTopicsCount: reratedTopicIds.length,
        targetWeekStart
      });
      
      plan = await generateStudyPlan({
        subjects,
        ratings: effectiveRatings,
        topicStatus: effectiveTopicStatus,
        availability: effectiveAvailability,
        timePreferences: effectiveTimePreferences,
        blockedTimes: combinedBlockedTimes,
        studyBlockDuration,
        targetWeekStart,
        actualStartDate, // For partial weeks - skip days before this date
        missedTopicIds: reratedTopicIds, // Re-rated topics get priority (treated like missed topics)
        ongoingTopics // Pass ongoing topics for gap day enforcement and session tracking
      });
      
      console.log('✅ generateStudyPlan returned:', {
        planLength: plan?.length || 0,
        planType: Array.isArray(plan) ? 'array' : typeof plan,
        firstBlock: plan?.[0] ? {
          hasScheduledAt: !!plan[0].scheduled_at,
          scheduledAt: plan[0].scheduled_at,
          topicId: plan[0].topic_id
        } : 'no blocks'
      });
      
      // Validate plan blocks before processing
      if (plan && Array.isArray(plan)) {
        const invalidBlocks = plan.filter(block => {
          if (!block) return true;
          if (block.topic_id !== null && !block.scheduled_at) return true;
          return false;
        });
        if (invalidBlocks.length > 0) {
          console.warn('⚠️ Found invalid blocks in plan:', invalidBlocks.length, 'out of', plan.length);
        }
      }
    } catch (error) {
      console.error('❌ Error in generateStudyPlan:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Error at:', {
        fileName: error.fileName,
        lineNumber: error.lineNumber,
        columnNumber: error.columnNumber
      });
      return NextResponse.json({ 
        error: error.message || 'Failed to generate study plan',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        success: false
      }, { status: 500 });
    }

    console.log('Generated plan:', {
      planLength: plan.length,
      planSample: plan.slice(0, 3).map(b => ({
        topic_id: b.topic_id,
        scheduled_at: b.scheduled_at,
        isBreak: b.topic_id === null
      })),
      subjectsCount: subjects.length,
      topicsCount: Object.keys(ratings).length,
      availability
    });

    // Validate that we have blocks to insert before deleting existing ones
    const records = toDatabaseRows(plan, userId);
    
    if (records.length === 0) {
      console.error('⚠️ Generated plan is empty - NOT deleting existing blocks to prevent data loss');
      return NextResponse.json({ 
        error: 'No blocks were generated. This might be because:\n- No topics are available to schedule\n- No available time slots match your preferences\n- There was an error during generation',
        success: false
      }, { status: 400 });
    }

    // Only delete existing blocks AFTER confirming we have new ones to insert
    console.log(`🗑️ Deleting existing blocks for week ${targetWeekStart} (${records.length} new blocks ready to insert)...`);
    const deleteStart = new Date(weekStartDate);
    deleteStart.setHours(0, 0, 0, 0);
    // Calculate Sunday explicitly: Monday (weekStartDate) + 6 days = Sunday
    const deleteEnd = new Date(weekStartDate);
    deleteEnd.setDate(weekStartDate.getDate() + 6); // Sunday (6 days after Monday)
    deleteEnd.setHours(23, 59, 59, 999); // End of Sunday to include all Sunday blocks
    
    console.log('🗑️ Deletion range:', {
      deleteStart: deleteStart.toISOString(),
      deleteEnd: deleteEnd.toISOString(),
      deleteStartDay: deleteStart.getDay(), // Should be 1 (Monday)
      deleteEndDay: deleteEnd.getDay() // Should be 0 (Sunday)
    });
    
    const { error: deleteError } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('user_id', userId)
      .gte('scheduled_at', deleteStart.toISOString())
      .lte('scheduled_at', deleteEnd.toISOString()); // Use lte to include end of Sunday
    
    if (deleteError) {
      console.error('Error deleting existing blocks:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to clear existing blocks',
        success: false
      }, { status: 500 });
    }
    
    console.log('✅ Existing blocks deleted, inserting new ones...');
    let insertedBlocks = [];
    if (records.length > 0) {
      // Insert and get back the IDs
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('blocks')
        .insert(records)
        .select('id, topic_id, scheduled_at, duration_minutes, status, ai_rationale, session_number, session_total');
      
      if (insertError) {
        console.error('Failed to insert blocks:', insertError);
        throw new Error('Failed to save blocks to database');
      }
      
      insertedBlocks = inserted || [];
    }

    // Map database IDs back to plan blocks
    // Create a map of topic_id + scheduled_at to database ID
    // Use normalized ISO strings for matching
    const idMap = new Map();
    insertedBlocks.forEach(dbBlock => {
      const normalizedTime = new Date(dbBlock.scheduled_at).toISOString();
      const key = `${dbBlock.topic_id}-${normalizedTime}`;
      idMap.set(key, dbBlock.id);
    });

    // Merge plan blocks with database IDs
    const allBlocks = plan.map(block => {
      if (block.topic_id === null) {
        // Break block - no database ID, return as-is
        return block;
      }
      // Normalize the scheduled_at time for matching
      const normalizedTime = new Date(block.scheduled_at).toISOString();
      const key = `${block.topic_id}-${normalizedTime}`;
      const dbId = idMap.get(key);
      if (!dbId) {
        console.warn('No database ID found for block:', {
          key,
          topic_id: block.topic_id,
          scheduled_at: block.scheduled_at,
          normalizedTime,
          availableKeys: Array.from(idMap.keys()).slice(0, 5)
        });
      }
      return {
        ...block,
        id: dbId || null
      };
    });

    const blockedTimesResponse = combinedBlockedTimes;
    const debugInfo = process.env.NODE_ENV === 'development' ? {
      blockedSample: combinedBlockedTimes.slice ? combinedBlockedTimes.slice(0, 5) : [],
      insertedCount: insertedBlocks.length,
      planCount: plan.length
    } : undefined;

    if (allBlocks.length === 0) {
      console.warn('⚠️ Generated plan is empty:', {
        planLength: plan.length,
        insertedCount: insertedBlocks.length,
        subjectsCount: subjects.length,
        topicsCount: Object.keys(ratings).length,
        slotsCount: plan.length > 0 ? 'N/A (plan exists)' : 'Need to check scheduler',
        availability,
        timePreferences: effectiveTimePreferences
      });
    }
    
    // Filter out break blocks (they have topic_id === null) - we don't use them anymore
    const studyBlocksOnly = allBlocks.filter(block => block.topic_id !== null);
    
    return NextResponse.json({
      success: true,
      blocks: studyBlocksOnly,
      weekStart: targetWeekStart,
      blockedTimes: blockedTimesResponse,
      debug: debugInfo
    });
  } catch (error) {
    console.error('Plan generation error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: error.message || 'Failed to generate study plan',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const userId = await resolveUserId();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetWeek = searchParams.get('weekStart');
    const blockId = searchParams.get('blockId'); // Optional: fetch specific block
    
    // If requesting a specific block, return just that block
    if (blockId) {
      const { data: block, error: blockError } = await supabaseAdmin
        .from('blocks')
        .select(
          `id, topic_id, scheduled_at, duration_minutes, status, ai_rationale,
           topics!left(id, title, level, parent_id, spec_id, specs(subject, exam_board))`
        )
        .eq('id', blockId)
        .eq('user_id', userId)
        .single();
      
      if (blockError || !block) {
        return NextResponse.json({ error: 'Block not found' }, { status: 404 });
      }
      
      const topic = block.topics;
      
      // Build hierarchy if topic exists
      let hierarchy = [];
      if (topic && topic.spec_id) {
        // Fetch all topics in the same spec to build the map
        const { data: allTopics } = await supabaseAdmin
          .from('topics')
          .select('id, title, level, parent_id, spec_id')
          .eq('spec_id', topic.spec_id);
        
        const topicMap = new Map();
        (allTopics || []).forEach(t => topicMap.set(t.id, t));
        
        const topicWithId = topicMap.get(topic.id) || topic;
        // Helper function to build topic hierarchy (local to this block)
        const buildTopicHierarchyLocal = (topicMap, topic) => {
          if (!topic || !topic.id) return [];
          
          const hierarchy = [];
          let currentTopic = topicMap.get(topic.id) || topic;
          
          // Start with the current topic (Level 3 - subtopic)
          hierarchy.push(currentTopic.title);
          
          // Traverse up the hierarchy using parent_id
          while (currentTopic.parent_id) {
            const parent = topicMap.get(currentTopic.parent_id);
            if (!parent) break;
            
            hierarchy.unshift(parent.title); // Add parent to the beginning
            currentTopic = parent;
          }
          
          return hierarchy;
        };
        hierarchy = buildTopicHierarchyLocal(topicMap, topicWithId);
      } else if (topic) {
        // Fallback: just use the topic title
        hierarchy = [topic.title || 'Topic'];
      }
      
      const formattedBlock = {
        id: block.id,
        topic_id: block.topic_id,
        scheduled_at: block.scheduled_at,
        duration_minutes: block.duration_minutes,
        status: block.status,
        ai_rationale: block.ai_rationale,
        topic_name: topic?.title || 'Topic',
        parent_topic_name: null,
        subject: topic?.specs?.subject || 'Unknown subject',
        exam_board: topic?.specs?.exam_board || 'Unknown board',
        hierarchy: hierarchy.length > 0 ? hierarchy : [topic?.title || 'Topic']
      };
      
      return NextResponse.json({
        success: true,
        blocks: [formattedBlock]
      });
    }
    
    // Determine which week to fetch blocks for
    let weekStartDate;
    if (targetWeek) {
      // Parse date string as local time (not UTC) to avoid timezone issues
      // The frontend sends YYYY-MM-DD format, parse it as local date components
      const [year, month, day] = targetWeek.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed, creates local date
      weekStartDate = getMonday(dateObj);
    } else {
      // Default to current week
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      weekStartDate = getMonday(today);
    }
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 7);
    
    console.log('🔍 Fetching blocks for user:', {
      userId,
      targetWeek: targetWeek || 'none (using current week)',
      weekStartDate: weekStartDate.toISOString(),
      weekStartDateLocal: weekStartDate.toLocaleString(),
      weekStartDateYear: weekStartDate.getFullYear(),
      weekEndDate: weekEndDate.toISOString(),
      weekEndDateLocal: weekEndDate.toLocaleString(),
      weekEndDateYear: weekEndDate.getFullYear(),
      weekStartDay: weekStartDate.getDay(), // 0=Sunday, 1=Monday
      weekStartDateStr: weekStartDate.toISOString().split('T')[0],
      serverDate: new Date().toISOString(),
      serverDateYear: new Date().getFullYear()
    });

      // Fetch blocks for the requested week (or all blocks if no week specified)
      // First, check total count and get sample dates
      const { count: totalBlockCount } = await supabaseAdmin
        .from('blocks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      // Get a sample of all blocks to see what dates they have
      const { data: sampleBlocks } = await supabaseAdmin
        .from('blocks')
        .select('id, scheduled_at, status')
        .eq('user_id', userId)
        .order('scheduled_at', { ascending: true })
        .limit(10);
      
      console.log('🔍 Total blocks in database for user:', totalBlockCount);
      console.log('📅 Sample of all blocks (first 10):', sampleBlocks?.map(b => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        date_only: b.scheduled_at?.split('T')[0],
        status: b.status
      })));
      
      // Build query - filter by week if targetWeek is provided
      let query = supabaseAdmin
        .from('blocks')
        .select(
          `id, topic_id, scheduled_at, duration_minutes, status, ai_rationale, session_number, session_total, rerating_score,
           topics(id, title, level, parent_id, spec_id, specs(subject, exam_board))`
        )
        .eq('user_id', userId);
      
      // Filter by week if targetWeek is provided
      if (targetWeek) {
        const weekStart = new Date(weekStartDate);
        // Calculate Sunday explicitly: Monday (weekStartDate) + 6 days = Sunday
        const weekEnd = new Date(weekStartDate);
        weekEnd.setDate(weekStartDate.getDate() + 6); // Sunday (6 days after Monday)
        
        // Ensure times are set correctly for range comparison
        weekStart.setHours(0, 0, 0, 0);
        // Set weekEnd to end of Sunday (23:59:59.999) to explicitly include all Sunday blocks
        weekEnd.setHours(23, 59, 59, 999);
        
        console.log('🔍 Filtering blocks by date range:', {
          weekStartISO: weekStart.toISOString(),
          weekEndISO: weekEnd.toISOString(),
          weekStartLocal: weekStart.toLocaleString(),
          weekEndLocal: weekEnd.toLocaleString(),
          weekStartDay: weekStart.getDay(), // Should be 1 (Monday)
          weekEndDay: weekEnd.getDay() // Should be 0 (Sunday)
        });
        
        query = query
          .gte('scheduled_at', weekStart.toISOString())
          .lte('scheduled_at', weekEnd.toISOString()); // Use lte to include end of Sunday
      }
      
      const { data, error } = await query.order('scheduled_at', { ascending: true });
    
    // Log sample of scheduled_at dates to debug
    if (data && data.length > 0) {
      console.log('📅 Sample block dates (first 5):', data.slice(0, 5).map(b => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        scheduled_at_local: new Date(b.scheduled_at).toLocaleString(),
        date_only: b.scheduled_at.split('T')[0]
      })));
    }
    
    console.log('📊 Blocks query result:', {
      found: data?.length || 0,
      error: error?.message,
      errorCode: error?.code,
      blocksWithTopics: data?.filter(b => b.topics).length || 0,
      blocksWithoutTopics: data?.filter(b => !b.topics).length || 0,
      sample: data?.slice(0, 5).map(b => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        topicTitle: b.topics?.title,
        topicId: b.topic_id,
        hasTopics: !!b.topics,
        topicLevel: b.topics?.level
      }))
    });

    if (error) {
      console.error('Plan fetch error:', error);
      return NextResponse.json({ 
        error: 'Failed to load study plan',
        details: error.message 
      }, { status: 500 });
    }

    if (!data || data.length === 0) {
      console.log('⚠️ No blocks found for user:', userId);
      return NextResponse.json({
        success: true,
        blocks: [],
        weekStart: weekStartDate.toISOString().split('T')[0],
        blockedTimes: []
      });
    }

    // Helper function to build topic hierarchy
    const buildTopicHierarchy = (topicMap, topic) => {
      if (!topic || !topic.id) return [];
      
      const hierarchy = [];
      let currentTopic = topicMap.get(topic.id) || topic;
      
      // Start with the current topic (Level 3 - subtopic)
      hierarchy.push(currentTopic.title);
      
      // Traverse up the hierarchy using parent_id
      while (currentTopic.parent_id) {
        const parent = topicMap.get(currentTopic.parent_id);
        if (!parent) break;
        
        hierarchy.unshift(parent.title); // Add parent to the beginning
        currentTopic = parent;
      }
      
      return hierarchy;
    };

    // Build topic map for hierarchy traversal
    // First, collect all unique spec_ids from blocks
    const specIds = new Set();
    (data || []).forEach(row => {
      if (row.topics?.spec_id) {
        specIds.add(row.topics.spec_id);
      }
    });
    
    // Fetch all topics for these specs to build the map
    const topicMap = new Map();
    if (specIds.size > 0) {
      const { data: allTopics, error: topicsError } = await supabaseAdmin
        .from('topics')
        .select('id, title, level, parent_id, spec_id')
        .in('spec_id', Array.from(specIds));
      
      if (!topicsError && allTopics) {
        allTopics.forEach(t => topicMap.set(t.id, t));
      }
    }
    
    // Build blocks with hierarchy
    const blocks = (data || []).map((row) => {
      const topic = row.topics;
      
      // Handle null topics gracefully
      if (!topic) {
        return {
          id: row.id,
          topic_id: row.topic_id,
          scheduled_at: row.scheduled_at,
          duration_minutes: row.duration_minutes,
          status: row.status,
          ai_rationale: row.ai_rationale,
          session_number: row.session_number,
          session_total: row.session_total,
          rerating_score: row.rerating_score,
          topic_name: 'Unknown Topic',
          parent_topic_name: null,
          subject: 'Unknown subject',
          exam_board: 'Unknown board',
          hierarchy: ['Unknown Topic']
        };
      }
      
      // Build hierarchy for this topic
      const hierarchy = buildTopicHierarchy(topicMap, topic);
      
      return {
        id: row.id,
        topic_id: row.topic_id,
        scheduled_at: row.scheduled_at,
        duration_minutes: row.duration_minutes,
        status: row.status,
        ai_rationale: row.ai_rationale,
        session_number: row.session_number,
        session_total: row.session_total,
        rerating_score: row.rerating_score,
        topic_name: topic.title || 'Topic',
        parent_topic_name: null, // Deprecated - use hierarchy instead
        subject: topic.specs?.subject || 'Unknown subject',
        exam_board: topic.specs?.exam_board || 'Unknown board',
        hierarchy: hierarchy.length > 0 ? hierarchy : [topic.title || 'Topic']
      };
    });
    
    console.log('✅ Returning blocks:', {
      totalBlocks: blocks.length,
      blocksWithTopics: blocks.filter(b => b.topic_name !== 'Unknown Topic').length,
      blocksWithoutTopics: blocks.filter(b => b.topic_name === 'Unknown Topic').length
    });

    // Use the requested week start, or determine from blocks if not specified
    let actualWeekStart = weekStartDate.toISOString().split('T')[0];
    if (!targetWeek && blocks.length > 0) {
      const earliestBlock = new Date(blocks[0].scheduled_at);
      const earliestWeekStart = getMonday(earliestBlock);
      actualWeekStart = earliestWeekStart.toISOString().split('T')[0];
    }

    const unavailableTimes = await loadBlockedTimes(userId, weekStartDate, weekEndDate);
    const repeatableEvents = await loadRepeatableEvents(userId, weekStartDate, weekEndDate);
    const blockedTimes = dedupeBlockedTimes(
      sanitizeBlockedTimes([
        ...unavailableTimes,
        ...repeatableEvents
      ])
    );

    console.log('✅ Final response:', {
      blocksCount: blocks.length,
      weekStart: actualWeekStart,
      blockedTimesCount: blockedTimes.length
    });

    return NextResponse.json({
      success: true,
      blocks,
      weekStart: actualWeekStart,
      blockedTimes
    });
  } catch (error) {
    console.error('Plan fetch exception:', error);
    return NextResponse.json({ error: 'Failed to load study plan' }, { status: 500 });
  }
}