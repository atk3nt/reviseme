/**
 * Integration test for re-rating feature
 * Tests the complete flow including database state verification
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BASE_URL = 'http://localhost:3000';
const DEV_USER_EMAIL = 'dev-test@markr.local';

async function getDevUserId() {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', DEV_USER_EMAIL)
    .single();
  
  if (error) {
    console.error('Failed to get dev user:', error);
    return null;
  }
  return data?.id;
}

async function testRerateIntegration() {
  console.log('🧪 Re-rate Integration Tests\n');
  console.log('='.repeat(60));
  
  let allTestsPassed = true;
  const userId = await getDevUserId();
  
  if (!userId) {
    console.log('❌ Could not find dev user. Run the app first to create it.');
    return;
  }
  
  console.log(`✅ Found dev user: ${userId.substring(0, 8)}...`);
  
  // Test 1: Get a block to re-rate
  console.log('\n📋 Test 1: Finding a block to test with...');
  
  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select('id, topic_id, ai_rationale, status, rerating_score')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .is('rerating_score', null)
    .limit(10);
  
  if (blocksError || !blocks || blocks.length === 0) {
    console.log('❌ No scheduled blocks found to test with');
    console.log('Error:', blocksError);
    return;
  }
  
  // Find a block with low confidence final session
  let testBlock = null;
  for (const block of blocks) {
    try {
      const rationale = JSON.parse(block.ai_rationale || '{}');
      if (rationale.rating && rationale.rating <= 3 && 
          rationale.sessionNumber === rationale.sessionTotal) {
        testBlock = block;
        break;
      }
    } catch {
      // Skip blocks with invalid rationale
    }
  }
  
  if (!testBlock) {
    // Use first available block for testing
    testBlock = blocks[0];
    console.log('⚠️  No low-confidence final session block found, using first available block');
  }
  
  console.log(`✅ Test block: ${testBlock.id}`);
  console.log(`   Topic ID: ${testBlock.topic_id}`);
  
  // Test 2: Check initial state
  console.log('\n📋 Test 2: Checking initial database state...');
  
  const { data: initialConfidence } = await supabase
    .from('user_topic_confidence')
    .select('rating, last_updated')
    .eq('user_id', userId)
    .eq('topic_id', testBlock.topic_id)
    .single();
  
  console.log(`   Initial confidence rating: ${initialConfidence?.rating || 'none'}`);
  
  // Test 3: Call re-rate API
  console.log('\n📋 Test 3: Calling re-rate API...');
  
  const newRating = 2; // Re-rate to "Getting Better"
  
  const rerateRes = await fetch(`${BASE_URL}/api/plan/rerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockId: testBlock.id,
      reratingScore: newRating
    })
  });
  
  if (!rerateRes.ok) {
    console.log('❌ Re-rate API failed:', rerateRes.status);
    const error = await rerateRes.text();
    console.log('Error:', error);
    allTestsPassed = false;
  } else {
    const rerateData = await rerateRes.json();
    console.log('✅ Re-rate API succeeded');
    console.log(`   Response: ${JSON.stringify(rerateData)}`);
  }
  
  // Test 4: Verify block was updated
  console.log('\n📋 Test 4: Verifying block was updated...');
  
  const { data: updatedBlock, error: blockError } = await supabase
    .from('blocks')
    .select('status, rerating_score, completed_at')
    .eq('id', testBlock.id)
    .single();
  
  if (blockError) {
    console.log('❌ Failed to fetch updated block:', blockError);
    allTestsPassed = false;
  } else {
    if (updatedBlock.status === 'done') {
      console.log('✅ Block status updated to "done"');
    } else {
      console.log(`❌ Block status should be "done", got: ${updatedBlock.status}`);
      allTestsPassed = false;
    }
    
    if (updatedBlock.rerating_score === newRating) {
      console.log(`✅ Block rerating_score set to ${newRating}`);
    } else {
      console.log(`❌ Block rerating_score should be ${newRating}, got: ${updatedBlock.rerating_score}`);
      allTestsPassed = false;
    }
    
    if (updatedBlock.completed_at) {
      console.log('✅ Block completed_at timestamp set');
    } else {
      console.log('❌ Block completed_at should be set');
      allTestsPassed = false;
    }
  }
  
  // Test 5: Verify user_topic_confidence was updated
  console.log('\n📋 Test 5: Verifying user_topic_confidence table...');
  
  const { data: newConfidence, error: confError } = await supabase
    .from('user_topic_confidence')
    .select('rating, last_updated')
    .eq('user_id', userId)
    .eq('topic_id', testBlock.topic_id)
    .single();
  
  if (confError) {
    console.log('❌ Failed to fetch confidence:', confError);
    allTestsPassed = false;
  } else {
    if (newConfidence.rating === newRating) {
      console.log(`✅ Confidence rating updated to ${newRating}`);
    } else {
      console.log(`❌ Confidence rating should be ${newRating}, got: ${newConfidence.rating}`);
      allTestsPassed = false;
    }
    
    if (newConfidence.last_updated) {
      console.log('✅ Confidence last_updated timestamp set');
    } else {
      console.log('❌ Confidence last_updated should be set');
      allTestsPassed = false;
    }
  }
  
  // Test 6: Verify log entry was created
  console.log('\n📋 Test 6: Verifying log entry...');
  
  const { data: logs, error: logsError } = await supabase
    .from('logs')
    .select('event_type, event_data, created_at')
    .eq('user_id', userId)
    .eq('event_type', 'topic_rerated')
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (logsError) {
    console.log('❌ Failed to fetch logs:', logsError);
    allTestsPassed = false;
  } else if (!logs || logs.length === 0) {
    console.log('❌ No re-rating log entry found');
    allTestsPassed = false;
  } else {
    const log = logs[0];
    if (log.event_data?.block_id === testBlock.id) {
      console.log('✅ Log entry created with correct block_id');
    } else {
      console.log(`❌ Log block_id mismatch: expected ${testBlock.id}, got ${log.event_data?.block_id}`);
      allTestsPassed = false;
    }
    
    if (log.event_data?.rerating_score === newRating) {
      console.log(`✅ Log entry has correct rerating_score: ${newRating}`);
    } else {
      console.log(`❌ Log rerating_score mismatch: expected ${newRating}, got ${log.event_data?.rerating_score}`);
      allTestsPassed = false;
    }
    
    if (log.event_data?.topic_id === testBlock.topic_id) {
      console.log('✅ Log entry has correct topic_id');
    } else {
      console.log('❌ Log topic_id mismatch');
      allTestsPassed = false;
    }
  }
  
  // Test 7: Verify plan generation recognizes re-rated topic
  console.log('\n📋 Test 7: Verifying plan generation recognizes re-rating...');
  
  // Get next week's start date
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilNextMonday = (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  const nextWeekStart = nextMonday.toISOString().split('T')[0];
  
  console.log(`   Next week start: ${nextWeekStart}`);
  
  // Fetch user's subjects for plan generation
  const { data: userData } = await supabase
    .from('users')
    .select('selected_subjects')
    .eq('id', userId)
    .single();
  
  if (!userData?.selected_subjects) {
    console.log('⚠️  No subjects found for user, skipping plan generation test');
  } else {
    // We can't easily test full plan generation without more setup
    // But we can verify the loadRatingsFromDatabase function would pick up the new rating
    
    const { data: allRatings } = await supabase
      .from('user_topic_confidence')
      .select('topic_id, rating')
      .eq('user_id', userId);
    
    const topicRating = allRatings?.find(r => r.topic_id === testBlock.topic_id);
    
    if (topicRating && topicRating.rating === newRating) {
      console.log('✅ Database has correct rating for plan generation');
      console.log(`   Topic ${testBlock.topic_id.substring(0, 8)}... has rating ${topicRating.rating}`);
    } else {
      console.log('❌ Database rating not found or incorrect');
      allTestsPassed = false;
    }
  }
  
  // Reset block for future tests (optional)
  console.log('\n📋 Cleanup: Resetting test block...');
  
  const { error: resetError } = await supabase
    .from('blocks')
    .update({
      status: 'scheduled',
      rerating_score: null,
      completed_at: null
    })
    .eq('id', testBlock.id);
  
  if (resetError) {
    console.log('⚠️  Failed to reset block:', resetError);
  } else {
    console.log('✅ Test block reset to scheduled status');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ All integration tests passed!');
  } else {
    console.log('❌ Some tests failed. See above for details.');
  }
  console.log('='.repeat(60));
}

testRerateIntegration().catch(console.error);

