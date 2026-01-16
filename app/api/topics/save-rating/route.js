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

  // In dev mode, use dev user if no session
  if (!userId && process.env.NODE_ENV === 'development') {
    return await ensureDevUser();
  }

  return userId;
}

export async function POST(req) {
  try {
    console.log('📝 Save rating API called');
    const userId = await resolveUserId();
    
    console.log('📝 User ID resolved:', userId);
    
    if (!userId) {
      console.error('❌ No user ID available');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { topicId, rating } = body;

    console.log('📝 Saving rating:', { topicId, rating, userId });

    if (!topicId) {
      console.error('❌ Topic ID missing');
      return NextResponse.json(
        { error: "Topic ID is required" },
        { status: 400 }
      );
    }

    // Handle undefined/null rating (delete the rating)
    if (rating === undefined || rating === null) {
      const { error: deleteError } = await supabaseAdmin
        .from('user_topic_confidence')
        .delete()
        .eq('user_id', userId)
        .eq('topic_id', topicId);

      if (deleteError) {
        console.error('Error deleting rating:', deleteError);
        return NextResponse.json(
          { error: "Failed to delete rating", details: deleteError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: "Rating deleted" });
    }

    // Upsert the rating (handles 0, -1, -2, and 1-5)
    const { error: upsertError } = await supabaseAdmin
      .from('user_topic_confidence')
      .upsert({
        user_id: userId,
        topic_id: topicId,
        rating: rating,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id,topic_id'
      });

    if (upsertError) {
      console.error('❌ Error saving rating:', upsertError);
      return NextResponse.json(
        { error: "Failed to save rating", details: upsertError.message },
        { status: 500 }
      );
    }

    console.log('✅ Rating saved successfully:', { topicId, rating, userId });

    // Log re-rating event for ratings 1-5 (valid reratings)
    // This ensures rerated topics are tracked and can be prioritized in next week's plan
    if (rating >= 1 && rating <= 5) {
      const { error: logError } = await supabaseAdmin
        .from('logs')
        .insert({
          user_id: userId,
          event_type: 'topic_rerated',
          event_data: {
            topic_id: topicId,
            rerating_score: rating,
            source: 'manual_rerate' // Distinguish from modal rerating
          }
        });

      if (logError) {
        console.error('📝 Failed to log re-rating event:', logError);
        // Don't fail the request - the rating was saved successfully
      } else {
        console.log('📝 Successfully logged re-rating event for topic:', topicId, 'with rating:', rating);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Rating saved",
      data: { topicId, rating, userId }
    });

  } catch (error) {
    console.error("Save rating error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save rating" },
      { status: 500 }
    );
  }
}

