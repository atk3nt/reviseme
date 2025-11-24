/**
 * Run a Supabase migration script
 * 
 * Usage: tsx scripts/run-migration.ts <migration-file>
 * Example: tsx scripts/run-migration.ts supabase/migrations/006_remove_study_blocks.sql
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Please provide a migration file path');
  console.error('   Usage: tsx scripts/run-migration.ts <migration-file>');
  process.exit(1);
}

const filePath = path.resolve(migrationFile);

if (!fs.existsSync(filePath)) {
  console.error(`❌ Migration file not found: ${filePath}`);
  process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf-8');

// Remove comments and empty lines for cleaner output
const cleanSql = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
  .join('\n');

console.log(`\n📄 Running migration: ${migrationFile}\n`);
console.log('SQL:');
console.log('-'.repeat(60));
console.log(cleanSql);
console.log('-'.repeat(60));

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Note: Supabase JS client doesn't have a direct "execute SQL" method
// We need to use RPC or the REST API. For now, let's use a workaround.
// Actually, we can't execute arbitrary SQL via the JS client easily.
// The best approach is to use the Supabase SQL Editor or the REST API.

console.log('\n⚠️  Note: Supabase JS client cannot execute arbitrary SQL directly.');
console.log('   Please run this migration in Supabase SQL Editor:');
console.log('   https://supabase.com/dashboard > SQL Editor\n');
console.log('   Or copy the SQL above and run it manually.\n');

// Alternative: We could use the REST API, but it requires additional setup
// For now, just provide clear instructions

