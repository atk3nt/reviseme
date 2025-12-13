import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'dev-test@markr.local';

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
    // This is a dev-only endpoint - always delete and recreate the dev user
    console.log('🔄 Dev mode: Deleting existing dev user to create fresh one...');
    
    // Delete the existing dev user (this will cascade delete all related data)
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('email', DEV_USER_EMAIL);

    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('Error deleting dev user:', deleteError);
      // Continue anyway - might not exist
    } else {
      console.log('✅ Dev mode: Deleted old dev user');
    }

    // Create a fresh dev user
    const newUserId = await ensureDevUser();
    
    if (!newUserId) {
      return NextResponse.json({ 
        error: 'Failed to create fresh dev user' 
      }, { status: 500 });
    }

    console.log('✅ Dev mode: Created fresh dev user with ID:', newUserId);

    return NextResponse.json({ 
      success: true,
      message: 'Fresh dev user created. Please clear localStorage in your browser (quizAnswers key) and refresh.',
      newUserId
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 });
  }
}

