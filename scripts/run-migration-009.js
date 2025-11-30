/**
 * Script to display migration 009 SQL for manual execution
 * 
 * Usage: node scripts/run-migration-009.js
 * 
 * This script displays the SQL that needs to be run in Supabase SQL Editor
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('📝 Migration 009: Fix user_stats view to exclude negative ratings\n');
console.log('⚠️  Supabase requires manual SQL execution for security reasons.\n');
console.log('📋 Follow these steps:\n');
console.log('1. Go to: https://supabase.com > Your Project > SQL Editor');
console.log('2. Click "New query"');
console.log('3. Copy and paste the SQL below');
console.log('4. Click "Run" (or press Cmd/Ctrl + Enter)\n');
console.log('─'.repeat(70));
console.log('\n');

const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '009_fix_user_stats_avg_confidence.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

console.log(migrationSQL);
console.log('\n');
console.log('─'.repeat(70));
console.log('\n✅ After running, the user_stats view will be updated:');
console.log('   • avg_confidence will only include ratings 1-5');
console.log('   • Negative ratings (0, -1, -2) will be excluded');
console.log('   • Grade estimates should now be more accurate\n');

