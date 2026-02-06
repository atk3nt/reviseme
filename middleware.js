import { NextResponse } from "next/server";

const UTM_COOKIE_NAME = "reviseme_utm";
const UTM_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export function middleware(request) {
  const response = NextResponse.next();
  const { searchParams } = request.nextUrl;

  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");

  if (utmSource || utmMedium || utmCampaign) {
    const value = JSON.stringify({
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
    });
    response.cookies.set(UTM_COOKIE_NAME, value, {
      path: "/",
      maxAge: UTM_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and api routes
     * so we capture UTM on page landings (onboarding, signin, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
