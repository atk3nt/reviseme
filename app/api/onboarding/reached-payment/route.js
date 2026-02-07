import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

/**
 * Record when a user reaches the payment page (slide 17) for funnel analytics.
 * Only updates reached_payment_at if not already set (first time).
 * POST /api/onboarding/reached-payment
 */
export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get current user to check if already recorded
    const { data: user, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("id, reached_payment_at")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("reached-payment fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to check user" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only set reached_payment_at if not already set (first time they hit payment page)
    if (!user.reached_payment_at) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ reached_payment_at: new Date().toISOString() })
        .eq("id", userId);

      if (updateError) {
        console.error("reached-payment update error:", updateError);
        return NextResponse.json(
          { error: "Failed to record" },
          { status: 500 }
        );
      }

      // Log event for analytics
      await supabaseAdmin.from("logs").insert({
        user_id: userId,
        event_type: "reached_payment_page",
        event_data: { reached_at: new Date().toISOString() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("reached-payment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
