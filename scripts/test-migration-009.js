/**
 * Test script to verify migration 009 is working correctly
 * 
 * This script queries the user_stats view and compares it with direct calculations
 * to verify that negative ratings are excluded from avg_confidence
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testMigration() {
  try {
    console.log('🧪 Testing Migration 009: user_stats view\n');

    // Get a test user (or use dev mode user)
    const isDev = process.env.NODE_ENV === 'development';
    let userId = null;

    if (isDev) {
      // Try to find dev user
      const { data: devUsers } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', 'dev-test@markr.local')
        .limit(1);

      if (devUsers && devUsers.length > 0) {
        userId = devUsers[0].id;
        console.log(`📋 Using dev user: ${devUsers[0].email} (${userId})\n`);
      } else {
        // Get any user
        const { data: anyUser } = await supabase
          .from('users')
          .select('id, email')
          .limit(1);

        if (anyUser && anyUser.length > 0) {
          userId = anyUser[0].id;
          console.log(`📋 Using user: ${anyUser[0].email} (${userId})\n`);
        }
      }
    }

    if (!userId) {
      console.log('⚠️  No user found. Testing with first available user...\n');
      const { data: users } = await supabase
        .from('users')
        .select('id, email')
        .limit(1);

      if (!users || users.length === 0) {
        console.error('❌ No users found in database');
        process.exit(1);
      }

      userId = users[0].id;
      console.log(`📋 Using user: ${users[0].email} (${userId})\n`);
    }

    // Test 1: Get all ratings for this user (including negatives)
    console.log('📊 Test 1: Fetching all ratings (including negatives)...');
    const { data: allRatings, error: ratingsError } = await supabase
      .from('user_topic_confidence')
      .select('rating')
      .eq('user_id', userId);

    if (ratingsError) {
      throw ratingsError;
    }

    if (!allRatings || allRatings.length === 0) {
      console.log('⚠️  No ratings found for this user');
      console.log('   This is expected if the user hasn\'t completed onboarding yet.\n');
      return;
    }

    const allRatingsList = allRatings.map(r => r.rating);
    const positiveRatings = allRatingsList.filter(r => r >= 1 && r <= 5);
    const negativeRatings = allRatingsList.filter(r => r < 1 || r > 5);

    console.log(`   Total ratings: ${allRatingsList.length}`);
    console.log(`   Positive ratings (1-5): ${positiveRatings.length}`);
    console.log(`   Negative ratings (0, -1, -2): ${negativeRatings.length}`);

    // Calculate averages
    const avgAll = allRatingsList.reduce((sum, r) => sum + r, 0) / allRatingsList.length;
    const avgPositive = positiveRatings.length > 0 
      ? positiveRatings.reduce((sum, r) => sum + r, 0) / positiveRatings.length 
      : 0;

    console.log(`   Average (all ratings): ${avgAll.toFixed(2)}`);
    console.log(`   Average (positive only): ${avgPositive.toFixed(2)}\n`);

    // Test 2: Query the user_stats view
    console.log('📊 Test 2: Querying user_stats view...');
    const { data: statsView, error: viewError } = await supabase
      .from('user_stats')
      .select('avg_confidence')
      .eq('user_id', userId)
      .single();

    if (viewError) {
      throw viewError;
    }

    const viewAvgConfidence = statsView?.avg_confidence;

    console.log(`   avg_confidence from view: ${viewAvgConfidence !== null ? viewAvgConfidence.toFixed(2) : 'NULL'}\n`);

    // Test 3: Compare results
    console.log('📊 Test 3: Comparing results...\n');

    if (viewAvgConfidence === null) {
      console.log('⚠️  View returned NULL - this might mean:');
      console.log('   - User has no positive ratings (only 0, -1, -2)');
      console.log('   - View calculation is working (correctly excluding negatives)\n');
    } else {
      const difference = Math.abs(viewAvgConfidence - avgPositive);
      const isMatch = difference < 0.01; // Allow small floating point differences

      if (isMatch) {
        console.log('✅ SUCCESS: View avg_confidence matches positive-only average!');
        console.log(`   View: ${viewAvgConfidence.toFixed(2)}`);
        console.log(`   Calculated: ${avgPositive.toFixed(2)}`);
        console.log(`   Difference: ${difference.toFixed(4)}\n`);
      } else {
        console.log('❌ MISMATCH: View avg_confidence does NOT match positive-only average');
        console.log(`   View: ${viewAvgConfidence.toFixed(2)}`);
        console.log(`   Calculated (positive only): ${avgPositive.toFixed(2)}`);
        console.log(`   Calculated (all ratings): ${avgAll.toFixed(2)}`);
        console.log(`   Difference: ${difference.toFixed(4)}\n`);
        
        if (Math.abs(viewAvgConfidence - avgAll) < 0.01) {
          console.log('⚠️  View appears to be using ALL ratings (including negatives)');
          console.log('   Migration may not have been applied correctly.\n');
        }
      }
    }

    // Test 4: Show rating distribution
    console.log('📊 Test 4: Rating distribution:');
    const ratingCounts = {};
    allRatingsList.forEach(r => {
      ratingCounts[r] = (ratingCounts[r] || 0) + 1;
    });
    
    Object.keys(ratingCounts)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(rating => {
        const count = ratingCounts[rating];
        const isPositive = parseInt(rating) >= 1 && parseInt(rating) <= 5;
        const marker = isPositive ? '✓' : '✗';
        console.log(`   ${marker} Rating ${rating}: ${count} topics`);
      });

    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testMigration();


