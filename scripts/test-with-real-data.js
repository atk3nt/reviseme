/**
 * Test with Real Database Data
 * 
 * This script directly accesses the database to:
 * 1. Find your actual user, subjects, topics, and ratings
 * 2. Use that data to test plan generation
 * 3. Test re-rating and cross-week gap enforcement
 * 
 * Run with: node scripts/test-with-real-data.js
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Environment check:');
console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✅ Set' : '❌ Missing'}`);
console.log('');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('\n   Your server is running, so the variables must be set somewhere.');
  console.error('   Try running this script while your dev server is running:');
  console.error('   The server loads the env vars, so we can test through the API.\n');
  console.error('   Or check your .env.local file has these variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to format date
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
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

console.log('🔍 Fetching Real Data from Database');
console.log('='.repeat(70));

async function fetchRealUserData() {
  // Get all users
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email, name, has_completed_onboarding')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (userError) {
    console.error('❌ Error fetching users:', userError);
    return null;
  }
  
  console.log(`\n📊 Found ${users.length} users in database:`);
  users.forEach((user, i) => {
    console.log(`   ${i + 1}. ${user.email || 'No email'} (${user.name || 'No name'}) - Onboarded: ${user.has_completed_onboarding}`);
  });
  
  // Find a user with onboarding completed
  let targetUser = users.find(u => u.has_completed_onboarding);
  
  if (!targetUser && users.length > 0) {
    console.log('\n   ⚠️ No users with completed onboarding, using first user');
    targetUser = users[0];
  }
  
  if (!targetUser) {
    console.log('\n   ❌ No users found in database');
    return null;
  }
  
  console.log(`\n✅ Using user: ${user.email || targetUser.id}`);
  
  return targetUser;
}

async function fetchUserTopicsAndRatings(userId) {
  console.log('\n📚 Fetching topics and ratings...');
  
  // Get user's confidence ratings
  const { data: ratings, error: ratingsError } = await supabase
    .from('user_topic_confidence')
    .select(`
      topic_id,
      rating,
      topics!inner(
        id,
        name,
        level,
        parent_id,
        spec_id,
        specs!inner(
          subject,
          exam_board
        )
      )
    `)
    .eq('user_id', userId);
  
  if (ratingsError) {
    console.error('   ❌ Error fetching ratings:', ratingsError);
    return null;
  }
  
  if (!ratings || ratings.length === 0) {
    console.log('   ⚠️ No ratings found for this user');
    return null;
  }
  
  console.log(`   ✅ Found ${ratings.length} rated topics`);
  
  // Group by subject
  const subjectMap = {};
  ratings.forEach(r => {
    const subject = r.topics.specs.subject;
    if (!subjectMap[subject]) {
      subjectMap[subject] = [];
    }
    subjectMap[subject].push({
      id: r.topic_id,
      name: r.topics.name,
      rating: r.rating,
      level: r.topics.level,
      examBoard: r.topics.specs.exam_board
    });
  });
  
  console.log('\n   Topics by subject:');
  Object.entries(subjectMap).forEach(([subject, topics]) => {
    console.log(`   📖 ${subject}: ${topics.length} topics`);
    // Show rating distribution
    const ratingDist = {};
    topics.forEach(t => {
      ratingDist[t.rating] = (ratingDist[t.rating] || 0) + 1;
    });
    console.log(`      Ratings: ${Object.entries(ratingDist).map(([r, c]) => `${r}★(${c})`).join(', ')}`);
  });
  
  return {
    subjects: Object.keys(subjectMap),
    topicsBySubject: subjectMap,
    allRatings: ratings
  };
}

async function fetchUserBlocks(userId) {
  console.log('\n📅 Fetching existing blocks...');
  
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  const weekEnd = new Date(currentMonday);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select(`
      id,
      topic_id,
      scheduled_at,
      status,
      rating,
      session_number,
      session_total,
      topics!inner(
        name,
        specs!inner(subject)
      )
    `)
    .eq('user_id', userId)
    .gte('scheduled_at', `${weekStart}T00:00:00Z`)
    .lt('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at', { ascending: true });
  
  if (blocksError) {
    console.error('   ❌ Error fetching blocks:', blocksError);
    return [];
  }
  
  console.log(`   ✅ Found ${blocks?.length || 0} blocks for current week (${weekStart})`);
  
  if (blocks && blocks.length > 0) {
    console.log('\n   Sample blocks:');
    blocks.slice(0, 5).forEach((block, i) => {
      const date = new Date(block.scheduled_at);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      console.log(`      ${i + 1}. ${dayName} ${formatDate(date)} - ${block.topics?.name?.substring(0, 30) || 'N/A'} (Rating ${block.rating}, Session ${block.session_number}/${block.session_total})`);
    });
  }
  
  return blocks || [];
}

async function fetchUserAvailability(userId) {
  console.log('\n⏰ Fetching user availability...');
  
  const { data: user, error } = await supabase
    .from('users')
    .select('availability, time_preferences, study_block_duration')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('   ❌ Error fetching availability:', error);
    return null;
  }
  
  if (!user.availability) {
    console.log('   ⚠️ No availability set, using defaults');
    return {
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
    };
  }
  
  console.log('   ✅ Availability found');
  console.log(`      Weekdays: ${user.availability.monday || 0} slots/day`);
  console.log(`      Weekend: ${user.availability.saturday || 0} slots/day`);
  
  return {
    availability: user.availability,
    timePreferences: user.time_preferences || {
      weekdayEarliest: '09:00',
      weekdayLatest: '17:00',
      weekendEarliest: '10:00',
      weekendLatest: '16:00'
    },
    studyBlockDuration: user.study_block_duration || 0.5
  };
}

async function testPlanGenerationWithRealData(userId, subjects, availability) {
  console.log('\n🧪 TEST: Plan Generation with Real Data');
  console.log('-'.repeat(70));
  
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  
  console.log(`📅 Generating plan for: ${weekStart}`);
  console.log(`   User ID: ${userId.substring(0, 8)}...`);
  console.log(`   Subjects: ${subjects.join(', ')}`);
  
  // Make API call
  const response = await fetch('http://localhost:3000/api/plan/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subjects: subjects,
      targetWeek: weekStart,
      availability: availability.availability,
      timePreferences: availability.timePreferences,
      studyBlockDuration: availability.studyBlockDuration
    })
  });
  
  const result = await response.json();
  
  console.log(`\n   Status: ${response.status}`);
  console.log(`   Success: ${result.success}`);
  
  if (result.error) {
    console.log(`   ❌ Error: ${result.error}`);
  }
  
  if (result.blocksCreated) {
    console.log(`   ✅ Blocks created: ${result.blocksCreated}`);
  }
  
  return result;
}

async function analyzeGapEnforcement(userId) {
  console.log('\n🔍 Analyzing Gap Enforcement in Existing Blocks');
  console.log('-'.repeat(70));
  
  // Get all blocks for the user, ordered by topic and scheduled date
  const { data: blocks, error } = await supabase
    .from('blocks')
    .select(`
      id,
      topic_id,
      scheduled_at,
      status,
      rating,
      session_number,
      session_total,
      topics!inner(name)
    `)
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .order('topic_id', { ascending: true })
    .order('scheduled_at', { ascending: true });
  
  if (error || !blocks || blocks.length === 0) {
    console.log('   ⚠️ No scheduled blocks to analyze');
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
  
  console.log(`\n   Analyzing ${Object.keys(topicBlocks).length} topics with multiple sessions...`);
  
  let gapViolations = 0;
  let gapsRespected = 0;
  
  Object.entries(topicBlocks).forEach(([topicId, topicBlocksList]) => {
    if (topicBlocksList.length < 2) return; // Need at least 2 blocks to check gaps
    
    const topicName = topicBlocksList[0].topics.name;
    const rating = topicBlocksList[0].rating;
    
    console.log(`\n   📖 ${topicName} (Rating ${rating})`);
    
    // Expected gaps for this rating
    const expectedGaps = rating === 1 ? [2, 3] : rating === 2 ? [2, 4] : [7];
    
    for (let i = 1; i < topicBlocksList.length; i++) {
      const prevBlock = topicBlocksList[i - 1];
      const currBlock = topicBlocksList[i];
      
      const prevDate = new Date(prevBlock.scheduled_at);
      const currDate = new Date(currBlock.scheduled_at);
      
      // Calculate calendar days
      const prevDay = new Date(Date.UTC(prevDate.getUTCFullYear(), prevDate.getUTCMonth(), prevDate.getUTCDate()));
      const currDay = new Date(Date.UTC(currDate.getUTCFullYear(), currDate.getUTCMonth(), currDate.getUTCDate()));
      const daysDiff = Math.round((currDay - prevDay) / (1000 * 60 * 60 * 24));
      
      const expectedGap = expectedGaps[i - 1] || 1;
      const gapRespected = daysDiff >= expectedGap;
      
      const status = gapRespected ? '✅' : '❌';
      console.log(`      ${status} Session ${prevBlock.session_number} → ${currBlock.session_number}: ${daysDiff} days (need ${expectedGap}+)`);
      
      if (gapRespected) {
        gapsRespected++;
      } else {
        gapViolations++;
      }
    }
  });
  
  console.log('\n   ' + '='.repeat(66));
  console.log(`   Summary: ${gapsRespected} gaps respected, ${gapViolations} violations`);
  
  if (gapViolations === 0) {
    console.log('   🎉 All gaps are correctly enforced!');
  } else {
    console.log('   ⚠️ Some gaps are not respected - this needs investigation');
  }
}

// Main execution
async function main() {
  try {
    // Step 1: Find user
    const user = await fetchRealUserData();
    if (!user) {
      console.log('\n❌ Cannot proceed without a user. Please:');
      console.log('   1. Sign up through the UI');
      console.log('   2. Complete onboarding');
      console.log('   3. Set topic ratings');
      process.exit(1);
    }
    
    // Step 2: Get topics and ratings
    const topicsData = await fetchUserTopicsAndRatings(user.id);
    if (!topicsData) {
      console.log('\n❌ No topics/ratings found. Please:');
      console.log('   1. Complete onboarding in the UI');
      console.log('   2. Rate your topics');
      process.exit(1);
    }
    
    // Step 3: Get existing blocks
    const blocks = await fetchUserBlocks(user.id);
    
    // Step 4: Get availability
    const availability = await fetchUserAvailability(user.id);
    
    // Step 5: Analyze existing gaps (if blocks exist)
    if (blocks.length > 0) {
      await analyzeGapEnforcement(user.id);
    }
    
    // Step 6: Test plan generation
    console.log('\n' + '='.repeat(70));
    const planResult = await testPlanGenerationWithRealData(
      user.id,
      topicsData.subjects,
      availability
    );
    
    // Step 7: If plan was generated, analyze gaps again
    if (planResult.success && planResult.blocksCreated > 0) {
      await analyzeGapEnforcement(user.id);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Test completed!');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
