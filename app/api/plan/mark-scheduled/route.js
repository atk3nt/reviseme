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
    const { blockId } = body;

    if (!blockId) {
      return NextResponse.json(
        { error: "Block ID is required" },
        { status: 400 }
      );
    }

    // Update block status to scheduled and clear completed_at
    const { error: updateError } = await supabaseAdmin
      .from('blocks')
      .update({
        status: 'scheduled',
        completed_at: null
      })
      .eq('id', blockId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Failed to update block: ${updateError.message}`);
    }

    // Log the event
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: userId,
        event_type: 'block_rescheduled',
        event_data: {
          block_id: blockId,
          rescheduled_at: new Date().toISOString()
        }
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark scheduled error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark block as scheduled" },
      { status: 500 }
    );
  }
}


