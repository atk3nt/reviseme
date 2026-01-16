/**
 * Test the week overflow logic:
 * - Week 1: Allow rating 1 topics to overflow into future weeks
 * - Week 2+: Only schedule rating 1 topics if all sessions fit in the week
 * 
 * Run with: node scripts/test-week-overflow-logic.js
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

function getCurrentWeekMonday() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getNextWeekMonday() {
  const currentMonday = getCurrentWeekMonday();
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return nextMonday;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function testWeekOverflowLogic() {
  console.log('🧪 Week Overflow Logic Test');
  console.log('='.repeat(70));
  console.log('');
  
  try {
    // Get dev user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, onboarding_data')
      .eq('email', DEV_USER_EMAIL)
      .maybeSingle();

    if (userError || !user) {
      console.error('❌ Dev user not found');
      process.exit(1);
    }

    console.log('✅ Found dev user:', user.id);
    
    const onboardingData = user.onboarding_data || {};
    const subjects = onboardingData.subjects || [];
    
    if (subjects.length === 0) {
      console.error('❌ No subjects configured for dev user');
      console.log('   Please complete onboarding first');
      process.exit(1);
    }
    
    console.log('   Subjects:', subjects);
    console.log('');
    
    // TEST 1: Generate Week 1 (should allow overflow)
    console.log('📅 TEST 1: Week 1 Generation (should allow overflow)');
    console.log('-'.repeat(70));
    
    const week1Monday = getCurrentWeekMonday();
    const week1Start = formatDate(week1Monday);
    
    console.log('   Generating plan for week:', week1Start);
    
    const week1Result = await apiCall('/api/plan/generate', 'POST', {
      subjects: subjects,
      targetWeek: week1Start,
      studyBlockDuration: 0.5
    });
    
    if (week1Result.status !== 200 || !week1Result.data?.success) {
      console.error('❌ Failed to generate week 1 plan:', week1Result.data?.error || 'Unknown error');
      process.exit(1);
    }
    
    const week1Blocks = week1Result.data.blocks || [];
    console.log(`✅ Generated ${week1Blocks.length} blocks for week 1`);
    
    // Check for rating 1 topics that might overflow
    const rating1Topics = {};
    week1Blocks.forEach(block => {
      if (block.rating === 1) {
        if (!rating1Topics[block.topic_id]) {
          rating1Topics[block.topic_id] = [];
        }
        rating1Topics[block.topic_id].push(block);
      }
    });
    
    const rating1Count = Object.keys(rating1Topics).length;
    console.log(`   Found ${rating1Count} rating 1 topics`);
    
    // Check if any rating 1 topics started on weekend (VIOLATION)
    let hasWeekendStarters = false;
    let hasLateStarters = false;
    Object.entries(rating1Topics).forEach(([topicId, blocks]) => {
      blocks.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      const firstBlock = blocks[0];
      const firstDate = new Date(firstBlock.scheduled_at);
      const dayOfWeek = firstDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
      
      // Check for weekend starts (VIOLATION)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        hasWeekendStarters = true;
        console.log(`   ❌ VIOLATION: Topic "${firstBlock.topic_name?.substring(0, 40)}" started on ${dayName} (weekend not allowed)`);
      } else if (dayOfWeek >= 4) { // Thursday or later (allowed but will overflow)
        hasLateStarters = true;
        console.log(`   ✅ Topic "${firstBlock.topic_name?.substring(0, 40)}" started on ${dayName} (will overflow into week 2)`);
      }
    });
    
    if (hasWeekendStarters) {
      console.log('   ❌ Some rating 1 topics started on weekend - this is NOT allowed');
    } else if (rating1Count > 0 && !hasLateStarters) {
      console.log('   ℹ️  All rating 1 topics started Mon-Wed (fit in week 1)');
    } else if (rating1Count === 0) {
      console.log('   ℹ️  No rating 1 topics scheduled');
    }
    
    console.log('');
    
    // TEST 2: Generate Week 2 (should restrict overflow)
    console.log('📅 TEST 2: Week 2 Generation (should restrict overflow)');
    console.log('-'.repeat(70));
    
    const week2Monday = getNextWeekMonday();
    const week2Start = formatDate(week2Monday);
    
    console.log('   Generating plan for week:', week2Start);
    
    const week2Result = await apiCall('/api/plan/generate', 'POST', {
      subjects: subjects,
      targetWeek: week2Start,
      studyBlockDuration: 0.5
    });
    
    if (week2Result.status !== 200 || !week2Result.data?.success) {
      console.error('❌ Failed to generate week 2 plan:', week2Result.data?.error || 'Unknown error');
      process.exit(1);
    }
    
    const week2Blocks = week2Result.data.blocks || [];
    console.log(`✅ Generated ${week2Blocks.length} blocks for week 2`);
    
    // Check for NEW rating 1 topics in week 2
    const week2Rating1Topics = {};
    week2Blocks.forEach(block => {
      if (block.rating === 1 && block.session_number === 1) {
        // This is a NEW rating 1 topic (session 1)
        if (!week2Rating1Topics[block.topic_id]) {
          week2Rating1Topics[block.topic_id] = [];
        }
        week2Rating1Topics[block.topic_id].push(block);
      }
    });
    
    const newRating1Count = Object.keys(week2Rating1Topics).length;
    console.log(`   Found ${newRating1Count} NEW rating 1 topics (session 1)`);
    
    // All NEW rating 1 topics should start early enough to fit in the week
    let hasWeek2LateStarters = false;
    Object.entries(week2Rating1Topics).forEach(([topicId, blocks]) => {
      const firstBlock = blocks[0];
      const firstDate = new Date(firstBlock.scheduled_at);
      const dayOfWeek = firstDate.getDay();
      
      if (dayOfWeek >= 4) { // Thursday or later
        hasWeek2LateStarters = true;
        console.log(`   ❌ VIOLATION: Topic "${firstBlock.topic_name?.substring(0, 40)}" started on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]} (would overflow)`);
      }
    });
    
    if (newRating1Count > 0 && !hasWeek2LateStarters) {
      console.log('   ✅ All NEW rating 1 topics start early enough to fit in week 2');
    } else if (newRating1Count === 0) {
      console.log('   ℹ️  No new rating 1 topics scheduled in week 2');
    }
    
    console.log('');
    console.log('='.repeat(70));
    
    if (hasWeekendStarters) {
      console.log('❌ Test FAILED: Week 1 allowed rating 1 topics to start on weekend');
      process.exit(1);
    } else if (hasWeek2LateStarters) {
      console.log('❌ Test FAILED: Week 2 allowed rating 1 topics to overflow');
      process.exit(1);
    } else {
      console.log('🎉 Test PASSED: Week overflow logic working correctly');
      console.log('   - Week 1: Rating 1 topics can start Mon-Fri (not Sat/Sun)');
      console.log('   - Week 1: Topics starting Thu-Fri can overflow into week 2');
      console.log('   - Week 2: Only schedules rating 1 topics that fit in the week');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testWeekOverflowLogic();
