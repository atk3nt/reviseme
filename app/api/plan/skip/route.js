import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

export async function POST(req) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
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

    // Update block status to skipped
    const { error: updateError } = await supabaseAdmin
      .from('blocks')
      .update({
        status: 'skipped',
        completed_at: new Date().toISOString()
      })
      .eq('id', blockId)
      .eq('user_id', session.user.id);

    if (updateError) {
      throw new Error(`Failed to update block: ${updateError.message}`);
    }

    // Log the event
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: session.user.id,
        event_type: 'block_skipped',
        event_data: {
          block_id: blockId,
          skipped_at: new Date().toISOString()
        }
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Skip block error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to skip block" },
      { status: 500 }
    );
  }
}


