/**
 * Clear all blocks for the dev user
 * Run with: node scripts/clear-dev-blocks.js
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

async function clearDevBlocks() {
  try {
    // First, get the dev user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', DEV_USER_EMAIL)
      .single();

    if (userError || !user) {
      console.log('Dev user not found, nothing to clear');
      return;
    }

    const userId = user.id;
    console.log(`Found dev user: ${userId}`);

    // Get count of blocks before deletion
    const { count: beforeCount } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    console.log(`Found ${beforeCount || 0} blocks for dev user`);

    // Delete all blocks for dev user
    const { error: deleteError } = await supabase
      .from('blocks')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting blocks:', deleteError);
      process.exit(1);
    }

    console.log(`✅ Successfully cleared ${beforeCount || 0} blocks for dev user`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearDevBlocks();


