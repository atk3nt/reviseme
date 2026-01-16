/**
 * Test script to verify duplicate block prevention
 * 
 * This script:
 * 1. Generates a plan for the current week
 * 2. Checks for duplicate blocks (same topic on same day)
 * 3. Checks for rating inconsistencies (same topic with different ratings)
 * 4. Checks for proper gap enforcement
 * 
 * Run with: node scripts/test-duplicate-prevention.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const DEV_USER_EMAIL = 'appmarkrai@gmail.com';
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
    const data = await response.json();
    return { status: response.status, data };
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

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function testDuplicatePrevention() {
  console.log('🧪 Duplicate Block Prevention Test');
  console.log('='.repeat(70));
  console.log('');
  
  try {
    // Get dev user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, onboarding_data')
      .eq('email', DEV_USER_EMAIL)
      .maybeSingle();

    if (userError) {
      console.error('❌ Error fetching dev user:', userError);
      process.exit(1);
    }
    
    if (!user) {
      console.error('❌ Dev user not found');
      console.log('   Looking for email:', DEV_USER_EMAIL);
      
      // Try to find any user
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, email, name')
        .limit(5);
      
      console.log('   Available users:', allUsers?.map(u => u.email));
      process.exit(1);
    }

    console.log('✅ Found dev user:', user.id);
    console.log('');

    // Fetch existing blocks for current week
    const currentMonday = getCurrentWeekMonday();
    const weekStart = formatDate(currentMonday);
    
    console.log('📅 Fetching blocks for week:', weekStart);
    console.log('');
    
    const fetchResult = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
    
    if (fetchResult.status !== 200 || !fetchResult.data?.success) {
      console.log('⚠️ No blocks found for current week. You need to generate a plan first.');
      console.log('   Go to your app and generate a plan, then run this test again.');
      process.exit(0);
    }
    
    const blocks = fetchResult.data.blocks || [];
    console.log(`✅ Generated ${blocks.length} blocks`);
    console.log('');
    
    // Check for duplicates
    console.log('🔍 Checking for duplicate blocks...');
    console.log('-'.repeat(70));
    
    // Group blocks by date
    const blocksByDate = {};
    blocks.forEach(block => {
      const date = block.scheduled_at.split('T')[0];
      if (!blocksByDate[date]) {
        blocksByDate[date] = [];
      }
      blocksByDate[date].push(block);
    });
    
    let duplicatesFound = false;
    let ratingInconsistencies = false;
    let gapViolations = false;
    
    // Check for same topic on same day
    Object.entries(blocksByDate).forEach(([date, dayBlocks]) => {
      const topicsSeen = new Set();
      dayBlocks.forEach(block => {
        if (topicsSeen.has(block.topic_id)) {
          console.error(`❌ DUPLICATE: Topic "${block.topic_name}" scheduled twice on ${date}`);
          duplicatesFound = true;
        }
        topicsSeen.add(block.topic_id);
      });
    });
    
    if (!duplicatesFound) {
      console.log('✅ No same-day duplicates found');
    }
    
    // Check for rating inconsistencies
    const topicRatings = {};
    blocks.forEach(block => {
      if (!topicRatings[block.topic_id]) {
        topicRatings[block.topic_id] = block.rating;
      } else if (topicRatings[block.topic_id] !== block.rating) {
        console.error(`❌ RATING INCONSISTENCY: Topic "${block.topic_name}" has rating ${topicRatings[block.topic_id]} and ${block.rating}`);
        ratingInconsistencies = true;
      }
    });
    
    if (!ratingInconsistencies) {
      console.log('✅ No rating inconsistencies found');
    }
    
    // Check gap enforcement AND Monday/Tuesday restriction for rating 1
    const blocksByTopic = {};
    blocks.forEach(block => {
      if (!blocksByTopic[block.topic_id]) {
        blocksByTopic[block.topic_id] = [];
      }
      blocksByTopic[block.topic_id].push(block);
    });
    
    Object.entries(blocksByTopic).forEach(([topicId, topicBlocks]) => {
      // Check Monday/Tuesday restriction for rating 1 topics
      if (topicBlocks[0].rating === 1) {
        topicBlocks.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        const firstBlock = topicBlocks[0];
        const firstDate = new Date(firstBlock.scheduled_at);
        const dayOfWeek = firstDate.getDay(); // 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat
        
        if (dayOfWeek !== 1 && dayOfWeek !== 2) {
          const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
          console.error(`❌ MONDAY/TUESDAY VIOLATION: Rating 1 topic "${firstBlock.topic_name}" started on ${dayName} (only Mon/Tue allowed)`);
          gapViolations = true;
        }
      }
      
      if (topicBlocks.length > 1) {
        // Sort by date
        topicBlocks.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        
        for (let i = 1; i < topicBlocks.length; i++) {
          const prevBlock = topicBlocks[i - 1];
          const currBlock = topicBlocks[i];
          
          const prevDate = new Date(prevBlock.scheduled_at);
          const currDate = new Date(currBlock.scheduled_at);
          
          const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
          
          // Get expected gap based on rating
          const rating = prevBlock.rating;
          let expectedGap;
          if (rating === 1) {
            expectedGap = i === 1 ? 2 : 3; // After session 1: 2 days, after session 2: 3 days
          } else if (rating === 2) {
            expectedGap = 2; // After session 1: 2 days
          } else {
            expectedGap = 0; // No gap for ratings 3-5
          }
          
          if (daysDiff < expectedGap) {
            console.error(`❌ GAP VIOLATION: Topic "${prevBlock.topic_name}" - ${daysDiff} days between sessions (expected ${expectedGap}+)`);
            console.error(`   Session ${i}: ${prevDate.toISOString().split('T')[0]}`);
            console.error(`   Session ${i + 1}: ${currDate.toISOString().split('T')[0]}`);
            gapViolations = true;
          }
        }
      }
    });
    
    if (!gapViolations) {
      console.log('✅ No gap violations or day restrictions found');
    }
    
    console.log('');
    console.log('📊 Summary:');
    console.log('-'.repeat(70));
    console.log(`   Total blocks: ${blocks.length}`);
    console.log(`   Unique topics: ${Object.keys(blocksByTopic).length}`);
    console.log(`   Topics with multiple sessions: ${Object.values(blocksByTopic).filter(b => b.length > 1).length}`);
    console.log('');
    
    // Show sample of topics with multiple sessions
    const multiSessionTopics = Object.entries(blocksByTopic).filter(([_, blocks]) => blocks.length > 1);
    if (multiSessionTopics.length > 0) {
      console.log('📋 Topics with multiple sessions (sample):');
      multiSessionTopics.slice(0, 5).forEach(([topicId, topicBlocks]) => {
        topicBlocks.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        console.log(`   ${topicBlocks[0].topic_name?.substring(0, 40)}:`);
        topicBlocks.forEach((block, idx) => {
          const date = new Date(block.scheduled_at).toISOString().split('T')[0];
          const time = block.scheduled_at.split('T')[1].substring(0, 5);
          console.log(`      Session ${block.session_number}/${block.session_total}: ${date} ${time} (Rating ${block.rating})`);
        });
      });
    }
    
    console.log('');
    console.log('='.repeat(70));
    if (!duplicatesFound && !ratingInconsistencies && !gapViolations) {
      console.log('🎉 All checks passed! No duplicates or violations found.');
    } else {
      console.log('❌ Issues found - see errors above');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDuplicatePrevention();
