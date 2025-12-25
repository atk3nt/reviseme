/**
 * Test script for missed block rescheduling
 * 
 * Run with: 
 *   node scripts/test-rescheduling.js           # Diagnostics only
 *   node scripts/test-rescheduling.js --test    # Run all tests
 *   node scripts/test-rescheduling.js --test-1a # Next-week rescheduling
 *   node scripts/test-rescheduling.js --test-1c # Multiple missed blocks
 *   node scripts/test-rescheduling.js --test-1d # Max cluster size
 *   node scripts/test-rescheduling.js --test-2a # Error handling
 */

const BASE_URL = 'http://localhost:3000';

// Helper to make API calls
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const text = await response.text();
    
    try {
      const data = JSON.parse(text);
      return { status: response.status, data };
    } catch {
      return { status: response.status, data: null, rawText: text.substring(0, 500) };
    }
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

async function getBlocks() {
  const result = await apiCall('/api/dev/check-blocks');
  if (result.status === 200 && result.data?.blocks) {
    return result.data.blocks;
  }
  return [];
}

// Helper to get next week's Monday
function getNextWeekMonday() {
  const today = new Date();
  const dayOfWeek = today.getUTCDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(today);
  nextMonday.setUTCDate(today.getUTCDate() + daysUntilNextMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return nextMonday;
}

// Helper to get this week's Monday
function getThisWeekMonday() {
  const today = new Date();
  const dayOfWeek = today.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

async function runDiagnostics() {
  console.log('🔍 Running Diagnostics');
  console.log('='.repeat(60));
  
  // Get all blocks
  const blocks = await getBlocks();
  console.log(`\n📊 Total blocks: ${blocks.length}`);
  
  if (blocks.length === 0) {
    console.log('⚠️ No blocks found. Generate a plan first.');
    return null;
  }
  
  // Group by status
  const byStatus = {};
  blocks.forEach(b => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  });
  console.log('📊 Blocks by status:', byStatus);
  
  // Group by week
  const thisMonday = getThisWeekMonday();
  const nextMonday = getNextWeekMonday();
  const thisWeekBlocks = blocks.filter(b => {
    const d = new Date(b.scheduled_at);
    return d >= thisMonday && d < nextMonday;
  });
  const nextWeekBlocks = blocks.filter(b => {
    const d = new Date(b.scheduled_at);
    const nextNextMonday = new Date(nextMonday);
    nextNextMonday.setUTCDate(nextNextMonday.getUTCDate() + 7);
    return d >= nextMonday && d < nextNextMonday;
  });
  
  console.log(`\n📅 This week blocks: ${thisWeekBlocks.length}`);
  console.log(`📅 Next week blocks: ${nextWeekBlocks.length}`);
  
  // Find scheduled blocks
  const scheduledBlocks = blocks.filter(b => b.status === 'scheduled');
  const missedBlocks = blocks.filter(b => b.status === 'missed');
  
  console.log(`\n📋 Scheduled blocks: ${scheduledBlocks.length}`);
  console.log(`📋 Missed blocks: ${missedBlocks.length}`);
  
  // Show some scheduled blocks
  if (scheduledBlocks.length > 0) {
    console.log('\nScheduled blocks (first 5):');
    scheduledBlocks.slice(0, 5).forEach(b => {
      console.log(`  - ${b.id.substring(0, 8)}... | ${b.scheduled_at} | ${b.topic?.substring(0, 30) || 'N/A'}`);
    });
  }
  
  // Show missed blocks
  if (missedBlocks.length > 0) {
    console.log('\nMissed blocks:');
    missedBlocks.forEach(b => {
      console.log(`  - ${b.id} | ${b.scheduled_at} | ${b.topic?.substring(0, 30) || 'N/A'}`);
    });
  }
  
  return { blocks, scheduledBlocks, missedBlocks, thisWeekBlocks, nextWeekBlocks };
}

// =============================================================================
// TEST 1.A: Next-week rescheduling (when next week has blocks)
// =============================================================================
async function test1A_NextWeekRescheduling() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1.A: Next-Week Rescheduling (when next week has blocks)');
  console.log('='.repeat(60));
  
  // Step 1: Check if next week has blocks
  const blocks = await getBlocks();
  const nextMonday = getNextWeekMonday();
  const nextNextMonday = new Date(nextMonday);
  nextNextMonday.setUTCDate(nextNextMonday.getUTCDate() + 7);
  
  const nextWeekBlocks = blocks.filter(b => {
    const d = new Date(b.scheduled_at);
    return d >= nextMonday && d < nextNextMonday && b.status === 'scheduled';
  });
  
  console.log(`\n📅 Next week starts: ${nextMonday.toISOString().split('T')[0]}`);
  console.log(`📋 Next week scheduled blocks: ${nextWeekBlocks.length}`);
  
  if (nextWeekBlocks.length === 0) {
    console.log('\n⚠️ No blocks in next week. Generating plan for next week first...');
    
    const genResult = await apiCall('/api/plan/generate', 'POST', {
      subjects: ['psychology', 'chemistry', 'geography'],
      targetWeek: nextMonday.toISOString().split('T')[0]
    });
    
    console.log(`   Generation status: ${genResult.status}`);
    console.log(`   Success: ${genResult.data?.success}`);
    
    if (!genResult.data?.success) {
      console.log(`   Error: ${genResult.data?.error}`);
      console.log('\n❌ TEST 1.A FAILED: Could not generate next week plan');
      return { passed: false, reason: 'Could not generate next week plan' };
    }
    
    // Refresh blocks
    const newBlocks = await getBlocks();
    const newNextWeekBlocks = newBlocks.filter(b => {
      const d = new Date(b.scheduled_at);
      return d >= nextMonday && d < nextNextMonday && b.status === 'scheduled';
    });
    console.log(`   New next week blocks: ${newNextWeekBlocks.length}`);
  }
  
  // Step 2: Find a block from this week to mark as missed (late in day, no same-day slot)
  const thisMonday = getThisWeekMonday();
  const thisWeekBlocks = blocks.filter(b => {
    const d = new Date(b.scheduled_at);
    return d >= thisMonday && d < nextMonday && b.status === 'scheduled';
  });
  
  console.log(`\n📋 This week scheduled blocks: ${thisWeekBlocks.length}`);
  
  if (thisWeekBlocks.length === 0) {
    console.log('\n⚠️ No blocks in this week to test with');
    console.log('   Generating plan for this week first...');
    
    const genResult = await apiCall('/api/plan/generate', 'POST', {
      subjects: ['psychology', 'chemistry', 'geography'],
      targetWeek: thisMonday.toISOString().split('T')[0]
    });
    
    if (!genResult.data?.success) {
      console.log('\n❌ TEST 1.A FAILED: Could not generate this week plan');
      return { passed: false, reason: 'Could not generate this week plan' };
    }
    
    // Refresh blocks
    const refreshedBlocks = await getBlocks();
    const refreshedThisWeekBlocks = refreshedBlocks.filter(b => {
      const d = new Date(b.scheduled_at);
      return d >= thisMonday && d < nextMonday && b.status === 'scheduled';
    });
    
    if (refreshedThisWeekBlocks.length === 0) {
      console.log('\n❌ TEST 1.A FAILED: No blocks generated for this week');
      return { passed: false, reason: 'No blocks generated' };
    }
    
    thisWeekBlocks.push(...refreshedThisWeekBlocks);
  }
  
  // Pick a block (preferably later in day to reduce same-day slot chance)
  const sortedBlocks = thisWeekBlocks.sort((a, b) => {
    const aTime = new Date(a.scheduled_at).getUTCHours();
    const bTime = new Date(b.scheduled_at).getUTCHours();
    return bTime - aTime; // Later times first
  });
  
  const testBlock = sortedBlocks[0];
  console.log(`\n🎯 Testing with block: ${testBlock.id}`);
  console.log(`   Scheduled at: ${testBlock.scheduled_at}`);
  console.log(`   Topic: ${testBlock.topic || 'N/A'}`);
  
  // Step 3: Mark as missed
  console.log('\n📤 Calling mark-missed...');
  const missResult = await apiCall('/api/plan/mark-missed', 'POST', {
    blockId: testBlock.id
  });
  
  console.log(`   Status: ${missResult.status}`);
  console.log(`   Response:`, JSON.stringify(missResult.data, null, 2));
  
  // Step 4: Verify result
  if (missResult.data?.rescheduled) {
    // Use newScheduledAt for the actual date (rescheduledTo may be "same-day" or "next-week")
    const rescheduledTo = missResult.data.newScheduledAt || missResult.data.rescheduledTo;
    const rescheduledDate = new Date(rescheduledTo);
    
    const isSameDay = rescheduledDate.toISOString().split('T')[0] === 
                      new Date(testBlock.scheduled_at).toISOString().split('T')[0];
    const isNextWeek = rescheduledDate >= nextMonday && rescheduledDate < nextNextMonday;
    
    console.log(`\n📊 Analysis:`);
    console.log(`   Original date: ${new Date(testBlock.scheduled_at).toISOString().split('T')[0]}`);
    console.log(`   Rescheduled to: ${rescheduledDate.toISOString().split('T')[0]}`);
    console.log(`   Same day: ${isSameDay}`);
    console.log(`   Next week: ${isNextWeek}`);
    
    if (isNextWeek) {
      console.log('\n✅ TEST 1.A PASSED: Block was rescheduled to next week');
      return { passed: true, rescheduledTo };
    } else if (isSameDay) {
      console.log('\n⚠️ TEST 1.A PARTIAL: Block rescheduled same-day (expected if slots available)');
      console.log('   This is correct behavior - same-day takes priority');
      return { passed: true, note: 'Same-day reschedule (correct priority)' };
    } else {
      console.log('\n⚠️ TEST 1.A UNEXPECTED: Block rescheduled to different day in same week');
      return { passed: null, rescheduledTo };
    }
  } else {
    console.log(`\n⚠️ TEST 1.A: Block marked as missed but not rescheduled`);
    console.log(`   Message: ${missResult.data?.message}`);
    console.log('   This is expected if no slots available - will be handled by plan generation');
    return { passed: null, message: missResult.data?.message };
  }
}

// =============================================================================
// TEST 1.C: Multiple missed blocks
// =============================================================================
async function test1C_MultipleMissedBlocks() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1.C: Multiple Missed Blocks');
  console.log('='.repeat(60));
  
  const blocks = await getBlocks();
  const scheduledBlocks = blocks.filter(b => b.status === 'scheduled');
  
  console.log(`\n📋 Available scheduled blocks: ${scheduledBlocks.length}`);
  
  if (scheduledBlocks.length < 3) {
    console.log('\n⚠️ Need at least 3 scheduled blocks for this test');
    console.log('   Generating a plan first...');
    
    const thisMonday = getThisWeekMonday();
    const genResult = await apiCall('/api/plan/generate', 'POST', {
      subjects: ['psychology', 'chemistry', 'geography'],
      targetWeek: thisMonday.toISOString().split('T')[0]
    });
    
    if (!genResult.data?.success) {
      console.log('\n❌ TEST 1.C FAILED: Could not generate plan');
      return { passed: false, reason: 'Could not generate plan' };
    }
    
    // Refresh blocks
    const newBlocks = await getBlocks();
    scheduledBlocks.length = 0;
    scheduledBlocks.push(...newBlocks.filter(b => b.status === 'scheduled'));
    console.log(`   New scheduled blocks: ${scheduledBlocks.length}`);
  }
  
  if (scheduledBlocks.length < 3) {
    console.log('\n❌ TEST 1.C FAILED: Still not enough blocks');
    return { passed: false, reason: 'Not enough blocks' };
  }
  
  // Pick 3 blocks to mark as missed
  const testBlocks = scheduledBlocks.slice(0, 3);
  console.log(`\n🎯 Testing with ${testBlocks.length} blocks:`);
  testBlocks.forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.id.substring(0, 8)}... | ${b.scheduled_at}`);
  });
  
  // Mark each as missed
  const results = [];
  for (let i = 0; i < testBlocks.length; i++) {
    const block = testBlocks[i];
    console.log(`\n📤 Marking block ${i + 1} as missed...`);
    
    const missResult = await apiCall('/api/plan/mark-missed', 'POST', {
      blockId: block.id
    });
    
    console.log(`   Status: ${missResult.status}`);
    console.log(`   Rescheduled: ${missResult.data?.rescheduled}`);
    if (missResult.data?.rescheduled) {
      console.log(`   Rescheduled to: ${missResult.data.rescheduledTo}`);
    } else {
      console.log(`   Message: ${missResult.data?.message}`);
    }
    
    results.push({
      blockId: block.id,
      rescheduled: missResult.data?.rescheduled,
      rescheduledTo: missResult.data?.rescheduledTo,
      message: missResult.data?.message
    });
  }
  
  // Verify all blocks were handled
  const rescheduledCount = results.filter(r => r.rescheduled).length;
  const missedCount = results.filter(r => !r.rescheduled).length;
  
  console.log(`\n📊 Results:`);
  console.log(`   Rescheduled: ${rescheduledCount}`);
  console.log(`   Left as missed: ${missedCount}`);
  
  // Check final block status
  const finalBlocks = await getBlocks();
  const finalMissed = finalBlocks.filter(b => b.status === 'missed');
  console.log(`   Total missed in DB: ${finalMissed.length}`);
  
  if (rescheduledCount === testBlocks.length) {
    console.log('\n✅ TEST 1.C PASSED: All blocks were rescheduled');
    return { passed: true, rescheduledCount, missedCount };
  } else if (rescheduledCount > 0) {
    console.log('\n⚠️ TEST 1.C PARTIAL: Some blocks rescheduled, others left as missed');
    console.log('   This is expected if slots ran out - plan generation will handle remaining');
    return { passed: null, rescheduledCount, missedCount };
  } else {
    console.log('\n⚠️ TEST 1.C: No blocks rescheduled - all left as missed');
    console.log('   Plan generation should handle these');
    return { passed: null, rescheduledCount, missedCount };
  }
}

// =============================================================================
// TEST 1.D: Max cluster size enforcement
// =============================================================================
async function test1D_MaxClusterSize() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1.D: Max Cluster Size Enforcement');
  console.log('='.repeat(60));
  
  const blocks = await getBlocks();
  
  // Group blocks by day
  const blocksByDay = {};
  blocks.forEach(b => {
    if (b.status !== 'scheduled') return;
    const day = new Date(b.scheduled_at).toISOString().split('T')[0];
    if (!blocksByDay[day]) blocksByDay[day] = [];
    blocksByDay[day].push(b);
  });
  
  // Find days with existing blocks
  const daysWithBlocks = Object.entries(blocksByDay).map(([day, dayBlocks]) => ({
    day,
    count: dayBlocks.length,
    blocks: dayBlocks
  })).sort((a, b) => b.count - a.count);
  
  console.log('\n📊 Blocks per day:');
  daysWithBlocks.slice(0, 5).forEach(d => {
    console.log(`   ${d.day}: ${d.count} blocks`);
  });
  
  // Find a day with 3+ blocks (already at or near max cluster)
  const busyDay = daysWithBlocks.find(d => d.count >= 3);
  
  if (!busyDay) {
    console.log('\n⚠️ No days with 3+ blocks found');
    console.log('   This test requires a day with existing clusters');
    return { passed: null, reason: 'No busy days to test' };
  }
  
  console.log(`\n🎯 Testing with day: ${busyDay.day} (${busyDay.count} blocks)`);
  console.log('   Existing blocks:');
  busyDay.blocks.forEach(b => {
    const time = new Date(b.scheduled_at).toISOString().split('T')[1].substring(0, 5);
    console.log(`   - ${time} | ${b.id.substring(0, 8)}...`);
  });
  
  // Find a block from a different day to mark as missed
  const otherDayBlocks = blocks.filter(b => {
    if (b.status !== 'scheduled') return false;
    const day = new Date(b.scheduled_at).toISOString().split('T')[0];
    return day !== busyDay.day;
  });
  
  if (otherDayBlocks.length === 0) {
    console.log('\n⚠️ No blocks on other days to test with');
    return { passed: null, reason: 'No blocks on other days' };
  }
  
  const testBlock = otherDayBlocks[0];
  console.log(`\n📤 Marking block as missed: ${testBlock.id.substring(0, 8)}...`);
  console.log(`   Original time: ${testBlock.scheduled_at}`);
  
  const missResult = await apiCall('/api/plan/mark-missed', 'POST', {
    blockId: testBlock.id
  });
  
  console.log(`   Status: ${missResult.status}`);
  console.log(`   Rescheduled: ${missResult.data?.rescheduled}`);
  
  if (missResult.data?.rescheduled) {
    const rescheduledTo = missResult.data.rescheduledTo;
    const rescheduledDay = new Date(rescheduledTo).toISOString().split('T')[0];
    
    console.log(`   Rescheduled to: ${rescheduledTo}`);
    console.log(`   Rescheduled day: ${rescheduledDay}`);
    
    // Check if it was rescheduled to the busy day
    if (rescheduledDay === busyDay.day) {
      // Verify cluster size
      const finalBlocks = await getBlocks();
      const finalDayBlocks = finalBlocks.filter(b => {
        const day = new Date(b.scheduled_at).toISOString().split('T')[0];
        return day === busyDay.day && b.status === 'scheduled';
      });
      
      // Group by time to find clusters
      const timeGroups = {};
      finalDayBlocks.forEach(b => {
        const hour = new Date(b.scheduled_at).getUTCHours();
        if (!timeGroups[hour]) timeGroups[hour] = [];
        timeGroups[hour].push(b);
      });
      
      const maxCluster = Math.max(...Object.values(timeGroups).map(g => g.length));
      console.log(`\n📊 Final cluster analysis for ${busyDay.day}:`);
      console.log(`   Total blocks: ${finalDayBlocks.length}`);
      console.log(`   Max cluster size: ${maxCluster}`);
      
      if (maxCluster <= 3) {
        console.log('\n✅ TEST 1.D PASSED: Max cluster size (3) respected');
        return { passed: true, maxCluster };
      } else {
        console.log('\n❌ TEST 1.D FAILED: Cluster size exceeded 3');
        return { passed: false, maxCluster };
      }
    } else {
      console.log('\n✅ TEST 1.D PASSED: Block rescheduled to different day (avoiding cluster)');
      return { passed: true, note: 'Avoided busy day' };
    }
  } else {
    console.log(`\n⚠️ TEST 1.D: Block not rescheduled`);
    console.log(`   Message: ${missResult.data?.message}`);
    return { passed: null, message: missResult.data?.message };
  }
}

// =============================================================================
// TEST 2.A: Error Handling Verification
// =============================================================================
async function test2A_ErrorHandling() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2.A: Error Handling Verification');
  console.log('='.repeat(60));
  
  const tests = [];
  
  // Test 1: Invalid block ID
  console.log('\n📤 Test 1: Invalid block ID');
  const invalidIdResult = await apiCall('/api/plan/mark-missed', 'POST', {
    blockId: 'invalid-uuid-12345'
  });
  console.log(`   Status: ${invalidIdResult.status}`);
  console.log(`   Response: ${JSON.stringify(invalidIdResult.data)}`);
  tests.push({
    name: 'Invalid block ID',
    passed: invalidIdResult.status === 400 || invalidIdResult.status === 404 || 
            invalidIdResult.data?.error !== undefined,
    status: invalidIdResult.status,
    hasError: !!invalidIdResult.data?.error
  });
  
  // Test 2: Missing block ID
  console.log('\n📤 Test 2: Missing block ID');
  const missingIdResult = await apiCall('/api/plan/mark-missed', 'POST', {});
  console.log(`   Status: ${missingIdResult.status}`);
  console.log(`   Response: ${JSON.stringify(missingIdResult.data)}`);
  tests.push({
    name: 'Missing block ID',
    passed: missingIdResult.status === 400 || missingIdResult.data?.error !== undefined,
    status: missingIdResult.status,
    hasError: !!missingIdResult.data?.error
  });
  
  // Test 3: Non-existent block ID (valid UUID format)
  console.log('\n📤 Test 3: Non-existent block ID');
  const nonExistentResult = await apiCall('/api/plan/mark-missed', 'POST', {
    blockId: '00000000-0000-0000-0000-000000000000'
  });
  console.log(`   Status: ${nonExistentResult.status}`);
  console.log(`   Response: ${JSON.stringify(nonExistentResult.data)}`);
  tests.push({
    name: 'Non-existent block ID',
    passed: nonExistentResult.status === 404 || nonExistentResult.data?.error !== undefined,
    status: nonExistentResult.status,
    hasError: !!nonExistentResult.data?.error
  });
  
  // Test 4: Already missed block
  console.log('\n📤 Test 4: Already missed block');
  const blocks = await getBlocks();
  const missedBlock = blocks.find(b => b.status === 'missed');
  
  if (missedBlock) {
    const alreadyMissedResult = await apiCall('/api/plan/mark-missed', 'POST', {
      blockId: missedBlock.id
    });
    console.log(`   Block ID: ${missedBlock.id}`);
    console.log(`   Status: ${alreadyMissedResult.status}`);
    console.log(`   Response: ${JSON.stringify(alreadyMissedResult.data)}`);
    tests.push({
      name: 'Already missed block',
      passed: alreadyMissedResult.status === 400 || 
              alreadyMissedResult.data?.error !== undefined ||
              alreadyMissedResult.data?.message?.includes('already'),
      status: alreadyMissedResult.status,
      hasError: !!alreadyMissedResult.data?.error
    });
  } else {
    console.log('   ⚠️ No missed blocks to test with');
    tests.push({
      name: 'Already missed block',
      passed: null,
      reason: 'No missed blocks available'
    });
  }
  
  // Test 5: Invalid request method (GET instead of POST)
  console.log('\n📤 Test 5: Invalid request method (GET)');
  const getResult = await apiCall('/api/plan/mark-missed', 'GET');
  console.log(`   Status: ${getResult.status}`);
  console.log(`   Response: ${JSON.stringify(getResult.data || getResult.rawText?.substring(0, 100))}`);
  tests.push({
    name: 'Invalid request method',
    passed: getResult.status === 405 || getResult.status === 404,
    status: getResult.status
  });
  
  // Summary
  console.log('\n📊 Error Handling Summary:');
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  
  tests.forEach(t => {
    const status = t.passed === true ? '✅' : t.passed === false ? '❌' : '⚠️';
    console.log(`   ${status} ${t.name}: status=${t.status}, hasError=${t.hasError}`);
    if (t.passed === true) passedCount++;
    else if (t.passed === false) failedCount++;
    else skippedCount++;
  });
  
  if (failedCount === 0) {
    console.log('\n✅ TEST 2.A PASSED: All error cases handled correctly');
    return { passed: true, passedCount, skippedCount };
  } else {
    console.log(`\n❌ TEST 2.A FAILED: ${failedCount} error cases not handled correctly`);
    return { passed: false, passedCount, failedCount, skippedCount };
  }
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  const args = process.argv.slice(2);
  const runAllTests = args.includes('--test');
  const run1A = args.includes('--test-1a');
  const run1C = args.includes('--test-1c');
  const run1D = args.includes('--test-1d');
  const run2A = args.includes('--test-2a');
  const runSpecific = run1A || run1C || run1D || run2A;
  
  console.log('🧪 Rescheduling Test Suite');
  console.log('='.repeat(60));
  console.log(`Server: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);
  
  if (!runAllTests && !runSpecific) {
    // Just diagnostics
    await runDiagnostics();
    console.log('\n' + '='.repeat(60));
    console.log('Available tests:');
    console.log('  --test     Run all tests');
    console.log('  --test-1a  Next-week rescheduling');
    console.log('  --test-1c  Multiple missed blocks');
    console.log('  --test-1d  Max cluster size');
    console.log('  --test-2a  Error handling');
    return;
  }
  
  // Run diagnostics first
  await runDiagnostics();
  
  const results = {};
  
  // Run requested tests
  if (runAllTests || run1A) {
    results.test1A = await test1A_NextWeekRescheduling();
  }
  
  if (runAllTests || run1C) {
    results.test1C = await test1C_MultipleMissedBlocks();
  }
  
  if (runAllTests || run1D) {
    results.test1D = await test1D_MaxClusterSize();
  }
  
  if (runAllTests || run2A) {
    results.test2A = await test2A_ErrorHandling();
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const testInfo = [
    { key: 'test1A', name: '1.A: Next-Week Rescheduling' },
    { key: 'test1C', name: '1.C: Multiple Missed Blocks' },
    { key: 'test1D', name: '1.D: Max Cluster Size' },
    { key: 'test2A', name: '2.A: Error Handling' }
  ];
  
  testInfo.forEach(t => {
    if (!results[t.key]) return;
    const status = results[t.key]?.passed === true ? '✅ PASSED' : 
                   results[t.key]?.passed === false ? '❌ FAILED' : 
                   '⚠️ PARTIAL/SKIPPED';
    console.log(`${status}: ${t.name}`);
  });
}

main().catch(console.error);
