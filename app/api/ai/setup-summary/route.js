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

    // Get user's confidence ratings
    const { data: confidenceData } = await supabaseAdmin
      .from('user_topic_confidence')
      .select(`
        rating,
        topics!inner(
          name,
          level,
          specs!inner(subject, board)
        )
      `)
      .eq('user_id', session.user.id);

    if (!confidenceData || confidenceData.length === 0) {
      return NextResponse.json(
        { error: "No confidence data found" },
        { status: 400 }
      );
    }

    // Group by subject and calculate averages
    const subjectStats = {};
    confidenceData.forEach(item => {
      const subject = item.topics.specs.subject;
      if (!subjectStats[subject]) {
        subjectStats[subject] = { ratings: [], count: 0 };
      }
      subjectStats[subject].ratings.push(item.rating);
      subjectStats[subject].count++;
    });

    // Calculate averages and identify strengths/weaknesses
    const summary = [];
    Object.entries(subjectStats).forEach(([subject, stats]) => {
      const avgRating = stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length;
      summary.push({
        subject,
        averageRating: avgRating,
        topicCount: stats.count
      });
    });

    // Sort by average rating
    summary.sort((a, b) => a.averageRating - b.averageRating);

    // Generate AI insight
    const prompt = `Based on these A-Level subject confidence ratings, provide a brief 2-3 bullet point summary of the student's strengths and areas for improvement:

${summary.map(s => `${s.subject}: ${s.averageRating.toFixed(1)}/5 (${s.topicCount} topics)`).join('\n')}

Format as bullet points, be encouraging but honest about areas needing work.`;

    const aiSummary = await generateInsight(prompt, { summary });

    // Store the insight
    const { error: insertError } = await supabaseAdmin
      .from('user_insights')
      .insert({
        user_id: session.user.id,
        insight_type: 'setup_summary',
        content: aiSummary,
        metadata: { summary }
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
          insight_type: 'setup_summary',
          subjects_analyzed: summary.length
        }
      });

    return NextResponse.json({ 
      success: true, 
      summary: aiSummary,
      subjectStats: summary
    });
  } catch (error) {
    console.error("Setup summary error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate setup summary" },
      { status: 500 }
    );
  }
}


