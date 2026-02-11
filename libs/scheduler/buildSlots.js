/**
 * Build available time slots for a week given availability and time preferences.
 */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function parseTimeToMinutes(timeString = '00:00') {
  const [hours, minutes] = timeString.split(':').map((part) => Number(part) || 0);
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes = 0) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** Parse a date string (YYYY-MM-DD or with time) as local midnight. */
function parseLocalDateOnly(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const dateOnly = dateStr.split('T')[0];
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekStartDate(targetWeekStart) {
  if (targetWeekStart) {
    const date = parseLocalDateOnly(targetWeekStart);
    if (date && !isNaN(date.getTime())) return date;
  }
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function overlaps(slotStart, slotEnd, blockedIntervals) {
  return blockedIntervals.some(({ start, end }) => slotStart < end && slotEnd > start);
}

/**
 * @param {Object} params
 * @param {{ [day: string]: number }} params.availability - Hours per day.
 * @param {Object} params.timePreferences - Earliest/latest times.
 * @param {Array<{ start: string, end: string }>} params.blockedTimes - ISO ranges to avoid.
 * @param {number} params.blockDuration - Duration of each block in hours.
 * @param {string} params.targetWeekStart - ISO date string for week Monday.
 * @param {string} params.actualStartDate - ISO date string for actual start (for partial weeks).
 * @returns {Array<{ day: string, start_time: string, duration_minutes: number, startDate: Date, endDate: Date, slotIndex: number }>} slots
 */
export function buildWeeklySlots({
  availability = {},
  timePreferences = {},
  blockedTimes = [],
  blockDuration = 0.5,
  targetWeekStart,
  actualStartDate, // For partial weeks - skip days before this
  effectiveNow = null, // For dev mode time override
  clientCutoffMinutes = null // User's "now" as minutes from midnight so first block is next :00 or :30 in their TZ
} = {}) {
  const slots = [];
  const durationMinutes = Math.round((blockDuration || 0.5) * 60);
  const weekStartDate = getWeekStartDate(targetWeekStart);
  
  if (process.env.NODE_ENV === 'development' && effectiveNow) {
    console.log('🕐 buildSlots received effectiveNow:', effectiveNow.toLocaleString(), '(signup/current time - no slots before this)');
  }
  
  // Validate weekStartDate
  if (!weekStartDate || isNaN(weekStartDate.getTime())) {
    console.error('⚠️ Invalid weekStartDate:', weekStartDate, 'targetWeekStart:', targetWeekStart);
    return [];
  }
  
  // For partial weeks, determine the actual start date (local time)
  let schedulingStartDate = weekStartDate;
  if (actualStartDate) {
    const parsedActualStart = parseLocalDateOnly(actualStartDate);
    if (parsedActualStart && !isNaN(parsedActualStart.getTime()) && parsedActualStart > weekStartDate) {
      schedulingStartDate = parsedActualStart;
      console.log('📅 Partial week: scheduling starts from', actualStartDate, 'instead of', targetWeekStart);
    }
  }
  
  const blockedIntervals = (blockedTimes || []).map((range) => ({
    start: new Date(range.start),
    end: new Date(range.end)
  }));
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🚫 buildSlots received blocked times:', {
      count: blockedIntervals.length,
      sample: blockedIntervals.slice(0, 3).map(b => ({
        start: b.start.toISOString(),
        end: b.end.toISOString()
      }))
    });
  }

  // Cutoff = plan generation / signup time. Only schedule at or after this time.
  // When client sends clientCutoffMinutes (minutes from midnight in user TZ), use it so first block is next :00 or :30 in their time — not server time.
  const cutoff = effectiveNow || new Date();
  const cutoffDayStr = cutoff.toDateString();
  const cutoffDateOnly = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());
  const useClientCutoff = typeof clientCutoffMinutes === 'number' && !Number.isNaN(clientCutoffMinutes);
  const cutoffMinutesWithSeconds = useClientCutoff
    ? clientCutoffMinutes
    : cutoff.getHours() * 60 + cutoff.getMinutes() + cutoff.getSeconds() / 60 + cutoff.getMilliseconds() / 60000;
  const roundedCutoffMinutes = Math.ceil(cutoffMinutesWithSeconds / 30) * 30;
  const cutoffTime = cutoffDateOnly.getTime() + roundedCutoffMinutes * 60 * 1000;

  if (process.env.NODE_ENV === 'development') {
    console.log('🕐 buildSlots cutoff (first slot at next :00 or :30):', {
      cutoffDayStr,
      source: useClientCutoff ? 'clientMinutesFromMidnight' : 'effectiveNow',
      rawMinutes: formatMinutesToTime(Math.floor(cutoffMinutesWithSeconds)),
      roundedTo: formatMinutesToTime(roundedCutoffMinutes)
    });
  }

  // Extract week start as local calendar components (used for all day/slot math)
  const dateOnly = (targetWeekStart || '').split('T')[0];
  const year = parseInt(dateOnly.substring(0, 4), 10);
  const month = parseInt(dateOnly.substring(5, 7), 10) - 1; // JS months 0-indexed
  const day = parseInt(dateOnly.substring(8, 10), 10);

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
    const dayName = DAYS[dayIndex];
    
    // This day's date at local midnight (used for cutoff and skip-before-start)
    const localDayDate = new Date(year, month, day + dayIndex);
    localDayDate.setHours(0, 0, 0, 0);
    
    // Skip days before the actual start date (for partial weeks) - all local
    if (localDayDate < schedulingStartDate) {
      continue;
    }
    // Only schedule on or after the cutoff date (never create slots for past days)
    if (localDayDate < cutoffDateOnly) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏭️ Skipping past day (no slots before current time):', dayName, localDayDate.toDateString());
      }
      continue;
    }
    
    const availableHours = availability[dayName] ?? 0;
    if (!availableHours || availableHours <= 0) {
      continue;
    }

    // Calculate total possible slots, but only use 80% to leave buffer for rescheduling
    const totalPossibleSlots = Math.floor(availableHours / blockDuration);
    if (totalPossibleSlots <= 0) {
      continue;
    }
    
    // Use only 80% of available slots, leaving 20% as buffer
    const slotCount = Math.max(1, Math.floor(totalPossibleSlots * 0.8));

    const isWeekend = dayIndex >= 5;
    const weekendSplit = timePreferences.useSameWeekendTimes === false;

    // Use user's actual preferences; fall back to defaults if missing so we don't produce zero slots
    let earliestStr, latestStr;
    if (isWeekend && weekendSplit && timePreferences.weekendEarliest && timePreferences.weekendLatest) {
      earliestStr = timePreferences.weekendEarliest;
      latestStr = timePreferences.weekendLatest;
    } else {
      earliestStr = timePreferences.weekdayEarliest;
      latestStr = timePreferences.weekdayLatest;
    }
    if (!earliestStr || !latestStr) {
      earliestStr = earliestStr || '08:00';
      latestStr = latestStr || '21:00';
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️ buildSlots: Using default times for ${dayName} (08:00–21:00)`);
      }
    }

    const earliestMinutes = parseTimeToMinutes(earliestStr);
    const latestMinutes = parseTimeToMinutes(latestStr);

    // First block on the generation/signup day MUST be at the next :00 or :30 after cutoff.
    // All slot starts are on :00 or :30 only (no :15, :20, :45, :50).
    const isCutoffDay = localDayDate.toDateString() === cutoffDayStr;
    const slotGranularityMinutes = 30;

    let candidateMinutes = earliestMinutes;
    if (isCutoffDay) {
      candidateMinutes = Math.max(earliestMinutes, roundedCutoffMinutes);
      if (process.env.NODE_ENV === 'development') {
        console.log(`📅 ${dayName} is generation/signup day - first slot at or after:`, {
          day: dayName,
          cutoffTime: formatMinutesToTime(roundedCutoffMinutes),
          earliestAllowed: formatMinutesToTime(earliestMinutes),
          actualStartTime: formatMinutesToTime(candidateMinutes)
        });
      }
    }
    // Snap to next :00 or :30 so we never schedule at :15, :45, etc.
    candidateMinutes = Math.ceil(candidateMinutes / slotGranularityMinutes) * slotGranularityMinutes;

    // If we're on the cutoff day and there's no time left (first slot would be at or after latest), skip this day entirely.
    // Plan starts next day — no blocks on today.
    if (isCutoffDay && candidateMinutes >= latestMinutes) {
      if (process.env.NODE_ENV === 'development') {
        console.log('📅 Skipping cutoff day (no slots left) — plan starts next day:', dayName);
      }
      continue;
    }

    let createdSlots = 0;
    const maxIterations = 48; // at 30-minute granularity this covers the day
    let iterations = 0;

    while (createdSlots < slotCount && candidateMinutes + durationMinutes <= latestMinutes && iterations < maxIterations) {
      // Build slot in LOCAL time so candidateMinutes (from getHours/getMinutes) matches.
      // Using setUTCMinutes(candidateMinutes) would interpret 18:00 as 18:00 UTC, which is wrong
      // when the user/signup time is in a different timezone (e.g. 6 PM local = 02:00 UTC next day in PST).
      const slotStartDate = new Date(
        year,
        month,
        day + dayIndex,
        Math.floor(candidateMinutes / 60),
        candidateMinutes % 60,
        0,
        0
      );

      const slotEndDate = new Date(slotStartDate.getTime() + durationMinutes * 60 * 1000);

      // Validate dates before creating slot
      if (isNaN(slotStartDate.getTime()) || isNaN(slotEndDate.getTime())) {
        console.warn('⚠️ Invalid date created for slot, skipping:', { slotStartDate, slotEndDate, candidateMinutes, dayIndex });
        candidateMinutes = Math.ceil((candidateMinutes + 1) / slotGranularityMinutes) * slotGranularityMinutes;
        iterations += 1;
        continue;
      }
      
      if (!overlaps(slotStartDate, slotEndDate, blockedIntervals)) {
        // Final validation before adding slot
        if (isNaN(slotStartDate.getTime()) || isNaN(slotEndDate.getTime())) {
          console.warn('⚠️ Skipping slot with invalid dates:', { slotStartDate, slotEndDate, candidateMinutes, dayIndex });
          candidateMinutes = Math.ceil((candidateMinutes + 1) / slotGranularityMinutes) * slotGranularityMinutes;
          iterations += 1;
          continue;
        }
        
        const slot = {
          day: dayName,
          start_time: formatMinutesToTime(candidateMinutes),
          duration_minutes: durationMinutes,
          startDate: slotStartDate,
          endDate: slotEndDate,
          slotIndex: createdSlots
        };
        
        // Validate slot object before pushing
        if (!slot.startDate || !slot.endDate) {
          console.error('❌ Created slot missing dates:', slot);
          candidateMinutes = Math.ceil((candidateMinutes + 1) / slotGranularityMinutes) * slotGranularityMinutes;
          iterations += 1;
          continue;
        }
        // Never allow a slot before cutoff (safety net - slots must start after signup/current time)
        if (slot.startDate.getTime() < cutoffTime) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🚫 Skipping slot before cutoff:', slot.startDate.toLocaleString(), '<', cutoff.toLocaleString());
          }
          candidateMinutes += durationMinutes;
          candidateMinutes = Math.ceil(candidateMinutes / slotGranularityMinutes) * slotGranularityMinutes;
          iterations += 1;
          continue;
        }
        
        slots.push(slot);
        createdSlots += 1;
      } else {
        // Slot overlaps with blocked time - skip it
        if (process.env.NODE_ENV === 'development') {
          const blockingInterval = blockedIntervals.find(({ start, end }) => 
            slotStartDate < end && slotEndDate > start
          );
          console.log('⏭️ Skipping slot due to blocked time:', {
            day: dayName,
            slotTime: `${slotStartDate.toISOString()} - ${slotEndDate.toISOString()}`,
            blockingInterval: blockingInterval ? {
              start: blockingInterval.start.toISOString(),
              end: blockingInterval.end.toISOString()
            } : 'unknown'
          });
        }
      }

      candidateMinutes += durationMinutes;
      candidateMinutes = Math.ceil(candidateMinutes / slotGranularityMinutes) * slotGranularityMinutes;
      iterations += 1;
    }
  }

  // Final validation - ensure all slots are valid before returning
  const validSlots = slots.filter(slot => {
    if (!slot || typeof slot !== 'object') {
      console.warn('⚠️ buildSlots: Invalid slot (not an object):', slot);
      return false;
    }
    if (!slot.startDate || !(slot.startDate instanceof Date) || isNaN(slot.startDate.getTime())) {
      console.warn('⚠️ buildSlots: Invalid slot (missing/invalid startDate):', slot);
      return false;
    }
    if (!slot.endDate || !(slot.endDate instanceof Date) || isNaN(slot.endDate.getTime())) {
      console.warn('⚠️ buildSlots: Invalid slot (missing/invalid endDate):', slot);
      return false;
    }
    return true;
  });

  if (validSlots.length !== slots.length) {
    console.warn(`⚠️ buildSlots: Filtered out ${slots.length - validSlots.length} invalid slots. Returning ${validSlots.length} valid slots.`);
  }

  if (process.env.NODE_ENV === 'development' && validSlots.length > 0) {
    console.log('✅ buildSlots: Created', validSlots.length, 'valid slots');
  }

  // ALWAYS enforce: no slot on "today" may start before generation/signup time (reuse cutoff from above).
  const beforeFilter = validSlots.length;
  const finalSlots = validSlots.filter(slot => {
    const slotDayStr = slot.startDate.toDateString();
    if (slotDayStr !== cutoffDayStr) return true; // keep slots on other days
    if (slot.startDate.getTime() >= cutoffTime) return true; // keep if at or after cutoff
    if (process.env.NODE_ENV === 'development') {
      console.log('🚫 Dropping slot before signup/current time:', slot.startDate.toLocaleString(), '<', cutoff.toLocaleString());
    }
    return false;
  });
  if (process.env.NODE_ENV === 'development' && beforeFilter !== finalSlots.length) {
    console.log('🚫 buildSlots: Dropped', beforeFilter - finalSlots.length, 'slot(s) that were before cutoff (effectiveNow or now)');
  }

  return finalSlots;
}
