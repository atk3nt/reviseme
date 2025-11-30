/**
 * Test script to verify the save-rating API route works
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL 
  ? `http://localhost:3000` 
  : 'http://localhost:3000';

async function testSaveRating() {
  console.log('🧪 Testing save-rating API route\n');

  // Test data
  const testTopicId = 'b25364dc-5cf7-4e2f-a67e-6ad5f80be899'; // From console logs
  const testRating = 5;

  try {
    console.log(`📝 Attempting to save rating: topic ${testTopicId} = ${testRating}`);
    
    const response = await fetch(`${API_URL}/api/topics/save-rating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicId: testTopicId,
        rating: testRating
      })
    });

    console.log(`📊 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error response:', errorData);
      return;
    }

    const data = await response.json();
    console.log('✅ Success response:', data);

    // Verify it was saved
    console.log('\n📊 Verifying rating was saved...');
    const verifyResponse = await fetch(`${API_URL}/api/topics/get-ratings`);
    
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const savedRating = verifyData.ratings?.find(r => r.topic_id === testTopicId);
      
      if (savedRating && savedRating.rating === testRating) {
        console.log('✅ Verification passed: Rating was saved correctly');
        console.log('   Saved rating:', savedRating);
      } else {
        console.log('⚠️ Verification failed: Rating not found or incorrect');
        console.log('   Expected:', { topic_id: testTopicId, rating: testRating });
        console.log('   Found:', savedRating);
      }
    } else {
      console.error('❌ Failed to verify rating:', verifyResponse.statusText);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

console.log('⚠️  Note: This test requires the Next.js dev server to be running');
console.log('   Run: npm run dev\n');

testSaveRating();

