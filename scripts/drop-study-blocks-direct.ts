/**
 * Directly drop study_blocks table using Supabase client
 * 
 * Run: npm run drop-study-blocks-direct
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function dropStudyBlocks() {
  console.log('\n🗑️  Dropping study_blocks table...\n');

  try {
    // First, check if the table exists
    const { data: checkData, error: checkError } = await supabase
      .from('study_blocks')
      .select('id')
      .limit(1);

    if (checkError && checkError.code === 'PGRST116') {
      console.log('✅ study_blocks table does not exist (already removed)');
      return;
    }

    if (checkError) {
      console.error('❌ Error checking table:', checkError.message);
      return;
    }

    // Table exists, we need to drop it
    // Since Supabase JS client doesn't support DROP TABLE directly,
    // we need to use the REST API or SQL Editor
    // Let's use the REST API with a direct SQL call via a function
    
    // Actually, we can't execute DROP TABLE via the JS client easily
    // The best approach is to use the SQL Editor
    
    console.log('⚠️  Cannot drop table directly via JS client.');
    console.log('   Please run this SQL in Supabase SQL Editor:\n');
    console.log('   DROP TABLE IF EXISTS study_blocks CASCADE;\n');
    console.log('   Or visit: https://supabase.com/dashboard > SQL Editor\n');
    
    // Alternative: We could create a stored procedure, but that's more complex
    // For now, manual execution is the simplest approach
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

dropStudyBlocks();

