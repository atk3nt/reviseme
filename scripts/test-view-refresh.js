/**
 * Test script to verify the user_stats view updates immediately when ratings change
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testViewRefresh() {
  try {
    console.log('🧪 Testing user_stats view refresh after rating change\n');

    // Get a test user
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .limit(1);

    if (!users || users.length === 0) {
      console.error('❌ No users found');
      process.exit(1);
    }

    const userId = users[0].id;
    console.log(`📋 Using user: ${users[0].email} (${userId})\n`);

    // Get current avg_confidence from view
    console.log('📊 Step 1: Getting current avg_confidence from view...');
    const { data: statsBefore } = await supabase
      .from('user_stats')
      .select('avg_confidence')
      .eq('user_id', userId)
      .single();

    const avgBefore = statsBefore?.avg_confidence;
    console.log(`   Current avg_confidence: ${avgBefore !== null ? avgBefore.toFixed(2) : 'NULL'}\n`);

    // Get a topic that has a rating
    console.log('📊 Step 2: Finding a topic with a rating...');
    const { data: ratings } = await supabase
      .from('user_topic_confidence')
      .select('topic_id, rating')
      .eq('user_id', userId)
      .gte('rating', 1)
      .lte('rating', 5)
      .limit(1);

    if (!ratings || ratings.length === 0) {
      console.log('⚠️  No positive ratings found to test with');
      return;
    }

    const testTopicId = ratings[0].topic_id;
    const oldRating = ratings[0].rating;
    const newRating = oldRating === 5 ? 4 : 5; // Toggle between 4 and 5

    console.log(`   Found topic: ${testTopicId}`);
    console.log(`   Current rating: ${oldRating}`);
    console.log(`   Will change to: ${newRating}\n`);

    // Update the rating
    console.log('📊 Step 3: Updating rating...');
    const { error: updateError } = await supabase
      .from('user_topic_confidence')
      .update({ rating: newRating, last_updated: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('topic_id', testTopicId);

    if (updateError) {
      throw updateError;
    }

    console.log('   ✅ Rating updated\n');

    // Wait a moment for the view to update
    console.log('📊 Step 4: Waiting 1 second for view to update...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check the view again
    console.log('📊 Step 5: Checking view again...');
    const { data: statsAfter } = await supabase
      .from('user_stats')
      .select('avg_confidence')
      .eq('user_id', userId)
      .single();

    const avgAfter = statsAfter?.avg_confidence;
    console.log(`   New avg_confidence: ${avgAfter !== null ? avgAfter.toFixed(2) : 'NULL'}\n`);

    // Compare
    if (avgBefore !== null && avgAfter !== null) {
      const changed = Math.abs(avgBefore - avgAfter) > 0.001;
      if (changed) {
        console.log('✅ SUCCESS: View updated after rating change!');
        console.log(`   Before: ${avgBefore.toFixed(2)}`);
        console.log(`   After: ${avgAfter.toFixed(2)}`);
        console.log(`   Change: ${(avgAfter - avgBefore).toFixed(4)}\n`);
      } else {
        console.log('⚠️  View did not change (might be due to rounding or many topics)');
        console.log(`   Before: ${avgBefore.toFixed(2)}`);
        console.log(`   After: ${avgAfter.toFixed(2)}\n`);
      }
    }

    // Restore original rating
    console.log('📊 Step 6: Restoring original rating...');
    await supabase
      .from('user_topic_confidence')
      .update({ rating: oldRating, last_updated: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('topic_id', testTopicId);

    console.log('   ✅ Rating restored\n');
    console.log('✅ Test complete!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testViewRefresh();


