/**
 * Display SQL to drop study_blocks table
 * Run this, then copy the SQL and run it in Supabase SQL Editor
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationFile = resolve(__dirname, '../supabase/migrations/006_remove_study_blocks.sql');
const sql = readFileSync(migrationFile, 'utf-8');

console.log('\n📋 SQL to run in Supabase SQL Editor:\n');
console.log('='.repeat(60));
console.log(sql);
console.log('='.repeat(60));
console.log('\n📝 Instructions:');
console.log('1. Go to https://supabase.com/dashboard > Your Project > SQL Editor');
console.log('2. Click "New query"');
console.log('3. Copy and paste the SQL above');
console.log('4. Click "Run"\n');

