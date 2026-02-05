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
 * Reset Plan - Delete all blocks for the current user
 * Keeps ratings, onboarding data, and preferences
 * POST /api/dev/reset-plan
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

    // Delete all blocks for this user
    const { error, count } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting blocks:', error);
      return NextResponse.json(
        { error: "Failed to delete blocks" },
        { status: 500 }
      );
    }

    console.log(`✅ Deleted all blocks for user: ${user.email} (${count || 0} blocks)`);

    return NextResponse.json({
      success: true,
      message: "All blocks deleted successfully",
      deletedCount: count || 0
    });

  } catch (error) {
    console.error('Error in reset-plan:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
