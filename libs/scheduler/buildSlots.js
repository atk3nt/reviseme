/**
 * Build available time slots for a week given availability and time preferences.
 */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_WEEKDAY = { earliest: '09:00', latest: '20:00' };

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
 * @returns {Array<{ day: string, start_time: string, duration_minutes: number, startDate: Date, endDate: Date, slotIndex: number }>} slots
 */
export function buildWeeklySlots({
  availability = {},
  timePreferences = {},
  blockedTimes = [],
  blockDuration = 0.5,
  targetWeekStart
} = {}) {
  const slots = [];
  const durationMinutes = Math.round((blockDuration || 0.5) * 60);
  const weekStartDate = getWeekStartDate(targetWeekStart);
  const blockedIntervals = (blockedTimes || []).map((range) => ({
    start: new Date(range.start),
    end: new Date(range.end)
  }));

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
    const dayName = DAYS[dayIndex];
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

    const earliestStr = isWeekend && weekendSplit
      ? timePreferences.weekendEarliest || DEFAULT_WEEKDAY.earliest
      : timePreferences.weekdayEarliest || DEFAULT_WEEKDAY.earliest;

    const latestStr = isWeekend && weekendSplit
      ? timePreferences.weekendLatest || DEFAULT_WEEKDAY.latest
      : timePreferences.weekdayLatest || DEFAULT_WEEKDAY.latest;

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

      if (!overlaps(slotStartDate, slotEndDate, blockedIntervals)) {
        slots.push({
          day: dayName,
          start_time: formatMinutesToTime(candidateMinutes),
          duration_minutes: durationMinutes,
          startDate: slotStartDate,
          endDate: slotEndDate,
          slotIndex: createdSlots
        });
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

  return slots;
}
