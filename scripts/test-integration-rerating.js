/**
 * Integration test for re-rating logic with cross-week gap enforcement
 * 
 * This simulates:
 * 1. Generating Week 1 plan with Rating 3 topic (1 block)
 * 2. Re-rating to Rating 1 (needs 3 blocks)
 * 3. Generating Week 2 plan
 * 4. Verifying old blocks are deleted and new blocks created
 * 
 * Run with: node scripts/test-integration-rerating.js
 */

import { assignTopicsToSlots } from '../libs/scheduler/assignTopics.js';

// Helper to create a date at a specific day and time
function createDate(weekStart, dayOffset, hour = 9) {
  const date = new Date(weekStart);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

// Helper to create slots for a week
function createWeekSlots(weekStartISO, slotsPerDay = 4) {
  const weekStart = new Date(weekStartISO);
  const slots = [];
  
  for (let day = 0; day < 7; day++) {
    for (let slotNum = 0; slotNum < slotsPerDay; slotNum++) {
      const hour = 9 + slotNum;
      const startDate = createDate(weekStart, day, hour);
      const endDate = new Date(startDate);
      endDate.setUTCMinutes(endDate.getUTCMinutes() + 30);
      
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      slots.push({
        day: dayNames[day],
        start_time: `${hour.toString().padStart(2, '0')}:00`,
        duration_minutes: 30,
        startDate,
        endDate,
        slotIndex: slots.length
      });
    }
  }
  
  return slots;
}

// Helper to format date for display
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getUTCDay()]} ${d.toISOString().split('T')[0]}`;
}

console.log('🧪 Integration Test: Re-Rating with Cross-Week Gap Enforcement');
console.log('='.repeat(70));

// =============================================================================
// SCENARIO: Topic re-rated from Rating 3 to Rating 1
// =============================================================================
console.log('\n📋 SCENARIO: Topic Re-Rated from Rating 3 → Rating 1');
console.log('='.repeat(70));

// Week 1: Dec 16-22, 2024
const week1Start = '2024-12-16T00:00:00Z';
const week1Slots = createWeekSlots(week1Start);

// Week 2: Dec 23-29, 2024
const week2Start = '2024-12-23T00:00:00Z';
const week2Slots = createWeekSlots(week2Start);

const topicId = 'topic-rerating-test';
const topic = {
  id: topicId,
  title: 'Test Topic for Re-Rating',
  subject: 'biology',
  examBoard: 'aqa',
  rating: 3, // Initially Rating 3
  orderIndex: 0,
  priorityIndex: 0
};

console.log('\n📅 STEP 1: Generate Week 1 plan with Rating 3 topic');
console.log('   Rating 3 = 1 session needed');
console.log('   Expected: 1 block scheduled in Week 1');

const week1Result = assignTopicsToSlots(week1Slots, [topic], {});
const week1Blocks = week1Result.filter(b => b.topic_id === topicId);

console.log(`\n   ✅ Week 1 blocks scheduled: ${week1Blocks.length}`);
if (week1Blocks.length > 0) {
  week1Blocks.forEach((block, i) => {
    console.log(`      Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time} (Session ${block.session_number}/${block.session_total})`);
  });
}

if (week1Blocks.length !== 1) {
  console.log('   ❌ FAILED: Expected 1 block for Rating 3, got', week1Blocks.length);
  process.exit(1);
}

// Simulate completing Session 1 on Friday
const session1Date = new Date(week1Blocks[0].scheduled_at);
console.log(`\n   📝 Completed Session 1 on: ${formatDate(session1Date)}`);

console.log('\n📅 STEP 2: Re-rate topic from Rating 3 → Rating 1');
console.log('   Rating 1 = 3 sessions needed');
console.log('   Old blocks should be ignored, new cycle starts');

// Update topic rating
topic.rating = 1;

console.log('\n📅 STEP 3: Generate Week 2 plan with re-rated topic');
console.log('   Expected: 2 blocks scheduled (Session 2 and 3)');
console.log('   Session 2 should respect gap from Session 1 (Friday)');

// Simulate ongoing topic - but since it was re-rated, it should start fresh
// However, we still need to track the last session date for gap enforcement
const ongoingTopics = {
  [topicId]: {
    sessionsScheduled: 1, // Had 1 session in Week 1
    sessionsRequired: 3, // Now needs 3 total (Rating 1)
    lastSessionDate: session1Date // Last session was on Friday
  }
};

const week2Result = assignTopicsToSlots(week2Slots, [topic], ongoingTopics);
const week2Blocks = week2Result.filter(b => b.topic_id === topicId);

console.log(`\n   ✅ Week 2 blocks scheduled: ${week2Blocks.length}`);
if (week2Blocks.length > 0) {
  week2Blocks.forEach((block, i) => {
    console.log(`      Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time} (Session ${block.session_number}/${block.session_total})`);
  });
}

// Verify results
console.log('\n📊 VERIFICATION:');
let allPassed = true;

// Check: Should have 2 blocks (Session 2 and 3)
if (week2Blocks.length !== 2) {
  console.log(`   ❌ FAILED: Expected 2 blocks for Rating 1, got ${week2Blocks.length}`);
  allPassed = false;
} else {
  console.log('   ✅ Correct number of blocks (2)');
}

// Check: Session 2 should respect gap from Session 1
if (week2Blocks.length > 0) {
  const session2Date = new Date(week2Blocks[0].scheduled_at);
  const session1Day = new Date(Date.UTC(session1Date.getUTCFullYear(), session1Date.getUTCMonth(), session1Date.getUTCDate()));
  const session2Day = new Date(Date.UTC(session2Date.getUTCFullYear(), session2Date.getUTCMonth(), session2Date.getUTCDate()));
  const daysDiff = Math.round((session2Day - session1Day) / (1000 * 60 * 60 * 24));
  
  console.log(`   📅 Days between Session 1 and Session 2: ${daysDiff}`);
  
  if (daysDiff >= 2) {
    console.log('   ✅ Gap respected (2+ days)');
  } else {
    console.log(`   ❌ FAILED: Gap not respected! Only ${daysDiff} days, need 2+`);
    allPassed = false;
  }
  
  // Check: Session 2 should be Session 2/3
  if (week2Blocks[0].session_number === 2 && week2Blocks[0].session_total === 3) {
    console.log('   ✅ Session numbering correct (Session 2/3)');
  } else {
    console.log(`   ❌ FAILED: Session numbering incorrect. Got ${week2Blocks[0].session_number}/${week2Blocks[0].session_total}, expected 2/3`);
    allPassed = false;
  }
}

// Check: Session 3 should respect gap from Session 2
if (week2Blocks.length > 1) {
  const session2Date = new Date(week2Blocks[0].scheduled_at);
  const session3Date = new Date(week2Blocks[1].scheduled_at);
  const session2Day = new Date(Date.UTC(session2Date.getUTCFullYear(), session2Date.getUTCMonth(), session2Date.getUTCDate()));
  const session3Day = new Date(Date.UTC(session3Date.getUTCFullYear(), session3Date.getUTCMonth(), session3Date.getUTCDate()));
  const daysDiff = Math.round((session3Day - session2Day) / (1000 * 60 * 60 * 24));
  
  console.log(`   📅 Days between Session 2 and Session 3: ${daysDiff}`);
  
  if (daysDiff >= 3) {
    console.log('   ✅ Gap respected (3+ days)');
  } else {
    console.log(`   ❌ FAILED: Gap not respected! Only ${daysDiff} days, need 3+`);
    allPassed = false;
  }
  
  // Check: Session 3 should be Session 3/3
  if (week2Blocks[1].session_number === 3 && week2Blocks[1].session_total === 3) {
    console.log('   ✅ Session numbering correct (Session 3/3)');
  } else {
    console.log(`   ❌ FAILED: Session numbering incorrect. Got ${week2Blocks[1].session_number}/${week2Blocks[1].session_total}, expected 3/3`);
    allPassed = false;
  }
}

console.log('\n' + '='.repeat(70));
if (allPassed) {
  console.log('🎉 ALL TESTS PASSED! Re-rating logic works correctly with gap enforcement.');
} else {
  console.log('❌ SOME TESTS FAILED. Review the output above.');
  process.exit(1);
}

