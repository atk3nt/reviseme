/**
 * Study plan scheduler placeholder plus helper exports.
 */

import { loadTopicsForSubjects } from './scheduler/loadTopics';
import { filterTopics } from './scheduler/filterTopics';
import { prioritizeTopics } from './scheduler/prioritizeTopics';
import { buildWeeklySlots } from './scheduler/buildSlots';
import { assignTopicsToSlots } from './scheduler/assignTopics';

function resolveTargetWeekStart(targetWeekStart) {
  if (targetWeekStart) {
    return targetWeekStart;
  }
  const now = new Date();
  now.setDate(now.getDate() + 1); // day after today
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function alignBlockedTimes(blockedTimes = [], targetWeekStart) {
  if (!targetWeekStart || !Array.isArray(blockedTimes) || blockedTimes.length === 0) {
    return blockedTimes || [];
  }

  const baseIso = `${targetWeekStart}T00:00:00Z`;
  const targetMonday = new Date(baseIso);
  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);
  targetSunday.setUTCHours(23, 59, 59, 999);

  return blockedTimes.map((range) => {
    const originalStart = new Date(range.start);
    const originalEnd = new Date(range.end);

    // Check if this blocked time is already in the target week
    // If it is, don't align it - return it as-is
    if (originalStart >= targetMonday && originalEnd <= targetSunday) {
      return range;
    }

    // Otherwise, align it to the target week based on day of week
    const dayIndex = (originalStart.getUTCDay() + 6) % 7; // Monday = 0

    const alignedStart = new Date(targetMonday);
    alignedStart.setUTCDate(targetMonday.getUTCDate() + dayIndex);
    alignedStart.setUTCHours(originalStart.getUTCHours(), originalStart.getUTCMinutes(), 0, 0);

    const alignedEnd = new Date(targetMonday);
    alignedEnd.setUTCDate(targetMonday.getUTCDate() + dayIndex);
    alignedEnd.setUTCHours(originalEnd.getUTCHours(), originalEnd.getUTCMinutes(), 0, 0);

    if (alignedEnd <= alignedStart) {
      alignedEnd.setUTCDate(alignedEnd.getUTCDate() + 1);
    }

    return {
      ...range,
      start: alignedStart.toISOString(),
      end: alignedEnd.toISOString()
    };
  });
}

export async function generateStudyPlan({
  subjects = [],
  ratings = {},
  topicStatus = {},
  availability = {},
  timePreferences = {},
  blockedTimes = [],
  studyBlockDuration = 0.5,
  targetWeekStart,
  actualStartDate, // For partial weeks - skip days before this date
  missedTopicIds = [], // Topic IDs that were missed/incomplete from previous weeks (same-week catch-up)
  reratedTopicIds = [], // Topic IDs that were rerated (prioritized within rating buckets)
  ongoingTopics = {}, // { topicId: { sessionsScheduled: number, sessionsRequired: number, lastSessionDate: Date } }
  effectiveNow = null, // For dev mode time override
  clientCutoffMinutes = null, // User's "now" as minutes from midnight so first block is next :00 or :30 in their TZ
  allowUnratedTopics = false // When true (e.g. generate current week when empty), include topics with no rating so they get default priority
} = {}) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return [];
  }

  const topics = await loadTopicsForSubjects(subjects);
  const filteredTopics = filterTopics(topics, ratings, topicStatus, { allowUnratedTopics });
  if (filteredTopics.length === 0) {
    return [];
  }

  const prioritizedTopics = prioritizeTopics(filteredTopics, ratings, missedTopicIds, reratedTopicIds);
  const weekStart = resolveTargetWeekStart(targetWeekStart);
  const alignedBlockedTimes = alignBlockedTimes(blockedTimes, weekStart);
  console.log('Scheduler debug', JSON.stringify({
    weekStart,
    actualStartDate: actualStartDate || weekStart,
    isPartialWeek: actualStartDate && actualStartDate !== weekStart,
    blockedCount: Array.isArray(blockedTimes) ? blockedTimes.length : 0,
    firstBlocked: alignedBlockedTimes.slice(0, 5),
    missedTopicsCount: missedTopicIds.length,
    ongoingTopicsCount: Object.keys(ongoingTopics).length
  }, null, 2));

  // Pass date-only (YYYY-MM-DD) so buildSlots parses as local time throughout
  const slots = buildWeeklySlots({
    availability,
    timePreferences,
    blockedTimes: alignedBlockedTimes,
    blockDuration: studyBlockDuration,
    targetWeekStart: weekStart, // date-only string for local-time parsing
    actualStartDate, // For partial weeks
    effectiveNow,
    clientCutoffMinutes
  });

  if (slots.length === 0) {
    return [];
  }

  // Validate all slots have required properties before passing to assignTopicsToSlots
  const validSlots = slots.filter(slot => {
    if (!slot || typeof slot !== 'object') {
      console.warn('⚠️ Invalid slot (not an object):', slot);
      return false;
    }
    if (!slot.startDate || !(slot.startDate instanceof Date) || isNaN(slot.startDate.getTime())) {
      console.warn('⚠️ Invalid slot (missing or invalid startDate):', slot);
      return false;
    }
    if (!slot.endDate || !(slot.endDate instanceof Date) || isNaN(slot.endDate.getTime())) {
      console.warn('⚠️ Invalid slot (missing or invalid endDate):', slot);
      return false;
    }
    return true;
  });

  if (validSlots.length === 0) {
    console.error('❌ No valid slots after validation. Total slots:', slots.length);
    if (process.env.NODE_ENV === 'development') {
      console.error('Sample invalid slots:', slots.slice(0, 3));
    }
    return [];
  }

  if (validSlots.length !== slots.length) {
    console.warn(`⚠️ Filtered out ${slots.length - validSlots.length} invalid slots`);
  }

  const scheduledBlocks = assignTopicsToSlots(validSlots, prioritizedTopics, ongoingTopics);
  if (process.env.NODE_ENV === 'development') {
    console.log('Scheduled sample', scheduledBlocks.slice(0, 10).map(b => `${b.day} ${b.start_time}`));
    }
  return scheduledBlocks.map(({ slotIndex, ...block }) => ({
    ...block,
    week_start: weekStart
  }));
}