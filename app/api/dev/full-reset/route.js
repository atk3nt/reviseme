import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'appmarkrai@gmail.com';

async function ensureDevUser() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email')
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
      .select('id, email')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    return created;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data;
}

async function resolveUser() {
  const session = await auth();
  
  if (session?.user?.id) {
    return { id: session.user.id, email: session.user.email };
  }

  // In dev mode, fall back to dev user
  if (process.env.NODE_ENV === 'development') {
    return await ensureDevUser();
  }

  return null;
}

/**
 * Full Reset - Delete ALL user data
 * Deletes: blocks, ratings, onboarding, preferences, unavailable times, repeatable events
 * Keeps: basic user account (email, name)
 * POST /api/dev/full-reset
 */
export async function POST(req) {
  try {
    const user = await resolveUser();
    
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only allow in development mode
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!isDevelopment) {
      return NextResponse.json(
        { error: "This endpoint is only available in development mode" },
        { status: 403 }
      );
    }

    const userId = user.id;
    const errors = [];

    // Delete blocks
    const { error: blocksError } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('user_id', userId);
    if (blocksError) {
      console.error('Error deleting blocks:', blocksError);
      errors.push('blocks');
    }

    // Delete user_topic_confidence (ratings)
    const { error: ratingsError } = await supabaseAdmin
      .from('user_topic_confidence')
      .delete()
      .eq('user_id', userId);
    if (ratingsError) {
      console.error('Error deleting ratings:', ratingsError);
      errors.push('ratings');
    }

    // Delete unavailable_times
    const { error: unavailableError } = await supabaseAdmin
      .from('unavailable_times')
      .delete()
      .eq('user_id', userId);
    if (unavailableError) {
      console.error('Error deleting unavailable times:', unavailableError);
      errors.push('unavailable_times');
    }

    // Delete repeatable_events
    const { error: eventsError } = await supabaseAdmin
      .from('repeatable_events')
      .delete()
      .eq('user_id', userId);
    if (eventsError) {
      console.error('Error deleting repeatable events:', eventsError);
      errors.push('repeatable_events');
    }

    // Delete week_time_preferences
    const { error: weekPrefsError } = await supabaseAdmin
      .from('week_time_preferences')
      .delete()
      .eq('user_id', userId);
    if (weekPrefsError) {
      console.error('Error deleting week preferences:', weekPrefsError);
      errors.push('week_time_preferences');
    }

    // Delete logs (optional - keeps history clean)
    const { error: logsError } = await supabaseAdmin
      .from('logs')
      .delete()
      .eq('user_id', userId);
    if (logsError) {
      console.error('Error deleting logs:', logsError);
      // Don't add to errors - logs are optional
    }

    // Reset user data (keep email and name, reset everything else)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        has_completed_onboarding: false,
        has_access: false,
        weekday_earliest_time: null,
        weekday_latest_time: null,
        weekend_earliest_time: null,
        weekend_latest_time: null,
        use_same_weekend_times: true,
        stripe_customer_id: null,
        stripe_price_id: null
      })
      .eq('id', userId);

    if (userError) {
      console.error('Error resetting user data:', userError);
      errors.push('user_data');
    }

    if (errors.length > 0) {
      console.warn(`⚠️ Full reset completed with errors in: ${errors.join(', ')}`);
      return NextResponse.json({
        success: true,
        message: "Full reset completed with some errors",
        errors: errors
      });
    }

    console.log(`✅ Full reset completed for user: ${user.email}`);

    return NextResponse.json({
      success: true,
      message: "Full reset completed successfully"
    });

  } catch (error) {
    console.error('Error in full-reset:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
