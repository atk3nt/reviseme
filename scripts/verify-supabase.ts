/**
 * Supabase Database Verification Script
 * 
 * Checks what tables, columns, and data exist in your Supabase database
 * 
 * Run: npm run verify-supabase
 * or: tsx scripts/verify-supabase.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n🔍 SUPABASE DATABASE VERIFICATION\n');
console.log('='.repeat(60));

// Check environment variables
console.log('\n📋 ENVIRONMENT VARIABLES:');
if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is missing');
  process.exit(1);
} else {
  console.log(`✅ Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing');
  process.exit(1);
} else {
  console.log(`✅ Service Role Key: ${supabaseServiceKey.substring(0, 20)}...`);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Key tables to check
const keyTables = [
  'users',
  'specs',
  'topics',
  'blocks',
  'study_blocks', // Check if this duplicate exists
  'topic_ratings',
  'user_topic_confidence',
  'accounts',
  'sessions',
  'verification_tokens',
  'payments',
  'logs',
  'user_insights',
  'user_availability',
  'user_exam_dates'
];

async function verifySupabase() {
  try {
    // Test connection
    console.log('\n🔌 CONNECTION TEST:');
    const { data: healthCheck, error: healthError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (healthError && healthError.code !== 'PGRST116') { // PGRST116 = table doesn't exist (ok)
      console.error(`❌ Connection failed: ${healthError.message}`);
      return;
    }
    console.log('✅ Connected to Supabase\n');

    // Check which tables exist
    console.log('📊 TABLE EXISTENCE CHECK:');
    console.log('-'.repeat(60));
    
    const tableResults = await Promise.all(
      keyTables.map(async (tableName) => {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        const exists = !error || error.code !== 'PGRST116';
        const status = exists ? '✅' : '❌';
        const count = exists ? await getTableCount(tableName) : 0;
        
        return { tableName, exists, count, status };
      })
    );

    tableResults.forEach(({ tableName, exists, count, status }) => {
      console.log(`${status} ${tableName.padEnd(25)} ${exists ? `(${count} rows)` : '(does not exist)'}`);
    });

    // Check schema for key tables
    console.log('\n📋 SCHEMA CHECK (Key Tables):');
    console.log('-'.repeat(60));

    // Check users table columns
    await checkTableSchema('users', [
      'id', 'email', 'name', 'image', 
      'onboarding_data', 'has_access', 'customer_id', 'price_id', 
      'has_completed_onboarding', 'email_verified'
    ]);

    // Check specs table columns
    await checkTableSchema('specs', [
      'id', 'subject', 'exam_board', 'board', 'name', 'slug'
    ]);

    // Check topics table columns
    await checkTableSchema('topics', [
      'id', 'spec_id', 'name', 'title', 'level', 
      'parent_id', 'parent_title', 'order_index', 
      'subject', 'board', 'exam_board', // Check for old flat columns
      'level_1', 'level_2', 'level_3', 'est_minutes', 'duration_minutes'
    ]);

    // Check blocks table columns
    await checkTableSchema('blocks', [
      'id', 'user_id', 'topic_id', 'scheduled_at', 
      'duration_minutes', 'status', 'ai_rationale', 
      'created_at', 'completed_at'
    ]);

    // Check study_blocks if it exists
    await checkTableSchema('study_blocks', [
      'id', 'user_id', 'topic_id', 'scheduled_date', 
      'time_slot', 'duration_minutes', 'status', 
      'created_at', 'updated_at'
    ]);

    // Check for schema conflicts
    console.log('\n⚠️  SCHEMA CONFLICTS CHECK:');
    console.log('-'.repeat(60));
    await checkSchemaConflicts();

    // Sample data check
    console.log('\n📦 SAMPLE DATA CHECK:');
    console.log('-'.repeat(60));
    await checkSampleData();

    // RLS Status check
    console.log('\n🔒 ROW LEVEL SECURITY (RLS) STATUS:');
    console.log('-'.repeat(60));
    await checkRLSStatus();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Verification complete!\n');

  } catch (error) {
    console.error('\n❌ Error during verification:', error);
  }
}

async function getTableCount(tableName: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

async function checkTableSchema(tableName: string, columnsToCheck: string[]) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);
  
  if (error && error.code === 'PGRST116') {
    console.log(`\n❌ ${tableName}: Table does not exist`);
    return;
  }

  if (error) {
    console.log(`\n⚠️  ${tableName}: Error checking schema - ${error.message}`);
    return;
  }

  // Get actual columns by checking if we can query them
  const existingColumns: string[] = [];
  const missingColumns: string[] = [];
  
  // Try to query each column
  for (const col of columnsToCheck) {
    try {
      const { error: colError } = await supabase
        .from(tableName)
        .select(col)
        .limit(1);
      
      if (!colError) {
        existingColumns.push(col);
      } else {
        missingColumns.push(col);
      }
    } catch {
      missingColumns.push(col);
    }
  }

  console.log(`\n📋 ${tableName}:`);
  if (existingColumns.length > 0) {
    console.log(`   ✅ Has: ${existingColumns.join(', ')}`);
  }
  if (missingColumns.length > 0) {
    console.log(`   ❌ Missing: ${missingColumns.join(', ')}`);
  }
}

async function checkSchemaConflicts() {
  // Check for name vs title conflict in topics
  const { data: topicsData, error: topicsError } = await supabase
    .from('topics')
    .select('name, title')
    .limit(1);
  
  if (!topicsError && topicsData) {
    const hasName = topicsData.length > 0 && topicsData[0]?.name !== undefined;
    const hasTitle = topicsData.length > 0 && topicsData[0]?.title !== undefined;
    
    if (hasName && hasTitle) {
      console.log('⚠️  topics table has BOTH "name" and "title" columns (should only have "title")');
    } else if (hasName && !hasTitle) {
      console.log('⚠️  topics table has "name" but NOT "title" (migration 005 not run?)');
    } else if (!hasName && hasTitle) {
      console.log('✅ topics table correctly uses "title" column');
    }
  }

  // Check for board vs exam_board conflict in specs
  const { data: specsData, error: specsError } = await supabase
    .from('specs')
    .select('board, exam_board')
    .limit(1);
  
  if (!specsError && specsData) {
    const hasBoard = specsData.length > 0 && specsData[0]?.board !== undefined;
    const hasExamBoard = specsData.length > 0 && specsData[0]?.exam_board !== undefined;
    
    if (hasBoard && hasExamBoard) {
      console.log('⚠️  specs table has BOTH "board" and "exam_board" columns (should only have "exam_board")');
    } else if (hasBoard && !hasExamBoard) {
      console.log('⚠️  specs table has "board" but NOT "exam_board" (migration 005 not run?)');
    } else if (!hasBoard && hasExamBoard) {
      console.log('✅ specs table correctly uses "exam_board" column');
    }
  }

  // Check for flat columns in topics
  const { data: flatCheck, error: flatError } = await supabase
    .from('topics')
    .select('subject, board, level_1, level_2, level_3')
    .limit(1);
  
  if (!flatError && flatCheck && flatCheck.length > 0) {
    const hasFlat = flatCheck[0]?.subject !== undefined || 
                   flatCheck[0]?.board !== undefined ||
                   flatCheck[0]?.level_1 !== undefined;
    
    if (hasFlat) {
      console.log('⚠️  topics table still has flat columns (subject, board, level_1, etc.) - migration 005 should remove these');
    } else {
      console.log('✅ topics table does not have flat columns (correct)');
    }
  }

  // Check for both blocks and study_blocks
  const { data: blocksCheck } = await supabase.from('blocks').select('id').limit(1);
  const { data: studyBlocksCheck } = await supabase.from('study_blocks').select('id').limit(1);
  
  const hasBlocks = blocksCheck !== null;
  const hasStudyBlocks = studyBlocksCheck !== null;
  
  if (hasBlocks && hasStudyBlocks) {
    console.log('⚠️  Both "blocks" and "study_blocks" tables exist (should only use "blocks")');
  } else if (hasBlocks) {
    console.log('✅ Only "blocks" table exists (correct)');
  } else if (hasStudyBlocks) {
    console.log('⚠️  Only "study_blocks" exists (APIs use "blocks", need to fix)');
  }
}

async function checkSampleData() {
  // Check specs data
  const { data: specsData, count: specsCount } = await supabase
    .from('specs')
    .select('*', { count: 'exact' })
    .limit(5);
  
  if (specsCount && specsCount > 0) {
    console.log(`✅ specs: ${specsCount} rows`);
    if (specsData && specsData.length > 0) {
      console.log(`   Sample: ${specsData[0]?.subject} ${specsData[0]?.exam_board || specsData[0]?.board || 'N/A'}`);
    }
  } else {
    console.log('❌ specs: No data (run import-specs script)');
  }

  // Check topics data
  const { data: topicsData, count: topicsCount } = await supabase
    .from('topics')
    .select('*', { count: 'exact' })
    .limit(5);
  
  if (topicsCount && topicsCount > 0) {
    console.log(`✅ topics: ${topicsCount} rows`);
    if (topicsData && topicsData.length > 0) {
      const topic = topicsData[0];
      console.log(`   Sample: ${topic?.title || topic?.name || 'N/A'} (level ${topic?.level})`);
    }
  } else {
    console.log('❌ topics: No data (run import-specs script)');
  }

  // Check users data
  const { data: usersData, count: usersCount } = await supabase
    .from('users')
    .select('*', { count: 'exact' })
    .limit(5);
  
  if (usersCount && usersCount > 0) {
    console.log(`✅ users: ${usersCount} rows`);
    if (usersData && usersData.length > 0) {
      const user = usersData[0];
      console.log(`   Sample: ${user?.email} (has_access: ${user?.has_access}, onboarding: ${user?.has_completed_onboarding})`);
    }
  } else {
    console.log('ℹ️  users: No users yet (normal for new setup)');
  }
}

async function checkRLSStatus() {
  // RLS status can't be checked via API easily, but we can note it
  console.log('ℹ️  RLS status should be checked in Supabase Dashboard > Authentication > Policies');
  console.log('   Key tables should have RLS enabled: users, blocks, topic_ratings, etc.');
  console.log('   Reference tables (specs, topics) may have different RLS policies');
}

// Run verification
verifySupabase().catch(console.error);
