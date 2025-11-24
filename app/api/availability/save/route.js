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

/**
 * Save availability preferences and unavailable times
 * POST /api/availability/save
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
    const {
      timePreferences,
      blockedTimes = []
    } = body;

    if (!timePreferences) {
      return NextResponse.json(
        { error: "Time preferences are required" },
        { status: 400 }
      );
    }

    // Update user time preferences
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        weekday_earliest_time: timePreferences.weekdayEarliest,
        weekday_latest_time: timePreferences.weekdayLatest,
        weekend_earliest_time: timePreferences.weekendEarliest || null,
        weekend_latest_time: timePreferences.weekendLatest || null,
        use_same_weekend_times: timePreferences.useSameWeekendTimes !== false
      })
      .eq('id', userId);

    if (userUpdateError) {
      console.error('Error updating user time preferences:', userUpdateError);
      return NextResponse.json(
        { error: "Failed to save time preferences" },
        { status: 500 }
      );
    }

    // Delete existing unavailable times for the date ranges we're updating
    if (blockedTimes.length > 0) {
      // Get the date range of blocked times
      const dates = blockedTimes.map(bt => new Date(bt.start).toISOString().split('T')[0]);
      const minDate = new Date(Math.min(...dates.map(d => new Date(d))));
      const maxDate = new Date(Math.max(...dates.map(d => new Date(d))));
      maxDate.setDate(maxDate.getDate() + 1); // Include end date

      // Delete existing unavailable times in this range
      await supabaseAdmin
        .from('unavailable_times')
        .delete()
        .eq('user_id', userId)
        .gte('start_datetime', minDate.toISOString())
        .lt('start_datetime', maxDate.toISOString());
    }

    // Insert new unavailable times
    if (blockedTimes.length > 0) {
      const unavailableEntries = blockedTimes.map(blocked => ({
        user_id: userId,
        start_datetime: blocked.start,
        end_datetime: blocked.end,
        reason: blocked.reason || null
      }));

      const { error: insertError } = await supabaseAdmin
        .from('unavailable_times')
        .insert(unavailableEntries);

      if (insertError) {
        console.error('Error saving unavailable times:', insertError);
        // Don't fail the whole request if some times fail
      }
    }

    return NextResponse.json({
      success: true,
      message: "Availability preferences saved"
    });

  } catch (error) {
    console.error('Error saving availability:', error);
    return NextResponse.json(
      { error: "Failed to save availability preferences" },
      { status: 500 }
    );
  }
}

/**
 * Get availability preferences and unavailable times
 * GET /api/availability/save
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

    // Get user time preferences
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
      .eq('id', userId)
      .single();

    if (userError) {
      return NextResponse.json(
        { error: "Failed to load preferences" },
        { status: 500 }
      );
    }

    // Get unavailable times (optional: provide date range)
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let unavailableQuery = supabaseAdmin
      .from('unavailable_times')
      .select('*')
      .eq('user_id', userId)
      .order('start_datetime', { ascending: true });

    if (startDate) {
      unavailableQuery = unavailableQuery.gte('start_datetime', startDate);
    }
    if (endDate) {
      unavailableQuery = unavailableQuery.lte('start_datetime', endDate);
    }

    const { data: unavailableTimes, error: unavailableError } = await unavailableQuery;

    if (unavailableError) {
      console.error('Error loading unavailable times:', unavailableError);
    }

    // Helper to convert HH:MM:SS to HH:MM format (for input fields)
    const formatTimeForInput = (timeString) => {
      if (!timeString) return null;
      // If already in HH:MM format, return as is
      if (timeString.split(':').length === 2) return timeString;
      // If in HH:MM:SS format, remove seconds
      if (timeString.split(':').length === 3) {
        const [hours, minutes] = timeString.split(':');
        return `${hours}:${minutes}`;
      }
      return timeString;
    };

    return NextResponse.json({
      success: true,
      timePreferences: {
        weekdayEarliest: formatTimeForInput(user.weekday_earliest_time) || '6:00',
        weekdayLatest: formatTimeForInput(user.weekday_latest_time) || '23:30',
        weekendEarliest: formatTimeForInput(user.weekend_earliest_time) || '8:00',
        weekendLatest: formatTimeForInput(user.weekend_latest_time) || '23:30',
        useSameWeekendTimes: user.use_same_weekend_times !== false
      },
      blockedTimes: (unavailableTimes || []).map(ut => ({
        start: ut.start_datetime,
        end: ut.end_datetime,
        reason: ut.reason,
        source: ut.source || null // Ensure source field exists (null for manual blocks)
      }))
    });

  } catch (error) {
    console.error('Error loading availability:', error);
    return NextResponse.json(
      { error: "Failed to load availability preferences" },
      { status: 500 }
    );
  }
}


