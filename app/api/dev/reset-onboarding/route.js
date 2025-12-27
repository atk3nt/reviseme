import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'appmarkrai@gmail.com';

async function ensureDevUser() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', DEV_USER_EMAIL)
    .maybeSingle();

  if (!data && (!error || error.code === 'PGRST116')) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        email: DEV_USER_EMAIL,
        name: 'Dev Test User',
        email_verified: new Date().toISOString(),
        has_completed_onboarding: false
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    console.log('✅ Dev mode: Created fresh test user:', created?.id);
    return created?.id ?? null;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data?.id ?? null;
}

export async function POST(req) {
  try {
    // This is a dev-only endpoint - completely delete the dev user so they can sign up fresh
    console.log('🔄 Dev mode: Completely deleting dev user for fresh signup...');
    
    // First, get the user ID to explicitly delete OAuth accounts
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', DEV_USER_EMAIL)
      .maybeSingle();
    
    if (existingUser?.id) {
      // Explicitly delete OAuth accounts (Google, etc.) before deleting user
      const { error: accountsError } = await supabaseAdmin
        .from('accounts')
        .delete()
        .eq('user_id', existingUser.id);
      
      if (accountsError) {
        console.error('Error deleting OAuth accounts:', accountsError);
      } else {
        console.log('✅ Dev mode: Deleted OAuth accounts (Google, etc.)');
      }
      
      // Delete sessions
      const { error: sessionsError } = await supabaseAdmin
        .from('sessions')
        .delete()
        .eq('user_id', existingUser.id);
      
      if (sessionsError) {
        console.error('Error deleting sessions:', sessionsError);
      } else {
        console.log('✅ Dev mode: Deleted sessions');
      }
    }
    
    // Delete the existing dev user (this will cascade delete all related data)
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('email', DEV_USER_EMAIL);

    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('Error deleting dev user:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to delete user',
        details: deleteError.message 
      }, { status: 500 });
    } else {
      console.log('✅ Dev mode: Completely deleted dev user');
    }

    return NextResponse.json({ 
      success: true,
      message: 'Dev user completely deleted. You can now sign up fresh with Google or email.',
      deleted: true
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 });
  }
}

