import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/libs/supabase";

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId parameter required' }, { status: 400 });
    }

    // Calculate next week
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = getMonday(today);
    const nextWeekStart = new Date(currentWeekStart);
    nextWeekStart.setDate(currentWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 7);

    // Query blocks for next week
    const { data: blocks, error } = await supabaseAdmin
      .from('blocks')
      .select('id, topic_id, scheduled_at, duration_minutes, status, created_at')
      .eq('user_id', userId)
      .gte('scheduled_at', nextWeekStart.toISOString())
      .lt('scheduled_at', nextWeekEnd.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by day
    const blocksByDay = {};
    blocks?.forEach(block => {
      const date = new Date(block.scheduled_at);
      const dayKey = date.toISOString().split('T')[0];
      if (!blocksByDay[dayKey]) {
        blocksByDay[dayKey] = [];
      }
      blocksByDay[dayKey].push({
        id: block.id,
        scheduled_at: block.scheduled_at,
        duration_minutes: block.duration_minutes,
        status: block.status
      });
    });

    return NextResponse.json({
      success: true,
      userId,
      weekStart: nextWeekStart.toISOString().split('T')[0],
      weekEnd: nextWeekEnd.toISOString().split('T')[0],
      totalBlocks: blocks?.length || 0,
      blocksByDay,
      blocks: blocks || []
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

