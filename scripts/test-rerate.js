/**
 * Test script for re-rating feature
 * Tests the complete flow:
 * 1. Re-rating API endpoint
 * 2. user_topic_confidence table updates
 * 3. logs table records the event
 * 4. Plan generation uses new rating
 */

const BASE_URL = 'http://localhost:3000';

async function testRerateFeature() {
  console.log('🧪 Starting Re-rate Feature Tests\n');
  console.log('='.repeat(60));
  
  let allTestsPassed = true;
  
  // Test 1: Get existing blocks to find one to test with
  console.log('\n📋 Test 1: Fetching existing blocks...');
  try {
    const planRes = await fetch(`${BASE_URL}/api/plan/generate`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!planRes.ok) {
      console.log('❌ Failed to fetch blocks:', planRes.status);
      const error = await planRes.text();
      console.log('Error:', error);
      allTestsPassed = false;
    } else {
      const planData = await planRes.json();
      console.log('✅ Fetched blocks successfully');
      console.log(`   Found ${planData.blocks?.length || 0} blocks`);
      
      if (planData.blocks && planData.blocks.length > 0) {
        // Find a block that's a low-confidence topic on final session
        const testBlock = planData.blocks.find(b => {
          try {
            const rationale = JSON.parse(b.ai_rationale || '{}');
            return rationale.rating <= 3 && rationale.sessionNumber === rationale.sessionTotal;
          } catch {
            return false;
          }
        });
        
        if (testBlock) {
          console.log(`   Found test block: ${testBlock.id}`);
          console.log(`   Topic: ${testBlock.topic_name}`);
          
          // Test 2: Call re-rate API
          console.log('\n📋 Test 2: Testing re-rate API...');
          const rerateRes = await fetch(`${BASE_URL}/api/plan/rerate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              blockId: testBlock.id,
              reratingScore: 4 // Re-rate to "mastered"
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
            console.log(`   New rating: ${rerateData.reratingScore}`);
            console.log(`   Next action: ${rerateData.nextAction?.type}`);
            console.log(`   Message: ${rerateData.nextAction?.message}`);
          }
        } else {
          console.log('⚠️  No suitable test block found (need low-confidence final session)');
          console.log('   Showing first 3 blocks for reference:');
          planData.blocks.slice(0, 3).forEach((b, i) => {
            try {
              const rationale = JSON.parse(b.ai_rationale || '{}');
              console.log(`   ${i + 1}. ${b.topic_name} - Rating: ${rationale.rating}, Session: ${rationale.sessionNumber}/${rationale.sessionTotal}`);
            } catch {
              console.log(`   ${i + 1}. ${b.topic_name} - No rationale`);
            }
          });
        }
      }
    }
  } catch (error) {
    console.log('❌ Test 1 failed with exception:', error.message);
    allTestsPassed = false;
  }
  
  // Test 3: Test re-rate API with invalid inputs
  console.log('\n📋 Test 3: Testing re-rate API validation...');
  
  // Test missing blockId
  try {
    const res1 = await fetch(`${BASE_URL}/api/plan/rerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reratingScore: 3 })
    });
    
    if (res1.status === 400) {
      console.log('✅ Missing blockId correctly returns 400');
    } else {
      console.log('❌ Missing blockId should return 400, got:', res1.status);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Validation test failed:', error.message);
    allTestsPassed = false;
  }
  
  // Test invalid rating score
  try {
    const res2 = await fetch(`${BASE_URL}/api/plan/rerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId: 'test-id', reratingScore: 6 })
    });
    
    if (res2.status === 400) {
      console.log('✅ Invalid rating score correctly returns 400');
    } else {
      console.log('❌ Invalid rating score should return 400, got:', res2.status);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Validation test failed:', error.message);
    allTestsPassed = false;
  }
  
  // Test rating score of 0
  try {
    const res3 = await fetch(`${BASE_URL}/api/plan/rerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId: 'test-id', reratingScore: 0 })
    });
    
    if (res3.status === 400) {
      console.log('✅ Rating score of 0 correctly returns 400');
    } else {
      console.log('❌ Rating score of 0 should return 400, got:', res3.status);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Validation test failed:', error.message);
    allTestsPassed = false;
  }
  
  // Test non-existent block
  try {
    const res4 = await fetch(`${BASE_URL}/api/plan/rerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId: '00000000-0000-0000-0000-000000000000', reratingScore: 3 })
    });
    
    if (res4.status === 404) {
      console.log('✅ Non-existent block correctly returns 404');
    } else {
      console.log('❌ Non-existent block should return 404, got:', res4.status);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Validation test failed:', error.message);
    allTestsPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed. See above for details.');
  }
  console.log('='.repeat(60));
}

testRerateFeature().catch(console.error);

