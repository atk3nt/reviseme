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
    const { data: created } = await supabaseAdmin
      .from('users')
      .insert({
        email: DEV_USER_EMAIL,
        name: 'Dev Tester',
        has_completed_onboarding: false
      })
      .select('id')
      .single();
    return created?.id ?? null;
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

export async function GET() {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
      .eq('id', userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      timePreferences: {
        weekdayEarliest: userData?.weekday_earliest_time || 'NOT SET',
        weekdayLatest: userData?.weekday_latest_time || 'NOT SET',
        weekendEarliest: userData?.weekend_earliest_time || 'NOT SET',
        weekendLatest: userData?.weekend_latest_time || 'NOT SET',
        useSameWeekendTimes: userData?.use_same_weekend_times
      },
      raw: userData
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const userId = await resolveUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { weekdayEarliest, weekdayLatest, weekendEarliest, weekendLatest, useSameWeekendTimes } = body;

    const updateData = {};
    if (weekdayEarliest) updateData.weekday_earliest_time = weekdayEarliest.includes(':') ? weekdayEarliest : `${weekdayEarliest}:00`;
    if (weekdayLatest) updateData.weekday_latest_time = weekdayLatest.includes(':') ? weekdayLatest : `${weekdayLatest}:00`;
    if (weekendEarliest !== undefined) updateData.weekend_earliest_time = weekendEarliest ? (weekendEarliest.includes(':') ? weekendEarliest : `${weekendEarliest}:00`) : null;
    if (weekendLatest !== undefined) updateData.weekend_latest_time = weekendLatest ? (weekendLatest.includes(':') ? weekendLatest : `${weekendLatest}:00`) : null;
    if (useSameWeekendTimes !== undefined) updateData.use_same_weekend_times = useSameWeekendTimes;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Time preferences updated',
      timePreferences: data
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

