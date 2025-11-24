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
    const { weekStart } = body;

    if (!weekStart) {
      return NextResponse.json(
        { error: "Week start date is required" },
        { status: 400 }
      );
    }

    // Get blocks for the week
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 7);

    const { data: blocks } = await supabaseAdmin
      .from('blocks')
      .select(`
        status,
        completed_at,
        topics!inner(
          name,
          level,
          specs!inner(subject, board)
        )
      `)
      .eq('user_id', session.user.id)
      .gte('scheduled_at', weekStartDate.toISOString())
      .lt('scheduled_at', weekEndDate.toISOString());

    if (!blocks || blocks.length === 0) {
      return NextResponse.json(
        { error: "No blocks found for this week" },
        { status: 400 }
      );
    }

    // Calculate weekly stats
    const stats = {
      total: blocks.length,
      done: blocks.filter(b => b.status === 'done').length,
      missed: blocks.filter(b => b.status === 'missed').length,
      skipped: blocks.filter(b => b.status === 'skipped').length,
      completionRate: 0
    };

    stats.completionRate = stats.total > 0 ? (stats.done / stats.total) * 100 : 0;

    // Group by subject
    const subjectStats = {};
    blocks.forEach(block => {
      const subject = block.topics.specs.subject;
      if (!subjectStats[subject]) {
        subjectStats[subject] = { done: 0, total: 0 };
      }
      subjectStats[subject].total++;
      if (block.status === 'done') {
        subjectStats[subject].done++;
      }
    });

    // Generate AI feedback
    const prompt = `Based on this week's revision progress, provide 3 encouraging bullet points:

Week Stats:
- Total blocks: ${stats.total}
- Completed: ${stats.done}
- Missed: ${stats.missed}
- Completion rate: ${stats.completionRate.toFixed(1)}%

Subject breakdown:
${Object.entries(subjectStats).map(([subject, s]) => 
  `${subject}: ${s.done}/${s.total} blocks completed`
).join('\n')}

Provide constructive feedback focusing on what went well and gentle suggestions for improvement.`;

    const aiFeedback = await generateInsight(prompt, { stats, subjectStats });

    // Store the insight
    const { error: insertError } = await supabaseAdmin
      .from('user_insights')
      .insert({
        user_id: session.user.id,
        insight_type: 'weekly_feedback',
        content: aiFeedback,
        metadata: { stats, subjectStats, weekStart }
      });

    if (insertError) {
      console.error("Failed to store AI insight:", insertError);
    }

    // Log the event
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: session.user.id,
        event_type: 'ai_feedback_generated',
        event_data: {
          insight_type: 'weekly_feedback',
          week_start: weekStart,
          completion_rate: stats.completionRate
        }
      });

    return NextResponse.json({ 
      success: true, 
      feedback: aiFeedback,
      stats
    });
  } catch (error) {
    console.error("Weekly feedback error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate weekly feedback" },
      { status: 500 }
    );
  }
}


