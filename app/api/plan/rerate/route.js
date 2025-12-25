import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'appmarkrai@gmail.com';

// Progressive maintenance intervals (days until next review)
// After each successful high rating, interval increases
const MAINTENANCE_INTERVALS = [7, 14, 30, 60, 90];

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

// Get next maintenance interval based on consecutive successful reviews
function getNextMaintenanceInterval(consecutiveSuccesses = 0) {
  const index = Math.min(consecutiveSuccesses, MAINTENANCE_INTERVALS.length - 1);
  return MAINTENANCE_INTERVALS[index];
}

export async function POST(req) {
  console.log('🔄 RE-RATE API CALLED');
  try {
    const userId = await resolveUserId();
    console.log('🔄 User ID:', userId);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { blockId, reratingScore } = body;
    console.log('🔄 Re-rating request:', { blockId, reratingScore });

    if (!blockId) {
      return NextResponse.json(
        { error: "Block ID is required" },
        { status: 400 }
      );
    }

    if (reratingScore === undefined || reratingScore < 1 || reratingScore > 5) {
      return NextResponse.json(
        { error: "Re-rating score must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Get the block details
    const { data: block, error: blockError } = await supabaseAdmin
      .from('blocks')
      .select('id, topic_id, scheduled_at, status, session_number, session_total, ai_rationale')
      .eq('id', blockId)
      .eq('user_id', userId)
      .single();

    if (blockError || !block) {
      console.error('Block not found:', blockError);
      return NextResponse.json(
        { error: "Block not found" },
        { status: 404 }
      );
    }

    // Update the block with re-rating score and mark as done
    const { error: updateError } = await supabaseAdmin
      .from('blocks')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        rerating_score: reratingScore
      })
      .eq('id', blockId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Failed to update block: ${updateError.message}`);
    }

    // Update user's topic confidence rating in user_topic_confidence
    const { error: ratingError } = await supabaseAdmin
      .from('user_topic_confidence')
      .upsert({
        user_id: userId,
        topic_id: block.topic_id,
        rating: reratingScore,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id,topic_id'
      });

    if (ratingError) {
      console.error('Failed to update topic confidence:', ratingError);
      // Don't fail the request - the block was already updated
    }

    // Determine what happens next based on re-rating
    let nextAction = {};
    
    if (reratingScore <= 3) {
      // Need more practice - scheduler will pick this up with new rating
      const sessionsNeeded = reratingScore === 1 ? 3 : reratingScore === 2 ? 2 : 1;
      nextAction = {
        type: 'reinforcement',
        sessionsNeeded,
        message: `Your confidence has been updated. ${sessionsNeeded} more session${sessionsNeeded > 1 ? 's' : ''} will be scheduled in your next plan.`
      };
    } else {
      // Mastered (4-5) - calculate maintenance review timing
      // Count consecutive high ratings for this topic to determine interval
      const { data: recentBlocks } = await supabaseAdmin
        .from('blocks')
        .select('rerating_score')
        .eq('user_id', userId)
        .eq('topic_id', block.topic_id)
        .not('rerating_score', 'is', null)
        .gte('rerating_score', 4)
        .order('completed_at', { ascending: false })
        .limit(5);
      
      const consecutiveSuccesses = recentBlocks?.length || 0;
      const daysUntilReview = getNextMaintenanceInterval(consecutiveSuccesses);
      
      nextAction = {
        type: 'maintenance',
        daysUntilReview,
        message: `Great job! This topic will be scheduled for a maintenance review in ${daysUntilReview} days to keep it fresh.`
      };
    }

    // Log the re-rating event
    const { error: logError } = await supabaseAdmin
      .from('logs')
      .insert({
        user_id: userId,
        event_type: 'topic_rerated',
        event_data: {
          block_id: blockId,
          topic_id: block.topic_id,
          rerating_score: reratingScore,
          session_number: block.session_number,
          session_total: block.session_total,
          next_action: nextAction
        }
      });

    if (logError) {
      console.error('🔄 Failed to log re-rating event:', logError);
    } else {
      console.log('🔄 Successfully logged re-rating event for topic:', block.topic_id);
    }

    console.log('🔄 Re-rating complete:', { 
      topicId: block.topic_id, 
      newRating: reratingScore, 
      nextAction 
    });

    return NextResponse.json({
      success: true,
      reratingScore,
      nextAction
    });
  } catch (error) {
    console.error("Re-rating error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process re-rating" },
      { status: 500 }
    );
  }
}

