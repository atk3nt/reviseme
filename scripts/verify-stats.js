/**
 * Quick verification script to check current stats
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyStats() {
  const { data: users } = await supabase.from('users').select('id, email').limit(1);
  if (!users?.[0]) {
    console.log('No users found');
    return;
  }

  const userId = users[0].id;
  console.log(`\n📊 Stats for: ${users[0].email}\n`);

  // Get from view
  const { data: viewStats } = await supabase
    .from('user_stats')
    .select('avg_confidence')
    .eq('user_id', userId)
    .single();

  // Get direct calculation
  const { data: ratings } = await supabase
    .from('user_topic_confidence')
    .select('rating')
    .eq('user_id', userId)
    .gte('rating', 1)
    .lte('rating', 5);

  const directAvg = ratings?.length > 0
    ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
    : 0;

  console.log(`View avg_confidence: ${viewStats?.avg_confidence?.toFixed(2) || 'NULL'}`);
  console.log(`Direct calculation: ${directAvg.toFixed(2)}`);
  console.log(`Positive ratings: ${ratings?.length || 0}\n`);

  if (Math.abs((viewStats?.avg_confidence || 0) - directAvg) < 0.01) {
    console.log('✅ View is correct!\n');
  } else {
    console.log('⚠️  View mismatch - migration may need to be re-run\n');
  }
}

verifyStats();

