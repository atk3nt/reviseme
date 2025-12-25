/**
 * Test script for cross-week spaced repetition gap enforcement
 * 
 * This tests that when a topic has sessions scheduled in a previous week,
 * the gap days are properly respected when scheduling in the new week.
 * 
 * Run with: node scripts/test-cross-week-gaps.js
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
      const hour = 9 + slotNum; // 9am, 10am, 11am, 12pm
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

// Helper to calculate calendar days between two dates
function getCalendarDaysDiff(date1, date2) {
  const d1 = new Date(Date.UTC(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate()));
  const d2 = new Date(Date.UTC(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate()));
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

console.log('🧪 Cross-Week Gap Enforcement Test Suite');
console.log('='.repeat(60));

// =============================================================================
// TEST 1: Rating 1 topic - Session 1 on Friday, Session 2 should be Sunday+ 
// =============================================================================
function test1_Rating1_FridaySession() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Rating 1 - Session 1 on Friday of Week 1');
  console.log('Expected: Session 2 on Sunday (Fri + 2 days) or later');
  console.log('='.repeat(60));
  
  // Week 1: Dec 16-22, 2024 (Mon-Sun)
  // Week 2: Dec 23-29, 2024 (Mon-Sun)
  const week2Start = '2024-12-23T00:00:00Z';
  const week2Slots = createWeekSlots(week2Start);
  
  // Topic with Rating 1 (needs 3 sessions, gaps [2, 3])
  // Session 1 was on Friday Dec 20 (Week 1)
  const topics = [{
    id: 'topic-rating1-test',
    title: 'Test Topic Rating 1',
    subject: 'biology',
    examBoard: 'aqa',
    rating: 1,
    orderIndex: 0,
    priorityIndex: 0
  }];
  
  // Simulate: Session 1 was completed on Friday Dec 20
  const ongoingTopics = {
    'topic-rating1-test': {
      sessionsScheduled: 1,
      sessionsRequired: 3,
      lastSessionDate: new Date('2024-12-20T10:00:00Z') // Friday of Week 1
    }
  };
  
  console.log('\n📋 Setup:');
  console.log(`   Last session: ${formatDate(ongoingTopics['topic-rating1-test'].lastSessionDate)} (Friday)`);
  console.log(`   Week 2 starts: ${formatDate(new Date(week2Start))} (Monday)`);
  console.log(`   Required gap: 2 days (gapDays[0] for rating 1)`);
  console.log(`   Expected earliest: Sunday Dec 22 (Fri + 2 days)`);
  console.log(`   But Week 2 starts Monday Dec 23, so earliest is Monday`);
  
  const result = assignTopicsToSlots(week2Slots, topics, ongoingTopics);
  
  console.log('\n📊 Results:');
  const topicBlocks = result.filter(b => b.topic_id === 'topic-rating1-test');
  console.log(`   Blocks scheduled: ${topicBlocks.length}`);
  
  if (topicBlocks.length > 0) {
    topicBlocks.forEach((block, i) => {
      console.log(`   Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time} (Session ${block.session_number}/${block.session_total})`);
    });
    
    // Verify: First block should be on Monday or later (gap respected)
    const firstBlockDate = new Date(topicBlocks[0].scheduled_at);
    const lastSessionDate = new Date('2024-12-20T10:00:00Z');
    const daysDiff = getCalendarDaysDiff(lastSessionDate, firstBlockDate);
    
    console.log(`\n   Days between last session and first new block: ${daysDiff}`);
    
    if (daysDiff >= 2) {
      console.log('   ✅ PASSED: Gap of 2+ days respected');
      return true;
    } else {
      console.log('   ❌ FAILED: Gap not respected!');
      return false;
    }
  } else {
    console.log('   ⚠️ No blocks scheduled (may be expected if topic filtered out)');
    return null;
  }
}

// =============================================================================
// TEST 2: Rating 1 topic - Session 1 on Saturday, Session 2 should be Monday
// =============================================================================
function test2_Rating1_SaturdaySession() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Rating 1 - Session 1 on Saturday of Week 1');
  console.log('Expected: Session 2 on Monday (Sat + 2 days)');
  console.log('='.repeat(60));
  
  const week2Start = '2024-12-23T00:00:00Z';
  const week2Slots = createWeekSlots(week2Start);
  
  const topics = [{
    id: 'topic-rating1-sat',
    title: 'Test Topic Rating 1 Saturday',
    subject: 'chemistry',
    examBoard: 'aqa',
    rating: 1,
    orderIndex: 0,
    priorityIndex: 0
  }];
  
  // Session 1 was on Saturday Dec 21
  const ongoingTopics = {
    'topic-rating1-sat': {
      sessionsScheduled: 1,
      sessionsRequired: 3,
      lastSessionDate: new Date('2024-12-21T10:00:00Z') // Saturday of Week 1
    }
  };
  
  console.log('\n📋 Setup:');
  console.log(`   Last session: ${formatDate(ongoingTopics['topic-rating1-sat'].lastSessionDate)} (Saturday)`);
  console.log(`   Required gap: 2 days`);
  console.log(`   Expected earliest: Monday Dec 23 (Sat + 2 days = Mon)`);
  
  const result = assignTopicsToSlots(week2Slots, topics, ongoingTopics);
  
  const topicBlocks = result.filter(b => b.topic_id === 'topic-rating1-sat');
  console.log('\n📊 Results:');
  console.log(`   Blocks scheduled: ${topicBlocks.length}`);
  
  if (topicBlocks.length > 0) {
    topicBlocks.forEach((block, i) => {
      console.log(`   Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time}`);
    });
    
    const firstBlockDate = new Date(topicBlocks[0].scheduled_at);
    const lastSessionDate = new Date('2024-12-21T10:00:00Z');
    const daysDiff = getCalendarDaysDiff(lastSessionDate, firstBlockDate);
    
    console.log(`\n   Days between sessions: ${daysDiff}`);
    
    if (daysDiff >= 2) {
      console.log('   ✅ PASSED: Gap respected');
      return true;
    } else {
      console.log('   ❌ FAILED: Gap not respected!');
      return false;
    }
  } else {
    console.log('   ⚠️ No blocks scheduled');
    return null;
  }
}

// =============================================================================
// TEST 3: Rating 1 topic - Session 2 on Thursday, Session 3 should be Sunday+
// =============================================================================
function test3_Rating1_Session2ToSession3() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Rating 1 - Session 2 on Thursday, Session 3 gap');
  console.log('Expected: Session 3 on Sunday (Thu + 3 days) or later');
  console.log('='.repeat(60));
  
  const week2Start = '2024-12-23T00:00:00Z';
  const week2Slots = createWeekSlots(week2Start);
  
  const topics = [{
    id: 'topic-rating1-s2',
    title: 'Test Topic Rating 1 Session 2',
    subject: 'physics',
    examBoard: 'aqa',
    rating: 1,
    orderIndex: 0,
    priorityIndex: 0
  }];
  
  // Session 2 was on Thursday Dec 19
  // Session 3 should be Sunday Dec 22 (Thu + 3) or later
  // But Week 2 starts Monday, so earliest is Monday
  const ongoingTopics = {
    'topic-rating1-s2': {
      sessionsScheduled: 2,
      sessionsRequired: 3,
      lastSessionDate: new Date('2024-12-19T10:00:00Z') // Thursday of Week 1
    }
  };
  
  console.log('\n📋 Setup:');
  console.log(`   Last session (Session 2): ${formatDate(ongoingTopics['topic-rating1-s2'].lastSessionDate)} (Thursday)`);
  console.log(`   Required gap: 3 days (gapDays[1] for rating 1)`);
  console.log(`   Expected earliest: Sunday Dec 22 (Thu + 3 days)`);
  console.log(`   Week 2 starts Monday, so earliest available is Monday`);
  
  const result = assignTopicsToSlots(week2Slots, topics, ongoingTopics);
  
  const topicBlocks = result.filter(b => b.topic_id === 'topic-rating1-s2');
  console.log('\n📊 Results:');
  console.log(`   Blocks scheduled: ${topicBlocks.length}`);
  
  if (topicBlocks.length > 0) {
    topicBlocks.forEach((block, i) => {
      console.log(`   Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time} (Session ${block.session_number})`);
    });
    
    const firstBlockDate = new Date(topicBlocks[0].scheduled_at);
    const lastSessionDate = new Date('2024-12-19T10:00:00Z');
    const daysDiff = getCalendarDaysDiff(lastSessionDate, firstBlockDate);
    
    console.log(`\n   Days between Session 2 and Session 3: ${daysDiff}`);
    
    if (daysDiff >= 3) {
      console.log('   ✅ PASSED: Gap of 3+ days respected');
      return true;
    } else {
      console.log('   ❌ FAILED: Gap not respected!');
      return false;
    }
  } else {
    console.log('   ⚠️ No blocks scheduled');
    return null;
  }
}

// =============================================================================
// TEST 4: Rating 1 - Session 2 on Friday, Session 3 should be Monday+
// =============================================================================
function test4_Rating1_Session2Friday() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Rating 1 - Session 2 on Friday, cross-week gap');
  console.log('Expected: Session 3 on Monday (Fri + 3 days)');
  console.log('='.repeat(60));
  
  const week2Start = '2024-12-23T00:00:00Z';
  const week2Slots = createWeekSlots(week2Start);
  
  const topics = [{
    id: 'topic-rating1-fri',
    title: 'Test Topic Friday Session 2',
    subject: 'maths',
    examBoard: 'aqa',
    rating: 1,
    orderIndex: 0,
    priorityIndex: 0
  }];
  
  // Session 2 was on Friday Dec 20
  // Session 3 should be Monday Dec 23 (Fri + 3 days = Mon)
  const ongoingTopics = {
    'topic-rating1-fri': {
      sessionsScheduled: 2,
      sessionsRequired: 3,
      lastSessionDate: new Date('2024-12-20T10:00:00Z') // Friday of Week 1
    }
  };
  
  console.log('\n📋 Setup:');
  console.log(`   Last session (Session 2): ${formatDate(ongoingTopics['topic-rating1-fri'].lastSessionDate)} (Friday)`);
  console.log(`   Required gap: 3 days`);
  console.log(`   Expected earliest: Monday Dec 23 (Fri + 3 = Mon)`);
  
  const result = assignTopicsToSlots(week2Slots, topics, ongoingTopics);
  
  const topicBlocks = result.filter(b => b.topic_id === 'topic-rating1-fri');
  console.log('\n📊 Results:');
  console.log(`   Blocks scheduled: ${topicBlocks.length}`);
  
  if (topicBlocks.length > 0) {
    topicBlocks.forEach((block, i) => {
      console.log(`   Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time}`);
    });
    
    const firstBlockDate = new Date(topicBlocks[0].scheduled_at);
    const lastSessionDate = new Date('2024-12-20T10:00:00Z');
    const daysDiff = getCalendarDaysDiff(lastSessionDate, firstBlockDate);
    
    console.log(`\n   Days between sessions: ${daysDiff}`);
    
    if (daysDiff >= 3) {
      console.log('   ✅ PASSED: Gap respected');
      return true;
    } else {
      console.log('   ❌ FAILED: Gap not respected!');
      return false;
    }
  } else {
    console.log('   ⚠️ No blocks scheduled');
    return null;
  }
}

// =============================================================================
// TEST 5: Rating 2 topic - Session 1 on Saturday, Session 2 should be Monday
// =============================================================================
function test5_Rating2_SaturdaySession() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Rating 2 - Session 1 on Saturday');
  console.log('Expected: Session 2 on Monday (Sat + 2 days)');
  console.log('='.repeat(60));
  
  const week2Start = '2024-12-23T00:00:00Z';
  const week2Slots = createWeekSlots(week2Start);
  
  const topics = [{
    id: 'topic-rating2-sat',
    title: 'Test Topic Rating 2 Saturday',
    subject: 'geography',
    examBoard: 'aqa',
    rating: 2,
    orderIndex: 0,
    priorityIndex: 0
  }];
  
  // Session 1 was on Saturday Dec 21
  const ongoingTopics = {
    'topic-rating2-sat': {
      sessionsScheduled: 1,
      sessionsRequired: 2,
      lastSessionDate: new Date('2024-12-21T10:00:00Z') // Saturday of Week 1
    }
  };
  
  console.log('\n📋 Setup:');
  console.log(`   Last session: ${formatDate(ongoingTopics['topic-rating2-sat'].lastSessionDate)} (Saturday)`);
  console.log(`   Required gap: 2 days (gapDays[0] for rating 2)`);
  console.log(`   Expected earliest: Monday Dec 23`);
  
  const result = assignTopicsToSlots(week2Slots, topics, ongoingTopics);
  
  const topicBlocks = result.filter(b => b.topic_id === 'topic-rating2-sat');
  console.log('\n📊 Results:');
  console.log(`   Blocks scheduled: ${topicBlocks.length}`);
  
  if (topicBlocks.length > 0) {
    topicBlocks.forEach((block, i) => {
      console.log(`   Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time}`);
    });
    
    const firstBlockDate = new Date(topicBlocks[0].scheduled_at);
    const lastSessionDate = new Date('2024-12-21T10:00:00Z');
    const daysDiff = getCalendarDaysDiff(lastSessionDate, firstBlockDate);
    
    console.log(`\n   Days between sessions: ${daysDiff}`);
    
    if (daysDiff >= 2) {
      console.log('   ✅ PASSED: Gap respected');
      return true;
    } else {
      console.log('   ❌ FAILED: Gap not respected!');
      return false;
    }
  } else {
    console.log('   ⚠️ No blocks scheduled');
    return null;
  }
}

// =============================================================================
// TEST 6: Gap should block early scheduling (negative test)
// =============================================================================
function test6_GapBlocksEarlyScheduling() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 6: Verify gap blocks early scheduling (negative test)');
  console.log('Session 1 on Sunday, Session 2 should NOT be on Monday');
  console.log('='.repeat(60));
  
  const week2Start = '2024-12-23T00:00:00Z';
  const week2Slots = createWeekSlots(week2Start);
  
  const topics = [{
    id: 'topic-gap-block',
    title: 'Test Topic Gap Block',
    subject: 'history',
    examBoard: 'aqa',
    rating: 1,
    orderIndex: 0,
    priorityIndex: 0
  }];
  
  // Session 1 was on Sunday Dec 22 (day before Week 2)
  // Session 2 should NOT be on Monday (only 1 day gap, need 2)
  // Earliest should be Tuesday Dec 24
  const ongoingTopics = {
    'topic-gap-block': {
      sessionsScheduled: 1,
      sessionsRequired: 3,
      lastSessionDate: new Date('2024-12-22T10:00:00Z') // Sunday of Week 1
    }
  };
  
  console.log('\n📋 Setup:');
  console.log(`   Last session: ${formatDate(ongoingTopics['topic-gap-block'].lastSessionDate)} (Sunday)`);
  console.log(`   Required gap: 2 days`);
  console.log(`   Monday is only 1 day later - should be BLOCKED`);
  console.log(`   Expected earliest: Tuesday Dec 24 (Sun + 2 days)`);
  
  const result = assignTopicsToSlots(week2Slots, topics, ongoingTopics);
  
  const topicBlocks = result.filter(b => b.topic_id === 'topic-gap-block');
  console.log('\n📊 Results:');
  console.log(`   Blocks scheduled: ${topicBlocks.length}`);
  
  if (topicBlocks.length > 0) {
    topicBlocks.forEach((block, i) => {
      console.log(`   Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} at ${block.start_time}`);
    });
    
    const firstBlockDate = new Date(topicBlocks[0].scheduled_at);
    const mondayDate = new Date('2024-12-23T00:00:00Z');
    
    const isOnMonday = firstBlockDate.toISOString().split('T')[0] === mondayDate.toISOString().split('T')[0];
    
    if (!isOnMonday) {
      console.log('   ✅ PASSED: Monday correctly blocked, scheduled later');
      return true;
    } else {
      console.log('   ❌ FAILED: Scheduled on Monday when gap not met!');
      return false;
    }
  } else {
    console.log('   ⚠️ No blocks scheduled');
    return null;
  }
}

// =============================================================================
// Run all tests
// =============================================================================
console.log('\n🚀 Running all tests...\n');

const results = {
  test1: test1_Rating1_FridaySession(),
  test2: test2_Rating1_SaturdaySession(),
  test3: test3_Rating1_Session2ToSession3(),
  test4: test4_Rating1_Session2Friday(),
  test5: test5_Rating2_SaturdaySession(),
  test6: test6_GapBlocksEarlyScheduling()
};

// Summary
console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));

const testNames = {
  test1: 'Rating 1: Session 1 Friday → Session 2 gap',
  test2: 'Rating 1: Session 1 Saturday → Session 2 gap',
  test3: 'Rating 1: Session 2 Thursday → Session 3 gap',
  test4: 'Rating 1: Session 2 Friday → Session 3 gap',
  test5: 'Rating 2: Session 1 Saturday → Session 2 gap',
  test6: 'Negative: Gap blocks early scheduling'
};

let passed = 0;
let failed = 0;
let skipped = 0;

Object.entries(results).forEach(([key, result]) => {
  const status = result === true ? '✅ PASSED' : result === false ? '❌ FAILED' : '⚠️ SKIPPED';
  console.log(`${status}: ${testNames[key]}`);
  
  if (result === true) passed++;
  else if (result === false) failed++;
  else skipped++;
});

console.log('\n' + '-'.repeat(60));
console.log(`Total: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed === 0 && passed > 0) {
  console.log('\n🎉 All tests passed! Cross-week gap enforcement is working correctly.');
} else if (failed > 0) {
  console.log('\n⚠️ Some tests failed. Review the gap enforcement logic.');
}

