/**
 * Test Real User Flow
 * 
 * This script tests the complete flow using your real data through the API:
 * 1. Get your existing blocks
 * 2. Analyze gap enforcement
 * 3. Generate a new plan
 * 4. Verify gaps are respected
 * 
 * Prerequisites: Server must be running (npm run dev)
 * Run with: node scripts/test-real-user-flow.js
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

console.log('🧪 Real User Flow Test');
console.log('='.repeat(70));
console.log(`Server: ${BASE_URL}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log('');

async function analyzeExistingBlocks() {
  console.log('📊 STEP 1: Analyzing Existing Blocks');
  console.log('-'.repeat(70));
  
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  
  console.log(`📅 Current week: ${weekStart}`);
  
  // Use correct endpoint: /api/plan/generate with weekStart parameter
  const result = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
  
  if (result.status !== 200 || !result.data?.blocks) {
    console.log('   ⚠️ No blocks found or error fetching blocks');
    console.log(`   Status: ${result.status}`);
    if (result.data?.error) {
      console.log(`   Error: ${result.data.error}`);
    }
    return { blocks: [], subjects: [] };
  }
  
  const blocks = result.data.blocks.filter(b => b.status === 'scheduled');
  console.log(`   ✅ Found ${blocks.length} scheduled blocks`);
  
  if (blocks.length === 0) {
    console.log('\n   💡 No blocks yet. You should:');
    console.log('      1. Complete onboarding in the UI');
    console.log('      2. Rate your topics');
    console.log('      3. Generate a plan');
    return { blocks: [], subjects: [] };
  }
  
  // Extract subjects
  const subjectSet = new Set();
  blocks.forEach(b => {
    if (b.subject) subjectSet.add(b.subject);
  });
  const subjects = Array.from(subjectSet);
  
  console.log(`\n   📚 Subjects found: ${subjects.join(', ')}`);
  
  // Fetch actual ratings for topics
  console.log('\n   🔍 Fetching topic ratings...');
  const topicIds = [...new Set(blocks.map(b => b.topic_id).filter(Boolean))];
  
  // Try to get ratings from API (we'll need to create a helper endpoint or use existing one)
  // For now, infer rating from session_total: Rating 1 = 3 sessions, Rating 2 = 2 sessions, Rating 3 = 1 session
  const ratingMap = {};
  blocks.forEach(block => {
    if (block.topic_id && !ratingMap[block.topic_id]) {
      // Infer rating from session_total if available
      if (block.session_total === 3) {
        ratingMap[block.topic_id] = 1; // Rating 1 needs 3 sessions
      } else if (block.session_total === 2) {
        ratingMap[block.topic_id] = 2; // Rating 2 needs 2 sessions
      } else if (block.session_total === 1) {
        ratingMap[block.topic_id] = 3; // Rating 3 needs 1 session
      } else if (block.rerating_score) {
        ratingMap[block.topic_id] = block.rerating_score;
      }
    }
  });
  
  // Add rating to each block
  blocks.forEach(block => {
    block.rating = ratingMap[block.topic_id] || block.rerating_score || null;
  });
  
  // Show sample blocks
  console.log('\n   Sample blocks:');
  blocks.slice(0, 5).forEach((block, i) => {
    const date = new Date(block.scheduled_at);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    const ratingDisplay = block.rating ? `Rating ${block.rating}` : 'Rating unknown';
    console.log(`      ${i + 1}. ${dayName} ${formatDate(date)} - ${block.topic_name?.substring(0, 30) || 'N/A'} (${ratingDisplay}, Session ${block.session_number}/${block.session_total})`);
  });
  
  return { blocks, subjects };
}

async function analyzeGapEnforcement(blocks) {
  console.log('\n🔍 STEP 2: Analyzing Gap Enforcement');
  console.log('-'.repeat(70));
  
  if (blocks.length === 0) {
    console.log('   ⚠️ No blocks to analyze');
    return;
  }
  
  // Group by topic
  const topicBlocks = {};
  blocks.forEach(block => {
    if (!topicBlocks[block.topic_id]) {
      topicBlocks[block.topic_id] = [];
    }
    topicBlocks[block.topic_id].push(block);
  });
  
  // Filter to topics with multiple sessions
  const multiSessionTopics = Object.entries(topicBlocks).filter(([_, blocks]) => blocks.length >= 2);
  
  if (multiSessionTopics.length === 0) {
    console.log('   ℹ️ No topics with multiple sessions to analyze gaps');
    return;
  }
  
  console.log(`\n   Analyzing ${multiSessionTopics.length} topics with multiple sessions...`);
  
  let gapViolations = 0;
  let gapsRespected = 0;
  
  multiSessionTopics.forEach(([topicId, topicBlocksList]) => {
    // Sort by scheduled date
    topicBlocksList.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    
    const topicName = topicBlocksList[0].topic_name;
    const rating = topicBlocksList[0].rating;
    
    // If rating is still unknown, try to infer from session_total
    let inferredRating = rating;
    if (!inferredRating && topicBlocksList[0].session_total) {
      if (topicBlocksList[0].session_total === 3) {
        inferredRating = 1;
      } else if (topicBlocksList[0].session_total === 2) {
        inferredRating = 2;
      } else if (topicBlocksList[0].session_total === 1) {
        inferredRating = 3;
      }
    }
    
    const ratingDisplay = inferredRating ? `Rating ${inferredRating}` : 'Rating unknown';
    console.log(`\n   📖 ${topicName} (${ratingDisplay})`);
    
    // Expected gaps for this rating
    // Rating 1: gapDays [2, 3] means +2 days after session 1, +3 days after session 2
    // Rating 2: gapDays [2, 4] means +2 days after session 1, +4 days after session 2
    // Rating 3: gapDays [7] means +7 days after session 1
    const expectedGaps = inferredRating === 1 ? [2, 3] : inferredRating === 2 ? [2, 4] : inferredRating === 3 ? [7] : [7]; // Default to 7 if unknown
    
    for (let i = 1; i < topicBlocksList.length; i++) {
      const prevBlock = topicBlocksList[i - 1];
      const currBlock = topicBlocksList[i];
      
      const prevDate = new Date(prevBlock.scheduled_at);
      const currDate = new Date(currBlock.scheduled_at);
      
      const daysDiff = getCalendarDaysDiff(prevDate, currDate);
      const expectedGap = expectedGaps[i - 1] || 1;
      const gapRespected = daysDiff >= expectedGap;
      
      const status = gapRespected ? '✅' : '❌';
      const prevDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][prevDate.getDay()];
      const currDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currDate.getDay()];
      
      console.log(`      ${status} ${prevDay} ${formatDate(prevDate)} → ${currDay} ${formatDate(currDate)}: ${daysDiff} days (need ${expectedGap}+)`);
      
      if (gapRespected) {
        gapsRespected++;
      } else {
        gapViolations++;
      }
    }
  });
  
  console.log('\n   ' + '='.repeat(66));
  console.log(`   Summary: ${gapsRespected} gaps respected, ${gapViolations} violations`);
  
  if (gapViolations === 0 && gapsRespected > 0) {
    console.log('   🎉 All gaps are correctly enforced!');
  } else if (gapViolations > 0) {
    console.log('   ⚠️ Some gaps are not respected - this indicates a bug');
  }
  
  return { gapsRespected, gapViolations };
}

async function main() {
  try {
    // Check if server is running
    console.log('🔍 Checking if server is running...');
    const healthCheck = await apiCall('/api/plan/get');
    if (healthCheck.status === 500 && healthCheck.error) {
      console.error('\n❌ Server is not accessible!');
      console.error('   Please start the server with: npm run dev');
      process.exit(1);
    }
    console.log('✅ Server is running\n');
    
    // Step 1: Get and analyze existing blocks
    const { blocks, subjects } = await analyzeExistingBlocks();
    
    // Step 2: Analyze gap enforcement
    if (blocks.length > 0) {
      await analyzeGapEnforcement(blocks);
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📝 Test Summary');
    console.log('='.repeat(70));
    
    if (blocks.length === 0) {
      console.log('⚠️ No blocks found');
      console.log('\nNext steps:');
      console.log('   1. Complete onboarding through the UI');
      console.log('   2. Rate your topics');
      console.log('   3. Generate a plan');
      console.log('   4. Run this script again to analyze gaps');
    } else {
      console.log(`✅ Analyzed ${blocks.length} blocks`);
      console.log(`✅ Found ${subjects.length} subjects: ${subjects.join(', ')}`);
      console.log('\n💡 To test plan generation with your data:');
      console.log('   - Generate a new plan through the UI');
      console.log('   - Run this script again to verify gaps');
    }
    
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();

