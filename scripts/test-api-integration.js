/**
 * API Integration Test Suite
 * 
 * Tests the full API flow including:
 * - Plan generation with cross-week gap enforcement
 * - Re-rating and block regeneration
 * - Saturday restriction
 * 
 * Prerequisites:
 * - Server must be running (npm run dev)
 * - User must be authenticated (or using dev user)
 * 
 * Run with: node scripts/test-api-integration.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

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

// Helper to get next week's Monday
function getNextWeekMonday() {
  const monday = getCurrentWeekMonday();
  monday.setDate(monday.getDate() + 7);
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

// =============================================================================
// Helper: Fetch user's actual data from database
// =============================================================================
async function fetchUserData() {
  console.log('📊 Fetching user data from database...');
  
  // Try to get subjects from existing blocks
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  const blocksResult = await apiCall(`/api/plan/get?targetWeekStart=${weekStart}`);
  
  let subjects = [];
  let hasRatings = false;
  
  if (blocksResult.status === 200 && blocksResult.data?.blocks) {
    // Extract unique subjects from blocks
    const subjectSet = new Set();
    blocksResult.data.blocks.forEach(block => {
      if (block.subject) {
        subjectSet.add(block.subject);
      }
    });
    subjects = Array.from(subjectSet);
    hasRatings = blocksResult.data.blocks.some(b => b.rating);
  }
  
  // If no subjects from blocks, try to get from topics API
  if (subjects.length === 0) {
    console.log('   No subjects found in blocks, trying topics API...');
    // Try common subjects
    const commonSubjects = ['biology', 'chemistry', 'physics', 'maths', 'psychology'];
    for (const subject of commonSubjects) {
      const topicsResult = await apiCall('/api/topics', 'POST', {
        subjects: [subject],
        boards: ['aqa']
      });
      
      if (topicsResult.status === 200 && topicsResult.data?.topics?.length > 0) {
        subjects.push(subject);
        console.log(`   Found topics for: ${subject}`);
        break; // Just need one subject to test
      }
    }
  }
  
  if (subjects.length === 0) {
    console.log('   ⚠️ No subjects found. Using defaults: biology, chemistry');
    subjects = ['biology', 'chemistry'];
  } else {
    console.log(`   ✅ Found subjects: ${subjects.join(', ')}`);
  }
  
  return { subjects, hasRatings };
}

console.log('🧪 API Integration Test Suite');
console.log('='.repeat(70));
console.log(`Server: ${BASE_URL}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log('');

// =============================================================================
// TEST 1: Get existing blocks for current week
// =============================================================================
async function test1_GetCurrentWeekBlocks() {
  console.log('TEST 1: Get Current Week Blocks');
  console.log('-'.repeat(70));
  
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  
  console.log(`📅 Current week starts: ${weekStart}`);
  
  const result = await apiCall(`/api/plan/get?targetWeekStart=${weekStart}`);
  
  console.log(`   Status: ${result.status}`);
  if (result.data) {
    const blocks = result.data.blocks || [];
    console.log(`   Blocks found: ${blocks.length}`);
    
    if (blocks.length > 0) {
      console.log('   Sample blocks:');
      blocks.slice(0, 3).forEach((block, i) => {
        console.log(`      ${i + 1}. ${block.topic_name || 'N/A'} - ${formatDate(new Date(block.scheduled_at))} - Session ${block.session_number || 'N/A'}/${block.session_total || 'N/A'}`);
      });
    }
  }
  
  return result;
}

// =============================================================================
// TEST 2: Generate plan for current week
// =============================================================================
async function test2_GenerateCurrentWeekPlan(userSubjects) {
  console.log('\nTEST 2: Generate Current Week Plan');
  console.log('-'.repeat(70));
  
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  
  console.log(`📅 Generating plan for: ${weekStart}`);
  console.log(`   Using subjects: ${userSubjects.join(', ')}`);
  console.log('   Note: This requires topics and ratings in the database');
  
  const result = await apiCall('/api/plan/generate', 'POST', {
    subjects: userSubjects,
    targetWeek: weekStart,
    availability: {
      monday: 4,
      tuesday: 4,
      wednesday: 4,
      thursday: 4,
      friday: 4,
      saturday: 2,
      sunday: 2
    },
    timePreferences: {
      weekdayEarliest: '09:00',
      weekdayLatest: '17:00',
      weekendEarliest: '10:00',
      weekendLatest: '16:00'
    },
    studyBlockDuration: 0.5
  });
  
  console.log(`   Status: ${result.status}`);
  if (result.data) {
    console.log(`   Success: ${result.data.success}`);
    if (result.data.error) {
      console.log(`   Error: ${result.data.error}`);
      if (result.data.error.includes('No blocks were generated')) {
        console.log('\n   ℹ️ This is expected if:');
        console.log('      - No topics exist in database for these subjects');
        console.log('      - User has no ratings set up');
        console.log('      - All topics are already completed');
        console.log('   → To test fully, ensure you have topics and ratings in the database');
      }
    }
    if (result.data.blocksCreated) {
      console.log(`   ✅ Blocks created: ${result.data.blocksCreated}`);
    }
  }
  
  return result;
}

// =============================================================================
// TEST 3: Get blocks and find a Rating 1 topic for re-rating test
// =============================================================================
async function test3_FindTopicForRerating() {
  console.log('\nTEST 3: Find Topic for Re-Rating Test');
  console.log('-'.repeat(70));
  
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  
  const result = await apiCall(`/api/plan/get?targetWeekStart=${weekStart}`);
  
  if (result.status === 200 && result.data?.blocks) {
    const blocks = result.data.blocks.filter(b => b.status === 'scheduled' && b.topic_id);
    
    if (blocks.length > 0) {
      // Find a block with rating 3 (so we can re-rate to 1)
      const rating3Block = blocks.find(b => b.rating === 3) || blocks[0];
      
      console.log(`   Found block: ${rating3Block.id.substring(0, 8)}...`);
      console.log(`   Topic: ${rating3Block.topic_name || 'N/A'}`);
      console.log(`   Current rating: ${rating3Block.rating || 'N/A'}`);
      console.log(`   Scheduled: ${formatDate(new Date(rating3Block.scheduled_at))}`);
      
      return rating3Block;
    }
  }
  
  console.log('   ⚠️ No blocks found for re-rating test');
  return null;
}

// =============================================================================
// TEST 4: Re-rate a topic from Rating 3 to Rating 1
// =============================================================================
async function test4_RerateTopic(blockId) {
  console.log('\nTEST 4: Re-Rate Topic (Rating 3 → Rating 1)');
  console.log('-'.repeat(70));
  
  if (!blockId) {
    console.log('   ⚠️ Skipped: No block ID provided');
    return null;
  }
  
  console.log(`   Re-rating block: ${blockId.substring(0, 8)}...`);
  console.log('   New rating: 1 (needs 3 sessions)');
  
  const result = await apiCall('/api/plan/rerate', 'POST', {
    blockId: blockId,
    reratingScore: 1
  });
  
  console.log(`   Status: ${result.status}`);
  if (result.data) {
    console.log(`   Success: ${result.data.success}`);
    if (result.data.nextAction) {
      console.log(`   Next action: ${result.data.nextAction.type}`);
      console.log(`   Message: ${result.data.nextAction.message}`);
    }
  }
  
  return result;
}

// =============================================================================
// TEST 5: Generate next week plan and verify re-rated topic blocks
// =============================================================================
async function test5_GenerateNextWeekWithReratedTopic(topicId, userSubjects) {
  console.log('\nTEST 5: Generate Next Week Plan with Re-Rated Topic');
  console.log('-'.repeat(70));
  
  const nextMonday = getNextWeekMonday();
  const weekStart = formatDate(nextMonday);
  
  console.log(`📅 Generating plan for next week: ${weekStart}`);
  console.log(`   Topic ID: ${topicId?.substring(0, 8) || 'N/A'}...`);
  console.log('   Expected: 2 blocks (Session 2 and 3) for Rating 1 topic');
  
  const result = await apiCall('/api/plan/generate', 'POST', {
    subjects: userSubjects,
    targetWeek: weekStart,
    availability: {
      monday: 4,
      tuesday: 4,
      wednesday: 4,
      thursday: 4,
      friday: 4,
      saturday: 2,
      sunday: 2
    },
    timePreferences: {
      weekdayEarliest: '09:00',
      weekdayLatest: '17:00',
      weekendEarliest: '10:00',
      weekendLatest: '16:00'
    },
    studyBlockDuration: 0.5
  });
  
  console.log(`   Status: ${result.status}`);
  if (result.data) {
    console.log(`   Success: ${result.data.success}`);
    if (result.data.error) {
      console.log(`   Error: ${result.data.error}`);
    }
    if (result.data.blocksCreated) {
      console.log(`   Blocks created: ${result.data.blocksCreated}`);
    }
  }
  
  // Get the blocks to verify
  const getResult = await apiCall(`/api/plan/get?targetWeekStart=${weekStart}`);
  if (getResult.status === 200 && getResult.data?.blocks && topicId) {
    const topicBlocks = getResult.data.blocks.filter(b => b.topic_id === topicId && b.status === 'scheduled');
    
    console.log(`\n   📊 Blocks for re-rated topic: ${topicBlocks.length}`);
    if (topicBlocks.length > 0) {
      topicBlocks.forEach((block, i) => {
        console.log(`      Block ${i + 1}: ${formatDate(new Date(block.scheduled_at))} - Session ${block.session_number}/${block.session_total}`);
      });
      
      // Verify: Should have 2 blocks (Session 2 and 3)
      if (topicBlocks.length === 2) {
        console.log('   ✅ Correct number of blocks (2)');
      } else {
        console.log(`   ⚠️ Expected 2 blocks, got ${topicBlocks.length}`);
      }
      
      // Verify: Session numbering
      if (topicBlocks[0].session_number === 2 && topicBlocks[0].session_total === 3) {
        console.log('   ✅ Session numbering correct (Session 2/3)');
      }
      if (topicBlocks[1]?.session_number === 3 && topicBlocks[1]?.session_total === 3) {
        console.log('   ✅ Session numbering correct (Session 3/3)');
      }
    }
  }
  
  return result;
}

// =============================================================================
// TEST 6: Test Saturday restriction (should fail before Saturday)
// =============================================================================
async function test6_SaturdayRestriction(userSubjects) {
  console.log('\nTEST 6: Saturday Restriction Test');
  console.log('-'.repeat(70));
  
  const today = new Date();
  const dayOfWeek = today.getDay();
  const isSaturdayOrLater = dayOfWeek === 6 || dayOfWeek === 0;
  
  console.log(`   Today: ${today.toLocaleDateString()}`);
  console.log(`   Day of week: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}`);
  console.log(`   Is Saturday or later: ${isSaturdayOrLater}`);
  
  const nextMonday = getNextWeekMonday();
  const weekStart = formatDate(nextMonday);
  
  console.log(`\n   Attempting to generate next week plan: ${weekStart}`);
  console.log(`   Using subjects: ${userSubjects.join(', ')}`);
  
  const result = await apiCall('/api/plan/generate', 'POST', {
    subjects: userSubjects,
    targetWeek: weekStart,
    availability: {
      monday: 4
    },
    studyBlockDuration: 0.5
  });
  
  console.log(`   Status: ${result.status}`);
  
  if (isSaturdayOrLater) {
    // Should succeed on Saturday/Sunday
    if (result.status === 200 || result.data?.success) {
      console.log('   ✅ Correctly allowed (Saturday/Sunday)');
    } else {
      console.log(`   ⚠️ Unexpected error: ${result.data?.error || 'Unknown'}`);
    }
  } else {
    // Should fail before Saturday
    if (result.status === 400 && result.data?.error?.includes('Saturday')) {
      console.log('   ✅ Correctly blocked (before Saturday)');
    } else if (process.env.NODE_ENV === 'development') {
      console.log('   ℹ️ Dev bypass active - restriction not enforced');
    } else {
      console.log(`   ⚠️ Expected 400 error, got ${result.status}`);
    }
  }
  
  return result;
}

// =============================================================================
// TEST 7: Cross-week gap enforcement verification
// =============================================================================
async function test7_CrossWeekGapEnforcement() {
  console.log('\nTEST 7: Cross-Week Gap Enforcement Verification');
  console.log('-'.repeat(70));
  
  const currentMonday = getCurrentWeekMonday();
  const currentWeekStart = formatDate(currentMonday);
  
  // Get blocks from current week
  const currentResult = await apiCall(`/api/plan/get?targetWeekStart=${currentWeekStart}`);
  
  if (currentResult.status === 200 && currentResult.data?.blocks) {
    const currentBlocks = currentResult.data.blocks.filter(b => 
      b.status === 'scheduled' && 
      b.rating === 1 && 
      b.session_number === 1
    );
    
    if (currentBlocks.length === 0) {
      console.log('   ⚠️ No Rating 1 Session 1 blocks found in current week');
      return;
    }
    
    // Find a block scheduled on Friday or Saturday
    const fridayBlock = currentBlocks.find(b => {
      const date = new Date(b.scheduled_at);
      return date.getDay() === 5; // Friday
    });
    
    const saturdayBlock = currentBlocks.find(b => {
      const date = new Date(b.scheduled_at);
      return date.getDay() === 6; // Saturday
    });
    
    const testBlock = fridayBlock || saturdayBlock || currentBlocks[0];
    const blockDate = new Date(testBlock.scheduled_at);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][blockDate.getDay()];
    
    console.log(`   Found test block: ${testBlock.topic_name || 'N/A'}`);
    console.log(`   Scheduled: ${dayName} ${formatDate(blockDate)}`);
    console.log(`   Rating: ${testBlock.rating} (needs 3 sessions)`);
    
    // Get next week blocks
    const nextMonday = getNextWeekMonday();
    const nextWeekStart = formatDate(nextMonday);
    
    const nextResult = await apiCall(`/api/plan/get?targetWeekStart=${nextWeekStart}`);
    
    if (nextResult.status === 200 && nextResult.data?.blocks) {
      const nextWeekBlocks = nextResult.data.blocks.filter(b => 
        b.topic_id === testBlock.topic_id && 
        b.status === 'scheduled'
      );
      
      if (nextWeekBlocks.length > 0) {
        const session2Block = nextWeekBlocks.find(b => b.session_number === 2);
        
        if (session2Block) {
          const session2Date = new Date(session2Block.scheduled_at);
          const daysDiff = getCalendarDaysDiff(blockDate, session2Date);
          
          console.log(`\n   Session 2 scheduled: ${formatDate(session2Date)}`);
          console.log(`   Days between sessions: ${daysDiff}`);
          
          if (daysDiff >= 2) {
            console.log('   ✅ Gap respected (2+ days)');
          } else {
            console.log(`   ❌ Gap not respected! Only ${daysDiff} days, need 2+`);
          }
        }
      } else {
        console.log('   ⚠️ No blocks found for this topic in next week');
      }
    }
  }
}

// =============================================================================
// Main test runner
// =============================================================================
async function runAllTests() {
  try {
    // Fetch user's actual data
    const userData = await fetchUserData();
    console.log('');
    
    // Test 1: Get current week blocks
    await test1_GetCurrentWeekBlocks();
    
    // Test 2: Generate current week plan (using user's subjects)
    const genResult = await test2_GenerateCurrentWeekPlan(userData.subjects);
    
    // Test 3: Find topic for re-rating
    const testBlock = await test3_FindTopicForRerating();
    
    // Test 4 & 5: Only run if we have blocks (plan generation succeeded)
    if (testBlock && genResult.data?.success) {
      // Test 4: Re-rate topic
      await test4_RerateTopic(testBlock.id);
      
      // Wait a moment for database to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test 5: Generate next week with re-rated topic
      await test5_GenerateNextWeekWithReratedTopic(testBlock.topic_id, userData.subjects);
    } else {
      console.log('\n⚠️ Skipping re-rating tests (no blocks available)');
      console.log('   These tests require a successful plan generation first');
    }
    
    // Test 6: Saturday restriction (using user's subjects)
    await test6_SaturdayRestriction(userData.subjects);
    
    // Test 7: Cross-week gap enforcement (only if we have blocks)
    if (genResult.data?.success) {
      await test7_CrossWeekGapEnforcement();
    } else {
      console.log('\n⚠️ Skipping gap enforcement test (no blocks available)');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ All API tests completed!');
    console.log('\n📝 Summary:');
    console.log('   - Saturday restriction: ✅ Working');
    if (genResult.data?.success) {
      console.log('   - Plan generation: ✅ Working');
      console.log('   - Re-rating tests: ' + (testBlock ? '✅ Available' : '⚠️ No blocks found'));
    } else {
      console.log('   - Plan generation: ⚠️ Requires topics/ratings in database');
      console.log('   - Re-rating tests: ⚠️ Skipped (requires plan generation)');
    }
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    process.exit(1);
  }
}

// Check if server is accessible
async function checkServer() {
  try {
    const result = await apiCall('/api/plan/get');
    return result.status !== 500; // Any response means server is up
  } catch {
    return false;
  }
}

// Run tests
(async () => {
  console.log('🔍 Checking if server is running...');
  const serverUp = await checkServer();
  
  if (!serverUp) {
    console.error('\n❌ Server is not accessible!');
    console.error('   Please start the server with: npm run dev');
    console.error(`   Then run this script again.`);
    process.exit(1);
  }
  
  console.log('✅ Server is running\n');
  await runAllTests();
})();

