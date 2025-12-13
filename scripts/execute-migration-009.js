/**
 * Script to execute migration 009 via Supabase admin client
 * 
 * Usage: node scripts/execute-migration-009.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease check your .env.local file.');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeMigration() {
  try {
    console.log('📝 Reading migration SQL...');
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '009_fix_user_stats_avg_confidence.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Extract just the CREATE OR REPLACE VIEW statement
    const sqlStatement = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
      .join('\n')
      .trim();

    console.log('🚀 Attempting to execute migration via Supabase...\n');

    // Try to execute via RPC (if a function exists) or direct query
    // Note: Supabase doesn't allow arbitrary SQL execution via JS client for security
    // This is a workaround attempt
    
    // Method 1: Try using the REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ sql: sqlStatement })
    });

    if (response.ok) {
      console.log('✅ Migration executed successfully via REST API!');
      return;
    }

    // Method 2: Try using Supabase's query endpoint (won't work for DDL, but let's try)
    console.log('⚠️  Direct SQL execution not available via REST API.');
    console.log('   Supabase requires manual execution for security reasons.\n');
    
    throw new Error('Direct SQL execution not supported');

  } catch (error) {
    if (error.message === 'Direct SQL execution not supported') {
      // Expected - provide manual instructions
      console.log('📋 Please run the migration manually:\n');
      console.log('1. Go to: https://supabase.com > Your Project > SQL Editor');
      console.log('2. Click "New query"');
      console.log('3. Copy and paste the SQL below');
      console.log('4. Click "Run"\n');
      console.log('─'.repeat(70));
      console.log('\n');
      
      const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '009_fix_user_stats_avg_confidence.sql');
      const migrationSQL = readFileSync(migrationPath, 'utf-8');
      console.log(migrationSQL);
      console.log('\n');
      console.log('─'.repeat(70));
      
      console.log('\n💡 Alternative: Install Supabase CLI and run:');
      console.log('   npm install -g supabase');
      console.log('   supabase db push\n');
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
}

executeMigration();


