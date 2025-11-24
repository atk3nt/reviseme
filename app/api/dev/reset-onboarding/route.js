import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
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
        name: 'Dev Tester',
        has_completed_onboarding: false
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    return created?.id ?? null;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data?.id ?? null;
}

async function resolveUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId || process.env.NODE_ENV !== 'development') {
    return userId;
  }

  return await ensureDevUser();
}

export async function POST(req) {
  try {
    const userId = await resolveUserId();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all blocks for this user
    const { error: blocksError } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('user_id', userId);

    if (blocksError) {
      console.error('Error deleting blocks:', blocksError);
    }

    // Reset onboarding status and access
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({ 
        has_completed_onboarding: false,
        has_access: false 
      })
      .eq('id', userId);

    if (userError) {
      console.error('Error resetting user onboarding:', userError);
    }

    // Delete unavailable times
    const { error: unavailableError } = await supabaseAdmin
      .from('unavailable_times')
      .delete()
      .eq('user_id', userId);

    if (unavailableError) {
      console.error('Error deleting unavailable times:', unavailableError);
    }

    // Delete repeatable events
    const { error: eventsError } = await supabaseAdmin
      .from('repeatable_events')
      .delete()
      .eq('user_id', userId);

    if (eventsError) {
      console.error('Error deleting repeatable events:', eventsError);
    }

    return NextResponse.json({ 
      success: true,
      message: 'All data cleared. Please clear localStorage in your browser (quizAnswers key) and refresh.'
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 });
  }
}

