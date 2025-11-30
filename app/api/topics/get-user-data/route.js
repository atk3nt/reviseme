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

    // Get user's onboarding data
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('onboarding_data')
      .eq('id', userId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error fetching user data:', userError);
      return NextResponse.json(
        { error: "Failed to fetch user data", details: userError.message },
        { status: 500 }
      );
    }

    const onboarding = userData?.onboarding_data || {};
    // Onboarding saves as snake_case, but also check camelCase for compatibility
    const selectedSubjects = onboarding.selected_subjects || onboarding.selectedSubjects || [];
    const subjectBoards = onboarding.subject_boards || onboarding.subjectBoards || {};

    console.log('📊 User data loaded:', { 
      userId, 
      subjectCount: selectedSubjects.length, 
      subjects: selectedSubjects,
      boards: Object.keys(subjectBoards).length 
    });

    return NextResponse.json({ 
      success: true,
      userId,
      selectedSubjects,
      subjectBoards
    });

  } catch (error) {
    console.error("Get user data error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get user data" },
      { status: 500 }
    );
  }
}

