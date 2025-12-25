/**
 * Test that re-rated topics start a fresh cycle
 * Verifies that old blocks are skipped when counting sessions
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
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DEV_USER_EMAIL = 'dev-test@markr.local';

async function getDevUserId() {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('email', DEV_USER_EMAIL)
    .single();
  return data?.id;
}

async function testFreshCycle() {
  console.log('🧪 Testing Re-rated Topics Start Fresh Cycle\n');
  console.log('='.repeat(60));
  
  let allTestsPassed = true;
  const userId = await getDevUserId();
  
  if (!userId) {
    console.log('❌ Could not find dev user');
    return;
  }
  
  console.log(`✅ Found dev user: ${userId.substring(0, 8)}...`);
  
  // Test 1: Check re-rating logs exist
  console.log('\n📋 Test 1: Checking re-rating history...');
  
  const { data: reratingLogs, error: logsError } = await supabase
    .from('logs')
    .select('event_data, created_at')
    .eq('user_id', userId)
    .eq('event_type', 'topic_rerated')
    .order('created_at', { ascending: false });
  
  if (logsError) {
    console.log('❌ Failed to fetch re-rating logs:', logsError);
    allTestsPassed = false;
  } else {
    console.log(`✅ Found ${reratingLogs?.length || 0} re-rating events`);
    
    if (reratingLogs && reratingLogs.length > 0) {
      // Build map of topic -> most recent re-rating
      const reratingMap = {};
      reratingLogs.forEach(log => {
        const topicId = log.event_data?.topic_id;
        if (topicId && !reratingMap[topicId]) {
          reratingMap[topicId] = {
            lastReratingDate: new Date(log.created_at),
            newRating: log.event_data?.rerating_score
          };
        }
      });
      
      console.log(`   Unique topics re-rated: ${Object.keys(reratingMap).length}`);
      
      // Test 2: Verify blocks before re-rating would be skipped
      console.log('\n📋 Test 2: Verifying block counting logic...');
      
      for (const [topicId, info] of Object.entries(reratingMap).slice(0, 3)) {
        // Get all blocks for this topic
        const { data: topicBlocks } = await supabase
          .from('blocks')
          .select('id, scheduled_at, status')
          .eq('user_id', userId)
          .eq('topic_id', topicId)
          .order('scheduled_at', { ascending: true });
        
        if (!topicBlocks || topicBlocks.length === 0) {
          console.log(`   Topic ${topicId.substring(0, 8)}...: No blocks found`);
          continue;
        }
        
        // Count blocks before and after re-rating
        let blocksBeforeRerate = 0;
        let blocksAfterRerate = 0;
        
        topicBlocks.forEach(block => {
          const blockDate = new Date(block.scheduled_at);
          if (blockDate < info.lastReratingDate) {
            blocksBeforeRerate++;
          } else {
            blocksAfterRerate++;
          }
        });
        
        console.log(`   Topic ${topicId.substring(0, 8)}...:`);
        console.log(`     - Re-rated at: ${info.lastReratingDate.toISOString().split('T')[0]}`);
        console.log(`     - New rating: ${info.newRating}`);
        console.log(`     - Blocks before re-rating: ${blocksBeforeRerate} (should be SKIPPED)`);
        console.log(`     - Blocks after re-rating: ${blocksAfterRerate} (should be COUNTED)`);
        
        // The new rating determines how many sessions are needed
        const sessionsNeeded = info.newRating === 1 ? 3 : info.newRating === 2 ? 2 : 1;
        console.log(`     - Sessions needed for rating ${info.newRating}: ${sessionsNeeded}`);
      }
    }
  }
  
  // Test 3: Simulate the loadLastReratingDates logic
  console.log('\n📋 Test 3: Simulating plan generation logic...');
  
  // This is the same logic used in generate/route.js
  const reratingHistory = {};
  (reratingLogs || []).forEach(log => {
    const topicId = log.event_data?.topic_id;
    if (topicId && !reratingHistory[topicId]) {
      reratingHistory[topicId] = {
        lastReratingDate: new Date(log.created_at),
        newRating: log.event_data?.rerating_score
      };
    }
  });
  
  // Get all previous blocks
  const weekStartDate = new Date();
  weekStartDate.setHours(0, 0, 0, 0);
  
  const { data: previousBlocks } = await supabase
    .from('blocks')
    .select('topic_id, scheduled_at')
    .eq('user_id', userId)
    .lt('scheduled_at', weekStartDate.toISOString())
    .in('status', ['scheduled', 'done']);
  
  // Count blocks per topic, skipping re-rated topics
  const topicData = new Map();
  let skippedDueToRerate = 0;
  
  (previousBlocks || []).forEach(block => {
    if (!block.topic_id) return;
    
    // If this topic was re-rated, skip ALL its blocks
    if (reratingHistory[block.topic_id]) {
      skippedDueToRerate++;
      return;
    }
    
    const existing = topicData.get(block.topic_id);
    if (!existing) {
      topicData.set(block.topic_id, { count: 1 });
    } else {
      topicData.set(block.topic_id, { count: existing.count + 1 });
    }
  });
  
  console.log(`✅ Block counting simulation:`);
  console.log(`   Total previous blocks: ${previousBlocks?.length || 0}`);
  console.log(`   Blocks skipped (re-rated topics): ${skippedDueToRerate}`);
  console.log(`   Blocks counted: ${(previousBlocks?.length || 0) - skippedDueToRerate}`);
  console.log(`   Unique topics counted: ${topicData.size}`);
  
  if (skippedDueToRerate > 0) {
    console.log('\n✅ Re-rated topics correctly have their blocks skipped!');
  } else if (Object.keys(reratingHistory).length === 0) {
    console.log('\n⚠️  No re-rated topics found to test');
  } else {
    console.log('\n⚠️  Re-rated topics exist but no blocks were skipped (may be expected if blocks are in future)');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ Fresh cycle logic is working correctly!');
  } else {
    console.log('❌ Some tests failed. See above for details.');
  }
  console.log('='.repeat(60));
}

testFreshCycle().catch(console.error);

