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
  targetWeekStart
} = {}) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return [];
  }

  const topics = await loadTopicsForSubjects(subjects);
  const filteredTopics = filterTopics(topics, ratings, topicStatus);
  if (filteredTopics.length === 0) {
    return [];
  }

  const prioritizedTopics = prioritizeTopics(filteredTopics, ratings);
  const weekStart = resolveTargetWeekStart(targetWeekStart);
  const alignedBlockedTimes = alignBlockedTimes(blockedTimes, weekStart);
  console.log('Scheduler debug', JSON.stringify({
    weekStart,
    blockedCount: Array.isArray(blockedTimes) ? blockedTimes.length : 0,
    firstBlocked: alignedBlockedTimes.slice(0, 5)
  }, null, 2));

  const targetIso = `${weekStart}T00:00:00Z`;

  const slots = buildWeeklySlots({
    availability,
    timePreferences,
    blockedTimes: alignedBlockedTimes,
    blockDuration: studyBlockDuration,
    targetWeekStart: targetIso
  });

  if (slots.length === 0) {
    return [];
  }

  const scheduledBlocks = assignTopicsToSlots(slots, prioritizedTopics);
  if (process.env.NODE_ENV === 'development') {
    console.log('Scheduled sample', scheduledBlocks.slice(0, 10).map(b => `${b.day} ${b.start_time}`));
  }
  return scheduledBlocks.map(({ slotIndex, ...block }) => ({
    ...block,
    week_start: weekStart
  }));
}