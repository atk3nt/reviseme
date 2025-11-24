import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

/**
 * Dev-only endpoint to set has_access for testing
 * Only works in development mode
 * POST /api/dev/set-access
 */
export async function POST(req) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: "Not available in production" },
        { status: 403 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Set has_access to true for dev testing
    const { error } = await supabaseAdmin
      .from('users')
      .update({ has_access: true })
      .eq('id', session.user.id);

    if (error) {
      console.error('Error setting dev access:', error);
      return NextResponse.json(
        { error: "Failed to set access" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dev access granted"
    });

  } catch (error) {
    console.error('Error in dev set-access:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



