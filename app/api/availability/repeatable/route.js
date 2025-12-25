import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
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

export async function GET() {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("repeatable_events")
      .select("id, label, start_time, end_time, days_of_week, start_date, end_date, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Repeatable events fetch error:", error);
      return NextResponse.json({ error: "Failed to load repeatable events" }, { status: 500 });
    }

    return NextResponse.json({ success: true, events: data ?? [] });
  } catch (error) {
    console.error("Repeatable events GET error:", error);
    return NextResponse.json({ error: "Failed to load repeatable events" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();

    const { label, start_time, end_time, days_of_week, start_date = null, end_date = null, metadata = null } = body || {};

    if (!label || !start_time || !end_time || !Array.isArray(days_of_week) || days_of_week.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Ensure time format is HH:MM:SS (Supabase TIME type)
    const formatTime = (time) => {
      if (!time) return null;
      // If already in HH:MM:SS format, return as is
      if (time.split(':').length === 3) return time;
      // If in HH:MM format, add :00 seconds
      if (time.split(':').length === 2) return `${time}:00`;
      return time;
    };

    const { data, error } = await supabaseAdmin
      .from("repeatable_events")
      .insert({
        user_id: userId,
        label,
        start_time: formatTime(start_time),
        end_time: formatTime(end_time),
        days_of_week,
        start_date,
        end_date,
        metadata
      })
      .select("*")
      .single();

    if (error) {
      console.error("Repeatable events insert error:", error);
      return NextResponse.json({ 
        error: error.message || "Failed to save event",
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, event: data });
  } catch (error) {
    console.error("Repeatable events POST error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to save event",
      details: error.toString()
    }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("repeatable_events")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);

    if (error) {
      console.error("Repeatable events delete error:", error);
      return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Repeatable events DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}

