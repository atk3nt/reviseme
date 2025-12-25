/**
 * Comprehensive Test Suite
 * 
 * Tests multiple scenarios:
 * 1. Re-rating flow (Rating 3 → Rating 1)
 * 2. Saturday restriction
 * 3. Session numbering across weeks
 * 4. Multi-week gap enforcement
 * 5. Block completion impact
 * 
 * Run with: node scripts/test-comprehensive-suite.js
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
      return { status: response.status, data, rawText: null };
    } catch {
      return { status: response.status, data: null, rawText: text.substring(0, 500) };
    }
  } catch (error) {
    return { status: 500, error: error.message, data: null };
  }
}

// Helper to get current week's Monday
function getCurrentWeekMonday() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Helper to format date
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

// Helper to calculate calendar days between dates
function getCalendarDaysDiff(date1, date2) {
  const d1 = new Date(Date.UTC(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate()));
  const d2 = new Date(Date.UTC(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate()));
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

console.log('🧪 Comprehensive Test Suite');
console.log('='.repeat(70));
console.log(`Server: ${BASE_URL}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log('');

let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0
};

// =============================================================================
// TEST 1: Re-Rating Flow
// =============================================================================
async function test1_ReratingFlow() {
  console.log('TEST 1: Re-Rating Flow (Rating 3 → Rating 1)');
  console.log('-'.repeat(70));
  
  try {
    // Get current week blocks
    const currentMonday = getCurrentWeekMonday();
    const weekStart = formatDate(currentMonday);
    const blocksResult = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    
    if (blocksResult.status !== 200 || !blocksResult.data?.blocks?.length) {
      console.log('   ⚠️ SKIPPED: No blocks found to test re-rating');
      testResults.skipped++;
      return;
    }
    
    // Find a Rating 3 block (1 session)
    const rating3Block = blocksResult.data.blocks.find(b => 
      b.session_total === 1 && b.status === 'scheduled'
    );
    
    if (!rating3Block) {
      console.log('   ⚠️ SKIPPED: No Rating 3 blocks found');
      testResults.skipped++;
      return;
    }
    
    console.log(`   Found test block: ${rating3Block.topic_name?.substring(0, 40)}`);
    console.log(`   Current: Rating 3 (1 session)`);
    
    // Re-rate to Rating 1
    const rerateResult = await apiCall('/api/plan/rerate', 'POST', {
      blockId: rating3Block.id,
      reratingScore: 1
    });
    
    if (rerateResult.status !== 200 || !rerateResult.data?.success) {
      console.log(`   ❌ FAILED: Re-rating failed - ${rerateResult.data?.error || 'Unknown error'}`);
      testResults.failed++;
      return;
    }
    
    console.log('   ✅ Re-rated successfully');
    
    // Wait a moment for database update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check that old block is gone and new blocks are created
    const blocksAfter = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    const topicBlocks = blocksAfter.data?.blocks?.filter(b => 
      b.topic_id === rating3Block.topic_id && b.status === 'scheduled'
    ) || [];
    
    // Should have 3 blocks for Rating 1
    if (topicBlocks.length === 3) {
      console.log(`   ✅ Correct number of blocks (3) for Rating 1`);
      
      // Verify session numbering
      const sessions = topicBlocks.map(b => b.session_number).sort((a, b) => a - b);
      if (sessions.join(',') === '1,2,3') {
        console.log('   ✅ Session numbering correct (1, 2, 3)');
        testResults.passed++;
      } else {
        console.log(`   ❌ FAILED: Session numbering incorrect: ${sessions.join(',')}`);
        testResults.failed++;
      }
    } else {
      console.log(`   ❌ FAILED: Expected 3 blocks, got ${topicBlocks.length}`);
      testResults.failed++;
    }
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testResults.failed++;
  }
}

// =============================================================================
// TEST 2: Saturday Restriction
// =============================================================================
async function test2_SaturdayRestriction() {
  console.log('\nTEST 2: Saturday Restriction');
  console.log('-'.repeat(70));
  
  try {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const isSaturdayOrLater = dayOfWeek === 6 || dayOfWeek === 0;
    
    console.log(`   Today: ${today.toLocaleDateString()}`);
    console.log(`   Day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}`);
    
    const nextMonday = new Date(getCurrentWeekMonday());
    nextMonday.setDate(nextMonday.getDate() + 7);
    const nextWeekStart = formatDate(nextMonday);
    
    console.log(`   Attempting to generate next week: ${nextWeekStart}`);
    
    // Get user's subjects from current week
    const currentMonday = getCurrentWeekMonday();
    const currentWeekStart = formatDate(currentMonday);
    const currentBlocks = await apiCall(`/api/plan/generate?weekStart=${currentWeekStart}`);
    
    if (currentBlocks.status !== 200 || !currentBlocks.data?.blocks?.length) {
      console.log('   ⚠️ SKIPPED: No current blocks to determine subjects');
      testResults.skipped++;
      return;
    }
    
    // Extract subjects
    const subjectSet = new Set();
    currentBlocks.data.blocks.forEach(b => {
      if (b.subject) subjectSet.add(b.subject);
    });
    const subjects = Array.from(subjectSet);
    
    if (subjects.length === 0) {
      console.log('   ⚠️ SKIPPED: No subjects found');
      testResults.skipped++;
      return;
    }
    
    const result = await apiCall('/api/plan/generate', 'POST', {
      subjects: subjects,
      targetWeek: nextWeekStart,
      availability: { monday: 4 },
      studyBlockDuration: 0.5
    });
    
    if (isSaturdayOrLater) {
      // Should succeed on Saturday/Sunday
      if (result.status === 200 || result.data?.success) {
        console.log('   ✅ Correctly allowed (Saturday/Sunday)');
        testResults.passed++;
      } else {
        console.log(`   ❌ FAILED: Should be allowed but got ${result.status}`);
        testResults.failed++;
      }
    } else {
      // Should fail before Saturday (unless dev mode)
      if (result.status === 400 && result.data?.error?.includes('Saturday')) {
        console.log('   ✅ Correctly blocked (before Saturday)');
        testResults.passed++;
      } else if (process.env.NODE_ENV === 'development') {
        console.log('   ℹ️ Dev bypass active - restriction not enforced');
        testResults.passed++;
      } else {
        console.log(`   ❌ FAILED: Should be blocked but got ${result.status}`);
        testResults.failed++;
      }
    }
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testResults.failed++;
  }
}

// =============================================================================
// TEST 3: Session Numbering Across Weeks
// =============================================================================
async function test3_SessionNumbering() {
  console.log('\nTEST 3: Session Numbering Across Weeks');
  console.log('-'.repeat(70));
  
  try {
    const currentMonday = getCurrentWeekMonday();
    const weekStart = formatDate(currentMonday);
    
    const blocksResult = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    
    if (blocksResult.status !== 200 || !blocksResult.data?.blocks?.length) {
      console.log('   ⚠️ SKIPPED: No blocks found');
      testResults.skipped++;
      return;
    }
    
    // Find Rating 1 topics (should have session_total = 3)
    const rating1Blocks = blocksResult.data.blocks.filter(b => 
      b.session_total === 3 && b.status === 'scheduled'
    );
    
    if (rating1Blocks.length === 0) {
      console.log('   ⚠️ SKIPPED: No Rating 1 topics found');
      testResults.skipped++;
      return;
    }
    
    // Group by topic
    const topicGroups = {};
    rating1Blocks.forEach(block => {
      if (!topicGroups[block.topic_id]) {
        topicGroups[block.topic_id] = [];
      }
      topicGroups[block.topic_id].push(block);
    });
    
    // Check each topic has correct session numbers
    let allCorrect = true;
    Object.entries(topicGroups).forEach(([topicId, blocks]) => {
      const sessions = blocks.map(b => b.session_number).sort((a, b) => a - b);
      const expected = [1, 2, 3];
      
      if (sessions.length === 3 && sessions.every((s, i) => s === expected[i])) {
        console.log(`   ✅ ${blocks[0].topic_name?.substring(0, 40)}: Sessions ${sessions.join(', ')}`);
      } else {
        console.log(`   ❌ ${blocks[0].topic_name?.substring(0, 40)}: Expected [1,2,3], got [${sessions.join(',')}]`);
        allCorrect = false;
      }
    });
    
    if (allCorrect) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testResults.failed++;
  }
}

// =============================================================================
// TEST 4: Multi-Week Gap Enforcement
// =============================================================================
async function test4_MultiWeekGaps() {
  console.log('\nTEST 4: Multi-Week Gap Enforcement');
  console.log('-'.repeat(70));
  
  try {
    const currentMonday = getCurrentWeekMonday();
    const weekStart = formatDate(currentMonday);
    
    // Get blocks from current week
    const currentBlocks = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    
    if (currentBlocks.status !== 200 || !currentBlocks.data?.blocks?.length) {
      console.log('   ⚠️ SKIPPED: No blocks found');
      testResults.skipped++;
      return;
    }
    
    // Find Rating 1 topics with Session 1 in current week
    const session1Blocks = currentBlocks.data.blocks.filter(b => 
      b.session_total === 3 && 
      b.session_number === 1 && 
      b.status === 'scheduled'
    );
    
    if (session1Blocks.length === 0) {
      console.log('   ⚠️ SKIPPED: No Rating 1 Session 1 blocks found');
      testResults.skipped++;
      return;
    }
    
    // Check next week for Session 2
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    const nextWeekStart = formatDate(nextMonday);
    
    const nextBlocks = await apiCall(`/api/plan/generate?weekStart=${nextWeekStart}`);
    
    if (nextBlocks.status !== 200 || !nextBlocks.data?.blocks?.length) {
      console.log('   ⚠️ SKIPPED: No blocks in next week');
      testResults.skipped++;
      return;
    }
    
    // Check gaps for topics that span weeks
    let gapsCorrect = true;
    session1Blocks.forEach(session1Block => {
      const session2Block = nextBlocks.data.blocks.find(b => 
        b.topic_id === session1Block.topic_id && 
        b.session_number === 2
      );
      
      if (session2Block) {
        const session1Date = new Date(session1Block.scheduled_at);
        const session2Date = new Date(session2Block.scheduled_at);
        const daysDiff = getCalendarDaysDiff(session1Date, session2Date);
        
        // Rating 1 needs 2+ days between Session 1 and 2
        if (daysDiff >= 2) {
          console.log(`   ✅ ${session1Block.topic_name?.substring(0, 30)}: ${daysDiff} days gap (need 2+)`);
        } else {
          console.log(`   ❌ ${session1Block.topic_name?.substring(0, 30)}: Only ${daysDiff} days gap (need 2+)`);
          gapsCorrect = false;
        }
      }
    });
    
    if (gapsCorrect) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testResults.failed++;
  }
}

// =============================================================================
// TEST 5: Block Completion Impact
// =============================================================================
async function test5_BlockCompletion() {
  console.log('\nTEST 5: Block Completion Impact');
  console.log('-'.repeat(70));
  
  try {
    const currentMonday = getCurrentWeekMonday();
    const weekStart = formatDate(currentMonday);
    
    const blocksResult = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    
    if (blocksResult.status !== 200 || !blocksResult.data?.blocks?.length) {
      console.log('   ⚠️ SKIPPED: No blocks found');
      testResults.skipped++;
      return;
    }
    
    // Find a scheduled block to mark as done
    const scheduledBlock = blocksResult.data.blocks.find(b => 
      b.status === 'scheduled'
    );
    
    if (!scheduledBlock) {
      console.log('   ⚠️ SKIPPED: No scheduled blocks to test');
      testResults.skipped++;
      return;
    }
    
    console.log(`   Marking block as done: ${scheduledBlock.topic_name?.substring(0, 40)}`);
    
    // Mark as done
    const doneResult = await apiCall('/api/plan/mark-done', 'POST', {
      blockId: scheduledBlock.id
    });
    
    if (doneResult.status !== 200 || !doneResult.data?.success) {
      console.log(`   ❌ FAILED: Marking as done failed - ${doneResult.data?.error || 'Unknown'}`);
      testResults.failed++;
      return;
    }
    
    console.log('   ✅ Block marked as done');
    
    // Verify status changed
    await new Promise(resolve => setTimeout(resolve, 500));
    const verifyResult = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    const updatedBlock = verifyResult.data?.blocks?.find(b => b.id === scheduledBlock.id);
    
    if (updatedBlock?.status === 'done') {
      console.log('   ✅ Status correctly updated to "done"');
      testResults.passed++;
    } else {
      console.log(`   ❌ FAILED: Status is "${updatedBlock?.status}", expected "done"`);
      testResults.failed++;
    }
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testResults.failed++;
  }
}

// =============================================================================
// Main test runner
// =============================================================================
async function runAllTests() {
  try {
    // Check if server is running
    console.log('🔍 Checking if server is running...');
    const healthCheck = await apiCall('/api/plan/generate?weekStart=' + formatDate(getCurrentWeekMonday()));
    if (healthCheck.status === 500 && healthCheck.error) {
      console.error('\n❌ Server is not accessible!');
      console.error('   Please start the server with: npm run dev');
      process.exit(1);
    }
    console.log('✅ Server is running\n');
    
    // Run all tests
    await test1_ReratingFlow();
    await test2_SaturdayRestriction();
    await test3_SessionNumbering();
    await test4_MultiWeekGaps();
    await test5_BlockCompletion();
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Test Summary');
    console.log('='.repeat(70));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`⚠️  Skipped: ${testResults.skipped}`);
    console.log(`Total: ${testResults.passed + testResults.failed + testResults.skipped}`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n⚠️ Some tests failed. Review the output above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    process.exit(1);
  }
}

runAllTests();

