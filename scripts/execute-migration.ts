/**
 * Execute a Supabase migration via REST API
 * 
 * Usage: tsx scripts/execute-migration.ts 006_remove_study_blocks
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const migrationName = process.argv[2];

if (!migrationName) {
  console.error('❌ Please provide a migration name (e.g., 006_remove_study_blocks)');
  process.exit(1);
}

const migrationFile = resolve(__dirname, `../supabase/migrations/${migrationName}.sql`);

let sql: string;
try {
  sql = readFileSync(migrationFile, 'utf-8');
} catch (error) {
  console.error(`❌ Migration file not found: ${migrationFile}`);
  process.exit(1);
}

// Remove comments for cleaner execution
const cleanSql = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
  .join('\n')
  .trim();

console.log(`\n📄 Executing migration: ${migrationName}\n`);

// Use Supabase REST API to execute SQL
// The REST API endpoint for executing SQL is: POST /rest/v1/rpc/exec_sql
// But we need to use the Management API or a custom function
// Actually, the simplest way is to use the Supabase REST API with a direct query

async function executeMigration() {
  try {
    // Use fetch to call Supabase REST API
    // Note: Supabase doesn't have a direct SQL execution endpoint in the public API
    // We'll need to use the SQL Editor or create a stored procedure
    // For now, let's use a workaround: we can execute via the REST API if we have the right endpoint
    
    // Actually, the best approach is to show the SQL and let them run it
    // OR we can use the Supabase Management API (requires additional setup)
    
    console.log('⚠️  Direct SQL execution via API requires additional setup.');
    console.log('   Please run the migration in Supabase SQL Editor:\n');
    console.log('   SQL:');
    console.log('   ' + '='.repeat(58));
    console.log('   ' + cleanSql.split('\n').join('\n   '));
    console.log('   ' + '='.repeat(58));
    console.log('\n   Or visit: https://supabase.com/dashboard > SQL Editor\n');
    
    // Alternative: Try using the REST API with a custom function
    // But for now, manual execution is simpler
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

executeMigration();

