import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { generateStudyPlan } from "@/libs/scheduler";
import { planGenerationLimit, checkRateLimit } from "@/libs/ratelimit";

// Spaced repetition fix: Track ongoing topics across weeks - v2
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

  // Allow dev user in development or prelaunch environments
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'prelaunch';
  
  if (userId || !isDev) {
    return userId;
  }

  return await ensureDevUser();
}

/**
 * Get the effective current date/time for plan generation.
 * In dev mode with time override, returns the overridden time.
 * Otherwise returns the real current time.
 */
function getEffectiveNow(devTimeOverride) {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev && devTimeOverride) {
    try {
      const overriddenDate = new Date(devTimeOverride);
      if (!isNaN(overriddenDate.getTime())) {
        console.log('⏰ Using dev time override:', overriddenDate.toISOString());
        return overriddenDate;
      }
    } catch (e) {
      console.error('Invalid devTimeOverride value:', devTimeOverride);
    }
  }
  
  return new Date();
}

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Parse time string HH:MM to minutes from midnight. */
function parseTimeToMinutes(timeStr = '00:00') {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map((p) => Number(p) || 0);
  return h * 60 + m;
}

/** Format a Date as YYYY-MM-DD in **local** time (not UTC). Avoids toISOString() giving wrong calendar day in timezones ahead of UTC. */
function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns true if the cutoff day (effectiveNow's date) has no valid slots after the cutoff time
 * (e.g. user's latest is 8:30 PM and cutoff is 8:56 PM → no slots). When true, we should start from tomorrow.
 */
function cutoffDayHasNoValidSlots({ effectiveNow, clientMinutesFromMidnight, useDevOverride, timePreferences, availability }) {
  const dayIndex = (effectiveNow.getDay() + 6) % 7; // Monday=0
  const cutoffDayName = DAY_NAMES[dayIndex];
  const avail = availability[cutoffDayName] ?? 0;
  if (!avail || avail <= 0) {
    console.log('📅 cutoffDayHasNoValidSlots: no availability on cutoff day', { cutoffDayName, avail }, '→ start tomorrow');
    return true;
  }
  const isWeekend = dayIndex >= 5;
  const weekendSplit = timePreferences.useSameWeekendTimes === false;
  let earliestStr, latestStr;
  if (isWeekend && weekendSplit && timePreferences.weekendEarliest && timePreferences.weekendLatest) {
    earliestStr = timePreferences.weekendEarliest;
    latestStr = timePreferences.weekendLatest;
  } else {
    earliestStr = timePreferences.weekdayEarliest;
    latestStr = timePreferences.weekdayLatest;
  }
  if (!earliestStr || !latestStr) {
    console.log('📅 cutoffDayHasNoValidSlots: missing earliest/latest', { earliestStr, latestStr }, '→ start tomorrow');
    return true;
  }
  const latestMinutes = parseTimeToMinutes(latestStr);
  const cutoffMinutes = useDevOverride
    ? effectiveNow.getHours() * 60 + effectiveNow.getMinutes() + effectiveNow.getSeconds() / 60
    : (typeof clientMinutesFromMidnight === 'number' && !Number.isNaN(clientMinutesFromMidnight)
      ? clientMinutesFromMidnight
      : effectiveNow.getHours() * 60 + effectiveNow.getMinutes() + effectiveNow.getSeconds() / 60);
  const roundedCutoff = Math.ceil(cutoffMinutes / 30) * 30;
  const noSlots = roundedCutoff >= latestMinutes;
  console.log('📅 cutoffDayHasNoValidSlots:', {
    cutoffDayName,
    availHours: avail,
    earliest: earliestStr,
    latest: latestStr,
    latestMinutes,
    cutoffMinutes: Math.floor(cutoffMinutes),
    roundedCutoff,
    noSlots,
    result: noSlots ? '→ start tomorrow' : '→ slots today'
  });
  return noSlots;
}

function resolveTargetWeek({ targetWeek, signupDate, startToday = true, effectiveNow }) {
  // Always derive actual start from effective/signup time and startToday so "start tomorrow" works
  // even when client sends targetWeek (current week Monday).
  // IMPORTANT: copy the Date so we do not mutate effectiveNow.
  const base = signupDate
    ? new Date(signupDate)
    : (effectiveNow ? new Date(effectiveNow) : new Date());
  if (!startToday) {
    base.setDate(base.getDate() + 1); // tomorrow — only blocks for next day onward
  }
  base.setHours(0, 0, 0, 0);

  const actualStartDate = formatDateLocal(base);
  const weekStart = formatDateLocal(getMonday(base));
  // Use client targetWeek only when it matches the computed week (consistency); else use computed weekStart
  const finalWeekStart = targetWeek && formatDateLocal(getMonday(new Date(targetWeek + 'T00:00:00'))) === weekStart
    ? targetWeek
    : weekStart;

  return { weekStart: finalWeekStart, actualStartDate };
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
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check rate limit (5 requests per hour)
    const rateLimitCheck = await checkRateLimit(planGenerationLimit, userId);
    if (!rateLimitCheck.success) {
      console.log(`[RATE LIMIT] Plan generation blocked for user ${userId}`);
      return NextResponse.json(
        rateLimitCheck.response,
        { 
          status: 429,
          headers: rateLimitCheck.headers
        }
      );
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
      signupDate = null,
      startToday = true, // NEW FIELD - default true for backward compatibility
      devTimeOverride = null, // Time override for dev mode testing
      clientNow = null, // Client's current time (ISO string)
      clientMinutesFromMidnight = null // Minutes from midnight in user's TZ so first block is next :00 or :30
    } = body || {};
    
    console.log('📥 POST request received:', {
      devTimeOverride,
      startToday,
      targetWeek,
      signupDate,
      clientNow: !!clientNow,
      subjectsCount: subjects.length
    });

    const incomingBlockedTimes = Array.isArray(rawBlockedTimes) && rawBlockedTimes.length > 0
      ? rawBlockedTimes
      : Array.isArray(unavailableTimes)
        ? unavailableTimes
        : [];

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'At least one subject is required' }, { status: 400 });
    }

    // When in dev and override is set, use it for cutoff so blocks are never before the override day/time.
    // Otherwise use client's "now" so cutoff matches user time (avoids server TZ giving past slots).
    // Fallback: server time.
    const useDevOverride = process.env.NODE_ENV === 'development' && !!devTimeOverride;
    const fromClient = clientNow ? (() => {
      try {
        const t = new Date(clientNow);
        return isNaN(t.getTime()) ? null : t;
      } catch (e) { return null; }
    })() : null;
    const effectiveNow = useDevOverride
      ? getEffectiveNow(devTimeOverride)
      : (fromClient || new Date());
    const effectiveNowSource = useDevOverride ? 'devTimeOverride' : (fromClient ? 'clientNow' : 'server');

    console.log('🕐 Effective time for plan generation (no slots before this):', {
      effectiveNow: effectiveNow.toLocaleString(),
      source: effectiveNowSource,
      startToday
    });
    
    const { weekStart: targetWeekStart, actualStartDate } = resolveTargetWeek({ 
      targetWeek, 
      signupDate,
      startToday, // Pass the new parameter
      effectiveNow // Pass the effective time for dev mode
    });
    let finalTargetWeekStart = targetWeekStart;
    let finalActualStartDate = actualStartDate;

    console.log('📅 Plan generation timing:', {
      startToday,
      signupDate,
      targetWeekStart,
      actualStartDate,
      message: startToday ? 'Starting plan today' : 'Starting plan tomorrow'
    });
    
    let weekStartDate = getMonday(new Date(`${targetWeekStart}T00:00:00Z`));
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 7);
    
    // Check if target week is in the future - only allow from Saturday onwards
    // DEV BYPASS: Skip this check in development or prelaunch mode
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'prelaunch';
    if (!isDev) {
      const today = new Date(effectiveNow);
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(targetWeekStart);
      const isNextWeek = targetDate > today;
      
      if (isNextWeek) {
        const dayOfWeek = effectiveNow.getDay(); // Use effective day with time for accurate check
        const isSaturdayOrLater = dayOfWeek === 6 || dayOfWeek === 0; // Saturday (6) or Sunday (0)
        
        if (!isSaturdayOrLater) {
          return NextResponse.json({
            error: 'Next week\'s plan can only be generated from Saturday onwards. Please wait until Saturday to plan next week.',
            success: false
          }, { status: 400 });
        }
      }
    }
    
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
    console.log('🚫 Blocked times from frontend:', {
      count: incomingBlockedTimes.length,
      sample: incomingBlockedTimes.slice(0, 3)
    });
    
    if (!effectiveBlockedTimes || effectiveBlockedTimes.length === 0) {
      console.log('📥 No blocked times from frontend, loading from database...');
      effectiveBlockedTimes = await loadBlockedTimes(userId, weekStartDate, weekEndDate);
      console.log('✅ Loaded unavailable times from database:', {
        count: effectiveBlockedTimes.length,
        sample: effectiveBlockedTimes.slice(0, 3)
      });
      
      // If no unavailable times found for target week, and we're generating for a future week,
      // fall back to current week's unavailable times (aligned to target week)
      if (effectiveBlockedTimes.length === 0) {
        const today = new Date(effectiveNow);
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
    console.log('🔁 Loaded repeatable events:', {
      count: repeatableEvents.length,
      sample: repeatableEvents.slice(0, 3)
    });
    
    const combinedBlockedTimes = dedupeBlockedTimes(
      sanitizeBlockedTimes([
        ...(effectiveBlockedTimes || []),
        ...repeatableEvents
      ])
    );
    
    console.log('🚫 FINAL combined blocked times for scheduler:', {
      totalCount: combinedBlockedTimes.length,
      unavailableTimesCount: effectiveBlockedTimes.length,
      repeatableEventsCount: repeatableEvents.length,
      sample: combinedBlockedTimes.slice(0, 5)
    });

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

    // When the cutoff day (today) has no valid slots after the cutoff time, start from tomorrow
    const hasTimePrefs = !!(effectiveTimePreferences?.weekdayEarliest && effectiveTimePreferences?.weekdayLatest);
    console.error('[PLAN_GENERATE] No-slots check: hasTimePrefs=', hasTimePrefs, 'effectiveNow=', effectiveNow.toISOString());
    console.log('📅 No-slots-on-cutoff-day check: hasTimePrefs=', hasTimePrefs, 'effectiveNow=', effectiveNow.toISOString(), 'cutoff day (local)=', effectiveNow.toDateString());
    if (hasTimePrefs) {
      const noSlotsOnCutoffDay = cutoffDayHasNoValidSlots({
        effectiveNow,
        clientMinutesFromMidnight,
        useDevOverride,
        timePreferences: effectiveTimePreferences,
        availability: effectiveAvailability
      });
      console.error('[PLAN_GENERATE] No-slots result:', noSlotsOnCutoffDay, noSlotsOnCutoffDay ? '→ WILL start tomorrow' : '→ keep today');
      console.log('📅 No-slots-on-cutoff-day result:', noSlotsOnCutoffDay, '→', noSlotsOnCutoffDay ? 'will set finalActualStartDate to tomorrow' : 'keep finalActualStartDate');
      if (noSlotsOnCutoffDay) {
        const tomorrow = new Date(effectiveNow);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const tomorrowWeekStart = getMonday(tomorrow);
        const tomorrowDateStr = formatDateLocal(tomorrow);
        const tomorrowWeekStr = formatDateLocal(tomorrowWeekStart);
        if (tomorrowWeekStr === targetWeekStart) {
          finalActualStartDate = tomorrowDateStr;
          console.error('[PLAN_GENERATE] Set finalActualStartDate to tomorrow:', finalActualStartDate);
          console.log('📅 No valid slots left on cutoff day — starting from tomorrow (local date):', finalActualStartDate, 'so blocks will be from next day only');
        } else {
          finalActualStartDate = tomorrowDateStr;
          finalTargetWeekStart = tomorrowWeekStr;
          weekStartDate = getMonday(new Date(`${finalTargetWeekStart}T00:00:00Z`));
          const weekEndDateNew = new Date(weekStartDate);
          weekEndDateNew.setDate(weekStartDate.getDate() + 7);
          console.log('📅 No valid slots on cutoff day — starting from next week:', { finalActualStartDate, finalTargetWeekStart });
          // Reload blocked times and availability for the new week so scheduler has correct data
          const effectiveBlockedTimesNext = await loadBlockedTimes(userId, weekStartDate, weekEndDateNew);
          const repeatableNext = await loadRepeatableEvents(userId, weekStartDate, weekEndDateNew);
          const combinedBlockedTimesNext = dedupeBlockedTimes(
            sanitizeBlockedTimes([...(effectiveBlockedTimesNext || []), ...repeatableNext])
          );
          // Recompute availability for the new week (replace combinedBlockedTimes and effectiveAvailability for downstream)
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          effectiveAvailability = {};
          days.forEach((day, dayIndex) => {
            const isWeekend = dayIndex >= 5;
            let earliest, latest;
            if (isWeekend && !effectiveTimePreferences.useSameWeekendTimes) {
              earliest = effectiveTimePreferences.weekendEarliest || effectiveTimePreferences.weekdayEarliest;
              latest = effectiveTimePreferences.weekendLatest || effectiveTimePreferences.weekdayLatest;
            } else {
              earliest = effectiveTimePreferences.weekdayEarliest;
              latest = effectiveTimePreferences.weekdayLatest;
            }
            if (!earliest || !latest) return;
            const [earliestHour, earliestMin] = earliest.split(':').map(Number);
            const [latestHour, latestMin] = latest.split(':').map(Number);
            const earliestMinutes = earliestHour * 60 + earliestMin;
            const latestMinutes = latestHour * 60 + latestMin;
            const totalMinutes = latestMinutes - earliestMinutes;
            const dayDate = new Date(weekStartDate);
            dayDate.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
            dayDate.setUTCHours(0, 0, 0, 0);
            let blockedMinutes = 0;
            combinedBlockedTimesNext.forEach(blocked => {
              const blockedStart = new Date(blocked.start);
              const blockedEnd = new Date(blocked.end);
              if (blockedStart.getUTCFullYear() === dayDate.getUTCFullYear() &&
                  blockedStart.getUTCMonth() === dayDate.getUTCMonth() &&
                  blockedStart.getUTCDate() === dayDate.getUTCDate()) {
                const blockedStartMinutes = blockedStart.getUTCHours() * 60 + blockedStart.getUTCMinutes();
                const blockedEndMinutes = blockedEnd.getUTCHours() * 60 + blockedEnd.getUTCMinutes();
                const overlapStart = Math.max(earliestMinutes, blockedStartMinutes);
                const overlapEnd = Math.min(latestMinutes, blockedEndMinutes);
                if (overlapStart < overlapEnd) blockedMinutes += overlapEnd - overlapStart;
              }
            });
            effectiveAvailability[day] = Math.max(0, (totalMinutes - blockedMinutes) / 60);
          });
          // Replace combinedBlockedTimes for downstream (generateStudyPlan)
          combinedBlockedTimes.length = 0;
          combinedBlockedTimes.push(...combinedBlockedTimesNext);
          weekEndDate.setTime(weekEndDateNew.getTime());
        }
      }
    }

    // Determine if this is a future week (for loading latest ratings from database)
    let effectiveTopicStatus = topicStatus || {};
    const currentWeekStart = getMonday(new Date(effectiveNow));
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
    console.log('📅 Target week:', finalTargetWeekStart);
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

    // Query missed blocks from previous weeks (before target week start)
    // Fetch full block details so we can UPDATE them instead of creating new ones
    const { data: missedBlocks = [], error: missedBlocksError } = await supabaseAdmin
      .from('blocks')
      .select('id, topic_id, scheduled_at, duration_minutes, ai_rationale')
      .eq('user_id', userId)
      .eq('status', 'missed')
      .lt('scheduled_at', weekStartDate.toISOString());

    if (missedBlocksError) {
      console.error('Error querying missed blocks:', missedBlocksError);
      // Don't fail - continue with just re-rated topics
    }

    // Extract unique topic IDs from missed blocks
    const missedTopicIdsFromDB = [...new Set(
      (missedBlocks || [])
        .filter(b => b.topic_id) // Only include blocks with valid topic_id
        .map(b => b.topic_id)
    )];

    // Group missed blocks by topic_id for later use when updating
    const missedBlocksByTopic = {};
    (missedBlocks || []).forEach(block => {
      if (block.topic_id) {
        if (!missedBlocksByTopic[block.topic_id]) {
          missedBlocksByTopic[block.topic_id] = [];
        }
        missedBlocksByTopic[block.topic_id].push(block);
      }
    });

    if (missedTopicIdsFromDB.length > 0) {
      console.log(`📋 Found ${missedTopicIdsFromDB.length} missed topic(s) from previous weeks that need rescheduling`);
      console.log(`📋 Total missed blocks: ${missedBlocks.length}`);
    }

    // IMPORTANT: Keep rerated topics separate from missed topics
    // - Missed topics = same-week catch-up (rescheduled within current week)
    // - Rerated topics = next week priorities (prioritized within their rating buckets)
    // Do NOT combine them - they serve different purposes

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
        missedTopicsFromDBCount: missedTopicIdsFromDB.length,
        targetWeekStart: finalTargetWeekStart
      });
      
      plan = await generateStudyPlan({
        subjects,
        ratings: effectiveRatings,
        topicStatus: effectiveTopicStatus,
        availability: effectiveAvailability,
        timePreferences: effectiveTimePreferences,
        blockedTimes: combinedBlockedTimes,
        studyBlockDuration,
        targetWeekStart: finalTargetWeekStart,
        actualStartDate: finalActualStartDate, // For partial weeks - skip days before this date (or tomorrow when no slots on cutoff day)
        missedTopicIds: missedTopicIdsFromDB, // Only actual missed blocks (same-week catch-up)
        reratedTopicIds, // Rerated topics (prioritized within rating buckets)
        ongoingTopics, // Pass ongoing topics for gap day enforcement and session tracking
        effectiveNow,
        clientCutoffMinutes: useDevOverride
          ? null
          : (typeof clientMinutesFromMidnight === 'number' && !Number.isNaN(clientMinutesFromMidnight)
            ? clientMinutesFromMidnight
            : null)
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

    // Full regeneration: delete ALL blocks in the target week so the new plan replaces them.
    // (Previously we "preserved" existing blocks, which caused the same old blocks to show
    // and new blocks to be added on top = duplicates / blocks never changing.)
    console.log(`🗑️ Deleting ALL existing blocks for week ${finalTargetWeekStart} (${records.length} new blocks ready to insert)...`);
    const deleteStart = new Date(weekStartDate);
    deleteStart.setHours(0, 0, 0, 0);
    const deleteEnd = new Date(weekStartDate);
    deleteEnd.setDate(weekStartDate.getDate() + 6);
    deleteEnd.setHours(23, 59, 59, 999);

    console.log('🗑️ Deletion range:', {
      deleteStart: deleteStart.toISOString(),
      deleteEnd: deleteEnd.toISOString()
    });

    const { error: deleteError } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('user_id', userId)
      .gte('scheduled_at', deleteStart.toISOString())
      .lte('scheduled_at', deleteEnd.toISOString());

    if (!deleteError) {
      console.log('🗑️ Deleted all blocks in target week (full regeneration).');
    }
    if (deleteError) {
      console.error('Error deleting existing blocks:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to clear existing blocks',
        success: false
      }, { status: 500 });
    }
    
    console.log('✅ Existing blocks deleted, processing new blocks...');
    let insertedBlocks = [];
    
    if (records.length > 0) {
      // OPTION 3: Update existing missed blocks instead of always creating new ones
      // This avoids creating duplicates and keeps the database cleaner
      
      // Separate records into:
      // 1. Records for missed topics (update existing missed block)
      // 2. Records for other topics (create new blocks)
      const recordsToInsert = [];
      const updatesToPerform = [];
      const missedBlockIdsToUpdate = new Set(); // Track which missed blocks we're updating
      
      // Group records by topic_id to handle multiple blocks per topic
      const recordsByTopic = {};
      records.forEach(record => {
        if (record.topic_id) {
          if (!recordsByTopic[record.topic_id]) {
            recordsByTopic[record.topic_id] = [];
          }
          recordsByTopic[record.topic_id].push(record);
        } else {
          // Break blocks or other non-topic blocks - always insert
          recordsToInsert.push(record);
        }
      });
      
      // For each topic, decide whether to update missed blocks or create new ones
      for (const topicId of Object.keys(recordsByTopic)) {
        const topicRecords = recordsByTopic[topicId];
        const missedBlocksForTopic = missedBlocksByTopic[topicId] || [];
        
        if (missedBlocksForTopic.length > 0) {
          // This topic has missed blocks - update first one, create rest
          console.log(`📝 Topic ${topicId}: ${missedBlocksForTopic.length} missed block(s), ${topicRecords.length} new block(s) scheduled`);
          
          // Update the first missed block with the first scheduled time
          const firstMissedBlock = missedBlocksForTopic[0];
          const firstRecord = topicRecords[0];
          
          updatesToPerform.push({
            blockId: firstMissedBlock.id,
            updates: {
              scheduled_at: firstRecord.scheduled_at,
              status: 'scheduled',
              duration_minutes: firstRecord.duration_minutes,
              ai_rationale: firstRecord.ai_rationale,
              session_number: firstRecord.session_number,
              session_total: firstRecord.session_total
            }
          });
          missedBlockIdsToUpdate.add(firstMissedBlock.id);
          
          // If scheduler created more blocks than we have missed blocks, insert the extras
          for (let i = 1; i < topicRecords.length; i++) {
            if (i < missedBlocksForTopic.length) {
              // We have another missed block to update
              const missedBlock = missedBlocksForTopic[i];
              const record = topicRecords[i];
              updatesToPerform.push({
                blockId: missedBlock.id,
                updates: {
                  scheduled_at: record.scheduled_at,
                  status: 'scheduled',
                  duration_minutes: record.duration_minutes,
                  ai_rationale: record.ai_rationale,
                  session_number: record.session_number,
                  session_total: record.session_total
                }
              });
              missedBlockIdsToUpdate.add(missedBlock.id);
            } else {
              // No more missed blocks to update - create new one
              recordsToInsert.push(topicRecords[i]);
            }
          }
          
          // If we have more missed blocks than scheduled blocks, delete the extras
          const extraMissedBlocks = missedBlocksForTopic.slice(topicRecords.length);
          if (extraMissedBlocks.length > 0) {
            console.log(`🧹 Topic ${topicId}: ${extraMissedBlocks.length} extra missed block(s) to clean up`);
            const extraIds = extraMissedBlocks.map(b => b.id);
            const { error: deleteExtraError } = await supabaseAdmin
              .from('blocks')
              .delete()
              .in('id', extraIds);
            
            if (deleteExtraError) {
              console.error(`Failed to delete extra missed blocks for topic ${topicId}:`, deleteExtraError);
            }
          }
        } else {
          // No missed blocks for this topic - create all as new
          topicRecords.forEach(record => recordsToInsert.push(record));
        }
      }
      
      console.log(`📊 Block operations: ${updatesToPerform.length} updates, ${recordsToInsert.length} inserts`);
      
      // Perform updates
      for (const update of updatesToPerform) {
        const { error: updateError } = await supabaseAdmin
          .from('blocks')
          .update(update.updates)
          .eq('id', update.blockId)
          .eq('user_id', userId);
        
        if (updateError) {
          console.error(`Failed to update missed block ${update.blockId}:`, updateError);
        } else {
          console.log(`✅ Updated missed block ${update.blockId} to ${update.updates.scheduled_at}`);
          insertedBlocks.push({
            id: update.blockId,
            topic_id: records.find(r => r.scheduled_at === update.updates.scheduled_at)?.topic_id,
            ...update.updates
          });
        }
      }
      
      // Insert new blocks (using upsert to handle conflicts gracefully)
      // This makes the API idempotent - if blocks already exist (e.g., from network retry),
      // they will be updated instead of causing a unique constraint violation
      if (recordsToInsert.length > 0) {
        console.log(`📝 Upserting ${recordsToInsert.length} blocks (will update if they already exist)...`);
        
        const { data: upserted, error: upsertError } = await supabaseAdmin
          .from('blocks')
          .upsert(recordsToInsert, {
            onConflict: 'user_id,topic_id,scheduled_at',
            ignoreDuplicates: false // Update existing rows instead of ignoring
          })
          .select('id, topic_id, scheduled_at, duration_minutes, status, ai_rationale, session_number, session_total');
        
        if (upsertError) {
          console.error('Failed to upsert blocks:', upsertError);
          console.error('Upsert error details:', {
            code: upsertError.code,
            message: upsertError.message,
            details: upsertError.details,
            hint: upsertError.hint
          });
          throw new Error('Failed to save blocks to database');
        }
        
        console.log(`✅ Successfully upserted ${upserted?.length || 0} blocks`);
        insertedBlocks.push(...(upserted || []));
      }
      
      // Clean up any remaining missed blocks that weren't updated
      // (blocks for topics that weren't scheduled this week)
      const missedBlockIdsNotUpdated = (missedBlocks || [])
        .filter(b => !missedBlockIdsToUpdate.has(b.id))
        .map(b => b.id);
      
      if (missedBlockIdsNotUpdated.length > 0) {
        console.log(`🧹 Cleaning up ${missedBlockIdsNotUpdated.length} missed block(s) that weren't rescheduled this week`);
        // Note: We leave these as 'missed' - they'll be picked up in the next week's generation
        // This is intentional - if a topic wasn't scheduled this week, it shouldn't be deleted
      }
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
    
    // Determine the actual week start from the blocks (in case it differs from targetWeekStart)
    // This handles cases like Sunday signup generating for next week
    let actualWeekStart = finalTargetWeekStart;
    if (studyBlocksOnly.length > 0) {
      const earliestBlock = new Date(studyBlocksOnly[0].scheduled_at);
      const earliestWeekStart = getMonday(earliestBlock);
      actualWeekStart = earliestWeekStart.toISOString().split('T')[0];
    }
    
    return NextResponse.json({
      success: true,
      blocks: studyBlocksOnly,
      weekStart: actualWeekStart,
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
    const devTimeOverride = searchParams.get('devTimeOverride'); // Time override for dev mode
    
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
    
    // Get effective current time (respects dev time override)
    const effectiveNow = getEffectiveNow(devTimeOverride);
    
    // Determine which week to fetch blocks for
    let weekStartDate;
    if (targetWeek) {
      // Parse date string as local time (not UTC) to avoid timezone issues
      // The frontend sends YYYY-MM-DD format, parse it as local date components
      const [year, month, day] = targetWeek.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed, creates local date
      weekStartDate = getMonday(dateObj);
    } else {
      // Default to current week (using effective time)
      const today = new Date(effectiveNow);
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

    let unavailableTimes = await loadBlockedTimes(userId, weekStartDate, weekEndDate);
    
    // If no unavailable times found for target week, and we're fetching for a future week,
    // fall back to current week's unavailable times (aligned to target week)
    if (unavailableTimes.length === 0) {
      const today = new Date(effectiveNow);
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
        unavailableTimes = currentWeekUnavailable.map((range) => {
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
        
        console.log(`✅ Aligned ${unavailableTimes.length} unavailable times from current week to target week`);
      }
    }
    
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