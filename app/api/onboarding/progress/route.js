import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { moderateLimit, checkRateLimit } from "@/libs/ratelimit";

const VALID_SLIDE_MIN = 1;
const VALID_SLIDE_MAX = 23;

export async function POST(req) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const rateLimitCheck = await checkRateLimit(moderateLimit, userId);
    if (!rateLimitCheck.success) {
      console.log(`[RATE LIMIT] Onboarding progress blocked for user ${userId}`);
      return NextResponse.json(
        rateLimitCheck.response,
        { status: 429, headers: rateLimitCheck.headers }
      );
    }

    const body = await req.json();
    const rawSlide = body.maxUnlockedSlide ?? body.max_unlocked_slide;
    const slideNumber = rawSlide != null ? Number(rawSlide) : NaN;

    if (Number.isNaN(slideNumber) || slideNumber < VALID_SLIDE_MIN || slideNumber > VALID_SLIDE_MAX) {
      return NextResponse.json(
        { error: "Invalid maxUnlockedSlide" },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("onboarding_data")
      .eq("id", userId)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching user for progress:", fetchError);
      return NextResponse.json(
        { error: "Failed to update progress" },
        { status: 500 }
      );
    }

    const current = existing?.onboarding_data || {};
    const currentMax = current.max_unlocked_slide ?? current.maxUnlockedSlide ?? 0;
    if (slideNumber <= currentMax) {
      return NextResponse.json({ success: true, maxUnlockedSlide: currentMax });
    }

    const updated = {
      ...current,
      max_unlocked_slide: slideNumber,
      maxUnlockedSlide: slideNumber,
    };

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        onboarding_data: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating onboarding progress:", updateError);
      return NextResponse.json(
        { error: "Failed to update progress" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, maxUnlockedSlide: slideNumber });
  } catch (error) {
    console.error("Onboarding progress error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save progress" },
      { status: 500 }
    );
  }
}
