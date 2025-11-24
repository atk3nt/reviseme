import { buildWeeklySlots } from '../libs/scheduler/buildSlots';

async function main() {
  const slots = buildWeeklySlots({
    availability: {
      monday: 4, // 4 hours
      tuesday: 3,
      wednesday: 2
    },
    timePreferences: {
      weekdayEarliest: '09:00',
      weekdayLatest: '18:00',
      useSameWeekendTimes: true
    },
    blockedTimes: [
      {
        start: '2025-11-03T10:30:00.000Z',
        end: '2025-11-03T11:30:00.000Z'
      }
    ],
    blockDuration: 0.5,
    targetWeekStart: '2025-11-03'
  });

  console.log('Generated slots:', slots);
  console.log('Total slots:', slots.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
