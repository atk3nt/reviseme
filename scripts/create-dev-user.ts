/**
 * Create a dev test user in the database
 * Run with: npx tsx scripts/create-dev-user.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createDevUser() {
  const devEmail = 'appmarkrai@gmail.com';
  
  console.log('🔧 Creating dev test user...');
  
  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('email', devEmail)
    .single();
  
  if (existingUser) {
    console.log('✅ Dev user already exists:', existingUser);
    console.log('   ID:', existingUser.id);
    console.log('   Email:', existingUser.email);
    return existingUser;
  }
  
  // Create new dev user
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      email: devEmail,
      name: 'Dev Test User',
      email_verified: new Date().toISOString()
    })
    .select('id, email, name')
    .single();
  
  if (error) {
    console.error('❌ Error creating dev user:', error);
    process.exit(1);
  }
  
  console.log('✅ Dev user created successfully!');
  console.log('   ID:', newUser.id);
  console.log('   Email:', newUser.email);
  console.log('   Name:', newUser.name);
  
  return newUser;
}

createDevUser()
  .then(() => {
    console.log('\n✨ Done! You can now test the onboarding flow without authentication.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

