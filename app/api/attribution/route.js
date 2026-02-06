import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const UTM_COOKIE_NAME = "reviseme_utm";

/**
 * GET /api/attribution
 * When the user is logged in and has a UTM cookie (set by middleware when they landed with utm_ params),
 * save attribution to their user record and clear the cookie.
 * Called once from the client after session is available.
 */
export async function GET(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: true, attributed: false });
    }

    const cookie = request.cookies.get(UTM_COOKIE_NAME)?.value;
    if (!cookie) {
      return NextResponse.json({ ok: true, attributed: false });
    }

    let utm;
    try {
      utm = JSON.parse(cookie);
    } catch {
      return NextResponse.json({ ok: true, attributed: false });
    }

    const { utm_source, utm_medium, utm_campaign } = utm;
    if (!utm_source && !utm_medium && !utm_campaign) {
      return NextResponse.json({ ok: true, attributed: false });
    }

    const { error } = await supabaseAdmin.from("users").update({
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_captured_at: new Date().toISOString(),
    }).eq("id", userId);

    if (error) {
      console.error("[attribution] Failed to update user:", error);
      return NextResponse.json({ ok: false, error: "Failed to save attribution" }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true, attributed: true });
    response.cookies.set(UTM_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
    return response;
  } catch (err) {
    console.error("[attribution]", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
