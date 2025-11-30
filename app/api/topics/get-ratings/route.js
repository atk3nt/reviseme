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

  // In dev mode, use dev user if no session
  if (!userId && process.env.NODE_ENV === 'development') {
    return await ensureDevUser();
  }

  return userId;
}

export async function GET(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get ALL user's ratings (including 0, -1, -2, and 1-5)
    // This is needed for the rerate-topics page to show all current ratings
    const { data: ratingsData, error: ratingsError } = await supabaseAdmin
      .from('user_topic_confidence')
      .select('topic_id, rating')
      .eq('user_id', userId);

    if (ratingsError) {
      console.error('Error fetching ratings:', ratingsError);
      return NextResponse.json(
        { error: "Failed to fetch ratings", details: ratingsError.message },
        { status: 500 }
      );
    }

    console.log(`📊 Loaded ${ratingsData?.length || 0} ratings for user ${userId}`);

    return NextResponse.json({ 
      success: true,
      ratings: ratingsData || []
    });

  } catch (error) {
    console.error("Get ratings error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get ratings" },
      { status: 500 }
    );
  }
}

