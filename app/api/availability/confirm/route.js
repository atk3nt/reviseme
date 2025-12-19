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

function getWeekMonday(weekOffset = 1) {
  const today = new Date();
  const day = today.getDay();
  // Get this week's Monday
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
  thisMonday.setHours(0, 0, 0, 0);
  
  // Add week offset
  const targetMonday = new Date(thisMonday);
  targetMonday.setDate(thisMonday.getDate() + (weekOffset * 7));
  return targetMonday;
}

/**
 * GET /api/availability/confirm?weekOffset=1
 * Check if availability has been SAVED for a specific week
 * weekOffset: 0 = current week, 1 = next week, etc.
 */
export async function GET(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const weekOffset = parseInt(searchParams.get('weekOffset') || '1', 10);
    
    const targetMonday = getWeekMonday(weekOffset);
    const weekStartDateStr = targetMonday.toISOString().split('T')[0];
    
    // Calculate week end (Sunday 23:59:59)
    const weekEnd = new Date(targetMonday);
    weekEnd.setDate(targetMonday.getDate() + 7);

    // Check if user has saved unavailable times for this week
    // This is the source of truth - if they've saved ANY unavailable times for this week,
    // they've confirmed their availability (even if they have no blocked times)
    const { data: unavailableTimes, error: unavailableError } = await supabaseAdmin
      .from('unavailable_times')
      .select('id')
      .eq('user_id', userId)
      .gte('start_datetime', targetMonday.toISOString())
      .lt('start_datetime', weekEnd.toISOString())
      .limit(1);

    if (unavailableError && unavailableError.code !== 'PGRST116') {
      console.error('Error checking unavailable times:', unavailableError);
    }

    // Also check the week_availability_confirmed table as a backup
    // (for users who confirmed they have NO blocked times)
    let confirmedRecord = null;
    try {
      const { data } = await supabaseAdmin
        .from('week_availability_confirmed')
        .select('confirmed_at')
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDateStr)
        .maybeSingle();
      confirmedRecord = data;
    } catch (e) {
      // Table might not exist yet, that's okay
      console.log('week_availability_confirmed table check failed (may not exist):', e.message);
    }

    // User has confirmed if:
    // 1. They have saved unavailable times for this week, OR
    // 2. They have a confirmation record (meaning they explicitly said "no blocked times")
    const hasUnavailableTimes = unavailableTimes && unavailableTimes.length > 0;
    const hasConfirmationRecord = !!confirmedRecord;
    const isConfirmed = hasUnavailableTimes || hasConfirmationRecord;

    return NextResponse.json({
      success: true,
      isConfirmed,
      hasUnavailableTimes,
      hasConfirmationRecord,
      weekStart: weekStartDateStr,
      weekOffset
    });
  } catch (error) {
    console.error('Error in check availability confirmation:', error);
    return NextResponse.json(
      { error: "Failed to check confirmation status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/availability/confirm
 * Explicitly confirm availability for a week (when user has NO blocked times)
 * This is called when user confirms they have no blocked times for the week
 */
export async function POST(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const weekOffset = body.weekOffset || 1;
    
    const targetMonday = getWeekMonday(weekOffset);
    const weekStartDateStr = targetMonday.toISOString().split('T')[0];

    // Upsert confirmation record
    const { error } = await supabaseAdmin
      .from('week_availability_confirmed')
      .upsert({
        user_id: userId,
        week_start_date: weekStartDateStr,
        confirmed_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,week_start_date'
      });

    if (error) {
      console.error('Error confirming availability:', error);
      return NextResponse.json(
        { error: "Failed to confirm availability" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Availability confirmed for week",
      weekStart: weekStartDateStr
    });
  } catch (error) {
    console.error('Error in confirm availability:', error);
    return NextResponse.json(
      { error: "Failed to confirm availability" },
      { status: 500 }
    );
  }
}
