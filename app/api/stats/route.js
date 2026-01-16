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

export async function GET(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get ALL blocks for the user (no date filtering, no limits)
    let allBlocks = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: blocksData, error: blocksError } = await supabaseAdmin
        .from('blocks')
        .select('id, status, completed_at')
        .eq('user_id', userId)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: false });
      
      if (blocksError) {
        console.error('Error fetching blocks:', blocksError);
        return NextResponse.json(
          { error: "Failed to fetch blocks" },
          { status: 500 }
        );
      }
      
      if (blocksData && blocksData.length > 0) {
        allBlocks = allBlocks.concat(blocksData);
        hasMore = blocksData.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }
    
    // Calculate stats
    const done = allBlocks.filter(b => b.status === 'done').length;
    const scheduled = allBlocks.filter(b => b.status === 'scheduled').length;

    // Count missed events from logs (each missed action is logged separately)
    // This ensures that if a block is missed → rescheduled → missed again, it counts as 2 missed events
    let missed = 0;
    let missedPage = 0;
    let hasMoreMissed = true;
    let allMissedLogs = []; // Store all missed logs for first-attempt calculation
    while (hasMoreMissed) {
      const { data: missedLogs, error: logsError } = await supabaseAdmin
        .from('logs')
        .select('id, event_data, created_at')
        .eq('user_id', userId)
        .eq('event_type', 'block_missed')
        .range(missedPage * pageSize, (missedPage + 1) * pageSize - 1);
      
      if (logsError) {
        console.error('Error fetching missed logs:', logsError);
        // Don't fail the entire request, just log the error and break
        break;
      }
      
      if (missedLogs && missedLogs.length > 0) {
        missed += missedLogs.length;
        allMissedLogs = allMissedLogs.concat(missedLogs);
        hasMoreMissed = missedLogs.length === pageSize;
        missedPage++;
      } else {
        hasMoreMissed = false;
      }
    }
    const activeDays = new Set(
      allBlocks
        .filter(b => b.status === 'done' && b.completed_at)
        .map(b => new Date(b.completed_at).toISOString().split('T')[0])
    ).size;
    const lastActivity = allBlocks
      .filter(b => b.completed_at)
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0]?.completed_at;
    
    // Calculate hours revised (25 mins per block)
    const doneBlocks = allBlocks.filter(b => b.status === 'done');
    const totalMinutes = doneBlocks.length * 25;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    // Calculate completion percentage (exclude missed blocks)
    // Only count done vs (done + scheduled) - missed blocks don't affect completion %
    const currentlyMissedBlocks = allBlocks.filter(b => b.status === 'missed').length;
    const totalActiveBlocks = done + scheduled;
    const completionPercentage = totalActiveBlocks > 0 ? (done / totalActiveBlocks) * 100 : 0;
    
    // Calculate blocks completed on first attempt (not rescheduled)
    // A block is "first attempt" if it was completed without ever being marked as missed before completion
    const totalBlocksOffered = done + scheduled; // Total blocks that were scheduled
    
    // Create a map of block_id -> earliest missed timestamp
    const blockMissedMap = new Map();
    allMissedLogs.forEach(log => {
      const blockId = log.event_data?.block_id;
      if (blockId) {
        const missedAt = new Date(log.created_at);
        const existing = blockMissedMap.get(blockId);
        if (!existing || missedAt < existing) {
          blockMissedMap.set(blockId, missedAt);
        }
      }
    });
    
    // Count blocks completed on first attempt
    const completedOnFirstAttempt = doneBlocks.filter(block => {
      const missedAt = blockMissedMap.get(block.id);
      if (!missedAt) {
        return true; // Never missed = first attempt
      }
      // If missed after completion, still counts as first attempt
      const completedAt = block.completed_at ? new Date(block.completed_at) : null;
      if (!completedAt) {
        return false; // No completion time = can't determine
      }
      return missedAt >= completedAt; // Missed after completion = first attempt
    }).length;
    
    const firstAttemptCompletionRate = totalBlocksOffered > 0 
      ? (completedOnFirstAttempt / totalBlocksOffered) * 100 
      : 0;
    
    // Get average confidence from user_stats view
    const { data: statsData, error: statsError } = await supabaseAdmin
      .from('user_stats')
      .select('avg_confidence')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (statsError && statsError.code !== 'PGRST116') {
      console.error('Error fetching user_stats:', statsError);
    }
    
    const avgConfidence = statsData?.avg_confidence || 0;
    
    return NextResponse.json({
      success: true,
      stats: {
        blocks_done: done,
        blocks_missed: missed, // Total missed events (from logs)
        currently_missed_blocks: currentlyMissedBlocks, // Unique blocks currently with status='missed'
        blocks_scheduled: scheduled,
        active_days: activeDays,
        completed_on_first_attempt: completedOnFirstAttempt, // Blocks completed without being rescheduled
        total_blocks_offered: totalBlocksOffered, // Total blocks scheduled (done + scheduled)
        first_attempt_completion_rate: firstAttemptCompletionRate, // Percentage completed on first attempt
        hours_revised: { hours, minutes },
        completion_percentage: completionPercentage, // done / (done + scheduled) - excludes missed
        avg_confidence: avgConfidence
      }
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load stats" },
      { status: 500 }
    );
  }
}

