import { config } from 'dotenv';
config({ path: '.env.local' });

import { generateStudyPlan } from '../libs/scheduler';

async function main() {
  const plan = await generateStudyPlan({
    subjects: ['biology'],
    ratings: {
      '226eec82-689f-4d3c-9fb3-0ba5b019b9b8': 2
    },
    availability: {
      monday: 2,
      tuesday: 2
    },
    timePreferences: {
      weekdayEarliest: '09:00',
      weekdayLatest: '17:00'
    },
    blockedTimes: [],
    studyBlockDuration: 0.5,
    targetWeekStart: '2025-11-03'
  });

  console.log(plan);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
