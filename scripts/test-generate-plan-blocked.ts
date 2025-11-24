import { generateStudyPlan } from '../libs/scheduler';

async function main() {
  const plan = await generateStudyPlan({
    subjects: ['history'],
    ratings: {
      'topic-1': 2,
      'topic-2': 3,
      'topic-3': 4,
      'topic-4': 5,
    },
    topicStatus: {},
    availability: {
      monday: 4,
    },
    timePreferences: {
      weekdayEarliest: '09:00',
      weekdayLatest: '17:00',
    },
    blockedTimes: [
      { start: '2025-11-10T10:00:00+00:00', end: '2025-11-10T10:30:00+00:00' },
      { start: '2025-11-10T10:30:00+00:00', end: '2025-11-10T11:00:00+00:00' },
    ],
    studyBlockDuration: 0.5,
    targetWeekStart: '2025-11-10',
  });

  console.log(plan.map(block => `${block.day} ${block.start_time}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

