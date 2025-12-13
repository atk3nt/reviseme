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

function getWeekStartDate(targetWeekStart) {
  if (targetWeekStart) {
    const iso = typeof targetWeekStart === 'string' && !targetWeekStart.includes('T')
      ? `${targetWeekStart}T00:00:00Z`
      : targetWeekStart;
    const date = new Date(iso);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
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
  actualStartDate // For partial weeks - skip days before this
} = {}) {
  const slots = [];
  const durationMinutes = Math.round((blockDuration || 0.5) * 60);
  const weekStartDate = getWeekStartDate(targetWeekStart);
  
  // Validate weekStartDate
  if (!weekStartDate || isNaN(weekStartDate.getTime())) {
    console.error('⚠️ Invalid weekStartDate:', weekStartDate, 'targetWeekStart:', targetWeekStart);
    return [];
  }
  
  // For partial weeks, determine the actual start date
  let schedulingStartDate = weekStartDate;
  if (actualStartDate) {
    const parsedActualStart = new Date(`${actualStartDate}T00:00:00Z`);
    if (!isNaN(parsedActualStart.getTime()) && parsedActualStart > weekStartDate) {
      schedulingStartDate = parsedActualStart;
      console.log('📅 Partial week: scheduling starts from', actualStartDate, 'instead of', targetWeekStart);
    }
  }
  
  const blockedIntervals = (blockedTimes || []).map((range) => ({
    start: new Date(range.start),
    end: new Date(range.end)
  }));

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
    const dayName = DAYS[dayIndex];
    
    // Calculate the date for this day
    const dayDate = new Date(weekStartDate);
    dayDate.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
    dayDate.setUTCHours(0, 0, 0, 0);
    
    // Skip days before the actual start date (for partial weeks)
    if (dayDate < schedulingStartDate) {
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

    // Use user's actual preferences - NO DEFAULTS
    // If weekend times are set and we're on a weekend, use them; otherwise use weekday times
    let earliestStr, latestStr;
    if (isWeekend && weekendSplit && timePreferences.weekendEarliest && timePreferences.weekendLatest) {
      earliestStr = timePreferences.weekendEarliest;
      latestStr = timePreferences.weekendLatest;
    } else {
      // Use weekday times (required)
      earliestStr = timePreferences.weekdayEarliest;
      latestStr = timePreferences.weekdayLatest;
    }
    
    // Validate we have times - skip this day if missing
    if (!earliestStr || !latestStr) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️ Skipping ${dayName}: Missing time preferences (earliest: ${earliestStr}, latest: ${latestStr})`);
      }
      continue;
    }

    const earliestMinutes = parseTimeToMinutes(earliestStr);
    const latestMinutes = parseTimeToMinutes(latestStr);

    let candidateMinutes = earliestMinutes;
    let createdSlots = 0;
    const maxIterations = 96; // at 15-minute granularity this covers the day
    let iterations = 0;

    while (createdSlots < slotCount && candidateMinutes + durationMinutes <= latestMinutes && iterations < maxIterations) {
      const slotStartDate = new Date(weekStartDate);
      slotStartDate.setUTCDate(slotStartDate.getUTCDate() + dayIndex);
      slotStartDate.setUTCHours(0, 0, 0, 0);
      slotStartDate.setUTCMinutes(candidateMinutes);

      const slotEndDate = new Date(slotStartDate);
      slotEndDate.setUTCMinutes(slotStartDate.getUTCMinutes() + durationMinutes);

      // Validate dates before creating slot
      if (isNaN(slotStartDate.getTime()) || isNaN(slotEndDate.getTime())) {
        console.warn('⚠️ Invalid date created for slot, skipping:', { slotStartDate, slotEndDate, candidateMinutes, dayIndex });
        candidateMinutes += 15;
        iterations += 1;
        continue;
      }
      
      if (!overlaps(slotStartDate, slotEndDate, blockedIntervals)) {
        // Final validation before adding slot
        if (isNaN(slotStartDate.getTime()) || isNaN(slotEndDate.getTime())) {
          console.warn('⚠️ Skipping slot with invalid dates:', { slotStartDate, slotEndDate, candidateMinutes, dayIndex });
          candidateMinutes += 15;
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
          candidateMinutes += 15;
          iterations += 1;
          continue;
        }
        
        slots.push(slot);
        createdSlots += 1;
      } else {
        if (process.env.NODE_ENV === 'development') {
          const blockingInterval = blockedIntervals.find(({ start, end }) => 
            slotStartDate < new Date(end) && slotEndDate > new Date(start)
          );
          console.log('Skipping slot due to block', {
            slot: slotStartDate.toISOString(),
            blockingInterval: blockingInterval ? {
              start: blockingInterval.start,
              end: blockingInterval.end
            } : null
          });
        }
      }

      candidateMinutes += durationMinutes;
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

  return validSlots;
}
