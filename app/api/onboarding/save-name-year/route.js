import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { moderateLimit, checkRateLimit } from "@/libs/ratelimit";

/**
 * Saves name and year to the user's onboarding_data as soon as they enter them on slide-9.
 * This captures leads for marketing (e.g. Year 12s to target when they're in Year 13)
 * regardless of whether they complete full onboarding.
 */
export async function POST(req) {
  try {
    const session = await auth();

    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "prelaunch";
    let userId = session?.user?.id;

    if (!userId && isDev) {
      const { data: devUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", "appmarkrai@gmail.com")
        .maybeSingle();
      userId = devUser?.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimitCheck = await checkRateLimit(moderateLimit, userId);
    if (!rateLimitCheck.success) {
      return NextResponse.json(rateLimitCheck.response, {
        status: 429,
        headers: rateLimitCheck.headers,
      });
    }

    const body = await req.json();
    const { name, year } = body;

    if (!name || !year) {
      return NextResponse.json(
        { error: "Name and year are required" },
        { status: 400 }
      );
    }

    if (!["Year 12", "Year 13"].includes(year)) {
      return NextResponse.json(
        { error: "Year must be Year 12 or Year 13" },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("onboarding_data")
      .eq("id", userId)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching user for save-name-year:", fetchError);
      return NextResponse.json(
        { error: "Failed to save" },
        { status: 500 }
      );
    }

    const current = existing?.onboarding_data || {};
    const updated = {
      ...current,
      name: String(name).trim(),
      year,
    };

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        onboarding_data: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating user onboarding_data:", updateError);
      return NextResponse.json(
        { error: "Failed to save" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("save-name-year error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save" },
      { status: 500 }
    );
  }
}
