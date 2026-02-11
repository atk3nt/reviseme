import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { generalLimit, checkRateLimit } from "@/libs/ratelimit";

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

  if (!userId && process.env.NODE_ENV === 'development') {
    return await ensureDevUser();
  }

  return userId;
}

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;
const VALID_RATING_MIN = -2;
const VALID_RATING_MAX = 5;

export async function POST(req) {
  try {
    const userId = await resolveUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const rateLimitCheck = await checkRateLimit(generalLimit, userId);
    if (!rateLimitCheck.success) {
      return NextResponse.json(
        rateLimitCheck.response,
        { status: 429, headers: rateLimitCheck.headers }
      );
    }

    const body = await req.json();
    const ratings = body?.ratings;

    if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
      return NextResponse.json(
        { error: "Body must include ratings object: { [topicId]: number }" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const ratingEntries = Object.entries(ratings)
      .filter(([topicId, rating]) => {
        return (
          UUID_REGEX.test(topicId) &&
          rating !== undefined &&
          rating !== null &&
          Number.isInteger(rating) &&
          rating >= VALID_RATING_MIN &&
          rating <= VALID_RATING_MAX
        );
      })
      .map(([topicId, rating]) => ({
        user_id: userId,
        topic_id: topicId,
        rating: Number(rating),
        last_updated: now
      }));

    if (ratingEntries.length === 0) {
      return NextResponse.json({ success: true, savedCount: 0 });
    }

    const { error: upsertError } = await supabaseAdmin
      .from('user_topic_confidence')
      .upsert(ratingEntries, {
        onConflict: 'user_id,topic_id'
      });

    if (upsertError) {
      console.error('save-ratings-bulk error:', upsertError);
      return NextResponse.json(
        { error: "Failed to save ratings", details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      savedCount: ratingEntries.length
    });
  } catch (error) {
    console.error("Save ratings bulk error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save ratings" },
      { status: 500 }
    );
  }
}
