import { createClient } from '@supabase/supabase-js'

// Use window in browser, globalThis in Node.js to persist clients across Fast Refresh
// This prevents the "Multiple GoTrueClient instances" warning during development
const globalForSupabase = typeof window !== 'undefined' ? window : globalThis;

// Create client only once and reuse it
function createSupabaseClient() {
  if (!globalForSupabase.__supabaseClient) {
    globalForSupabase.__supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
  }
  return globalForSupabase.__supabaseClient;
}

function createSupabaseAdminClient() {
  // Only create admin client if service role key is available (server-side only)
  // This prevents errors during client-side module evaluation
  if (!globalForSupabase.__supabaseAdminClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && serviceRoleKey && supabaseUrl.trim() && serviceRoleKey.trim()) {
      globalForSupabase.__supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey);
    }
  }
  return globalForSupabase.__supabaseAdminClient;
}

// Export clients - they will reuse existing instances if available
export const supabase = createSupabaseClient();
export const supabaseAdmin = createSupabaseAdminClient();
