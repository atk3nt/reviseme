import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { generateInsight } from "@/libs/openai";

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

    // Get block details
    const { data: block } = await supabaseAdmin
      .from('blocks')
      .select(`
        scheduled_at,
        ai_rationale,
        topics!inner(
          name,
          level,
          specs!inner(subject, board)
        )
      `)
      .eq('id', blockId)
      .eq('user_id', session.user.id)
      .single();

    if (!block) {
      return NextResponse.json(
        { error: "Block not found" },
        { status: 404 }
      );
    }

    // If rationale already exists, return it
    if (block.ai_rationale) {
      return NextResponse.json({ 
        success: true, 
        rationale: block.ai_rationale
      });
    }

    // Generate AI rationale
    const prompt = `Explain why this A-Level revision topic was scheduled for this time:

Topic: ${block.topics.name} (${block.topics.specs.subject} - ${block.topics.specs.board})
Level: ${block.topics.level}
Scheduled: ${new Date(block.scheduled_at).toLocaleString()}

Provide a brief, encouraging explanation of why this topic is important to study now.`;

    const aiRationale = await generateInsight(prompt, { block });

    // Update the block with the rationale
    await supabaseAdmin
      .from('blocks')
      .update({ ai_rationale: aiRationale })
      .eq('id', blockId);

    return NextResponse.json({ 
      success: true, 
      rationale: aiRationale
    });
  } catch (error) {
    console.error("Block rationale error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate block rationale" },
      { status: 500 }
    );
  }
}


