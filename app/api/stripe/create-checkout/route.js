import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/libs/auth";
import { createCheckout } from "@/libs/stripe";
import { supabaseAdmin } from "@/libs/supabase";
import { checkoutLimit, checkRateLimit } from "@/libs/ratelimit";

// This function is used to create a Stripe Checkout Session (one-time payment or subscription)
// It's called by slide-17 to initiate payment flow
export async function POST(req) {
  const body = await req.json();

  if (!body.priceId) {
    return NextResponse.json(
      { error: "Price ID is required" },
      { status: 400 }
    );
  } else if (!body.successUrl || !body.cancelUrl) {
    return NextResponse.json(
      { error: "Success and cancel URLs are required" },
      { status: 400 }
    );
  }

  try {
    const session = await auth();

    // Check rate limit (20 requests per hour)
    const userId = session?.user?.id || 'anonymous';
    const rateLimitCheck = await checkRateLimit(checkoutLimit, userId);
    if (!rateLimitCheck.success) {
      console.log(`[RATE LIMIT] Checkout blocked for user ${userId}`);
      return NextResponse.json(
        rateLimitCheck.response,
        { 
          status: 429,
          headers: rateLimitCheck.headers
        }
      );
    }

    // Get user from Supabase
    let user = null;
    if (session?.user?.id) {
      const { data: userData, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user:', error);
      } else {
        user = userData;
      }
    }

    const { priceId, successUrl, cancelUrl } = body;
    
    // For one-time payment, mode is always 'payment'
    const mode = 'payment';

    // Get DataFast cookies for revenue attribution
    const cookieStore = await cookies();
    const datafastVisitorId = cookieStore.get('datafast_visitor_id')?.value;
    const datafastSessionId = cookieStore.get('datafast_session_id')?.value;

    const stripeSessionURL = await createCheckout({
      priceId,
      mode,
      successUrl,
      cancelUrl,
      // Pass user ID to the Stripe Session so it can be retrieved in the webhook
      clientReferenceId: user?.id || session?.user?.id,
      // Prefill Checkout data with user email for faster checkout
      user: user ? {
        email: user.email,
        name: user.name,
        customerId: user.customer_id
      } : null,
      // Pass DataFast metadata for revenue attribution
      metadata: {
        ...(datafastVisitorId && { datafast_visitor_id: datafastVisitorId }),
        ...(datafastSessionId && { datafast_session_id: datafastSessionId }),
      },
    });

    return NextResponse.json({ url: stripeSessionURL });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
