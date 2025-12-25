/**
 * Test that UI shows re-rate button only on final session of low-confidence topics
 * This simulates the BlockDetailModal logic
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

// Simulate the BlockDetailModal logic
function shouldShowReRateButton(block) {
  try {
    const rationale = block.ai_rationale ? JSON.parse(block.ai_rationale) : null;
    
    const rating = rationale?.rating || null;
    const sessionNumber = rationale?.sessionNumber || null;
    const sessionTotal = rationale?.sessionTotal || null;
    
    // Check if this is a low-confidence topic (1-3)
    const isLowConfidenceTopic = rating !== null && rating <= 3;
    
    // Check if this is the final session
    const isFinalSession = sessionNumber !== null && 
      sessionTotal !== null && 
      sessionNumber === sessionTotal;
    
    return {
      shouldShow: isLowConfidenceTopic && isFinalSession,
      isLowConfidenceTopic,
      isFinalSession,
      rating,
      sessionNumber,
      sessionTotal
    };
  } catch {
    return {
      shouldShow: false,
      isLowConfidenceTopic: false,
      isFinalSession: false,
      rating: null,
      sessionNumber: null,
      sessionTotal: null
    };
  }
}

async function testUILogic() {
  console.log('🧪 Testing UI Re-rate Button Logic\n');
  console.log('='.repeat(60));
  
  let allTestsPassed = true;
  const userId = await getDevUserId();
  
  if (!userId) {
    console.log('❌ Could not find dev user');
    return;
  }
  
  console.log(`✅ Found dev user: ${userId.substring(0, 8)}...`);
  
  // Get all blocks with their rationale
  const { data: blocks, error } = await supabase
    .from('blocks')
    .select('id, topic_id, ai_rationale, status')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .limit(50);
  
  if (error) {
    console.log('❌ Failed to fetch blocks:', error);
    return;
  }
  
  console.log(`\n📋 Analyzing ${blocks?.length || 0} scheduled blocks...\n`);
  
  // Categorize blocks
  const categories = {
    lowConfFinal: [],      // Should show re-rate button
    lowConfNotFinal: [],   // Should NOT show (not final session)
    highConf: [],          // Should NOT show (high confidence)
    noRationale: []        // Should NOT show (no data)
  };
  
  (blocks || []).forEach(block => {
    const result = shouldShowReRateButton(block);
    
    if (!result.rating) {
      categories.noRationale.push({ block, result });
    } else if (result.rating > 3) {
      categories.highConf.push({ block, result });
    } else if (result.isFinalSession) {
      categories.lowConfFinal.push({ block, result });
    } else {
      categories.lowConfNotFinal.push({ block, result });
    }
  });
  
  // Report findings
  console.log('📊 Block Categories:');
  console.log('='.repeat(40));
  
  console.log(`\n✅ LOW CONFIDENCE + FINAL SESSION (should show re-rate): ${categories.lowConfFinal.length}`);
  categories.lowConfFinal.slice(0, 3).forEach(({ block, result }) => {
    console.log(`   - Block ${block.id.substring(0, 8)}...`);
    console.log(`     Rating: ${result.rating}, Session: ${result.sessionNumber}/${result.sessionTotal}`);
    console.log(`     ✅ Re-rate button: SHOWN`);
  });
  
  console.log(`\n⚠️  LOW CONFIDENCE + NOT FINAL (should NOT show re-rate): ${categories.lowConfNotFinal.length}`);
  categories.lowConfNotFinal.slice(0, 3).forEach(({ block, result }) => {
    console.log(`   - Block ${block.id.substring(0, 8)}...`);
    console.log(`     Rating: ${result.rating}, Session: ${result.sessionNumber}/${result.sessionTotal}`);
    console.log(`     ❌ Re-rate button: HIDDEN (not final session)`);
  });
  
  console.log(`\n🎯 HIGH CONFIDENCE (should NOT show re-rate): ${categories.highConf.length}`);
  categories.highConf.slice(0, 3).forEach(({ block, result }) => {
    console.log(`   - Block ${block.id.substring(0, 8)}...`);
    console.log(`     Rating: ${result.rating}, Session: ${result.sessionNumber}/${result.sessionTotal}`);
    console.log(`     ❌ Re-rate button: HIDDEN (high confidence topic)`);
  });
  
  if (categories.noRationale.length > 0) {
    console.log(`\n❓ NO RATIONALE DATA: ${categories.noRationale.length}`);
  }
  
  // Test specific scenarios
  console.log('\n\n📋 Testing Specific Scenarios:');
  console.log('='.repeat(40));
  
  // Scenario 1: Rating 1, Session 1/3 - should NOT show
  const scenario1 = { ai_rationale: JSON.stringify({ rating: 1, sessionNumber: 1, sessionTotal: 3 }) };
  const result1 = shouldShowReRateButton(scenario1);
  if (!result1.shouldShow) {
    console.log('✅ Scenario 1: Rating 1, Session 1/3 → Re-rate HIDDEN (correct)');
  } else {
    console.log('❌ Scenario 1: Rating 1, Session 1/3 → Should be hidden!');
    allTestsPassed = false;
  }
  
  // Scenario 2: Rating 1, Session 3/3 - should SHOW
  const scenario2 = { ai_rationale: JSON.stringify({ rating: 1, sessionNumber: 3, sessionTotal: 3 }) };
  const result2 = shouldShowReRateButton(scenario2);
  if (result2.shouldShow) {
    console.log('✅ Scenario 2: Rating 1, Session 3/3 → Re-rate SHOWN (correct)');
  } else {
    console.log('❌ Scenario 2: Rating 1, Session 3/3 → Should be shown!');
    allTestsPassed = false;
  }
  
  // Scenario 3: Rating 2, Session 2/2 - should SHOW
  const scenario3 = { ai_rationale: JSON.stringify({ rating: 2, sessionNumber: 2, sessionTotal: 2 }) };
  const result3 = shouldShowReRateButton(scenario3);
  if (result3.shouldShow) {
    console.log('✅ Scenario 3: Rating 2, Session 2/2 → Re-rate SHOWN (correct)');
  } else {
    console.log('❌ Scenario 3: Rating 2, Session 2/2 → Should be shown!');
    allTestsPassed = false;
  }
  
  // Scenario 4: Rating 3, Session 1/1 - should SHOW
  const scenario4 = { ai_rationale: JSON.stringify({ rating: 3, sessionNumber: 1, sessionTotal: 1 }) };
  const result4 = shouldShowReRateButton(scenario4);
  if (result4.shouldShow) {
    console.log('✅ Scenario 4: Rating 3, Session 1/1 → Re-rate SHOWN (correct)');
  } else {
    console.log('❌ Scenario 4: Rating 3, Session 1/1 → Should be shown!');
    allTestsPassed = false;
  }
  
  // Scenario 5: Rating 4, Session 1/1 - should NOT show (high confidence)
  const scenario5 = { ai_rationale: JSON.stringify({ rating: 4, sessionNumber: 1, sessionTotal: 1 }) };
  const result5 = shouldShowReRateButton(scenario5);
  if (!result5.shouldShow) {
    console.log('✅ Scenario 5: Rating 4, Session 1/1 → Re-rate HIDDEN (correct - high confidence)');
  } else {
    console.log('❌ Scenario 5: Rating 4, Session 1/1 → Should be hidden!');
    allTestsPassed = false;
  }
  
  // Scenario 6: Rating 5, Session 1/1 - should NOT show (high confidence)
  const scenario6 = { ai_rationale: JSON.stringify({ rating: 5, sessionNumber: 1, sessionTotal: 1 }) };
  const result6 = shouldShowReRateButton(scenario6);
  if (!result6.shouldShow) {
    console.log('✅ Scenario 6: Rating 5, Session 1/1 → Re-rate HIDDEN (correct - high confidence)');
  } else {
    console.log('❌ Scenario 6: Rating 5, Session 1/1 → Should be hidden!');
    allTestsPassed = false;
  }
  
  // Scenario 7: No rationale - should NOT show
  const scenario7 = { ai_rationale: null };
  const result7 = shouldShowReRateButton(scenario7);
  if (!result7.shouldShow) {
    console.log('✅ Scenario 7: No rationale → Re-rate HIDDEN (correct)');
  } else {
    console.log('❌ Scenario 7: No rationale → Should be hidden!');
    allTestsPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ All UI logic tests passed!');
    console.log('\nThe re-rate button correctly shows ONLY for:');
    console.log('  - Low confidence topics (rating 1-3)');
    console.log('  - On the final session of their spaced repetition cycle');
  } else {
    console.log('❌ Some tests failed. See above for details.');
  }
  console.log('='.repeat(60));
}

testUILogic().catch(console.error);

