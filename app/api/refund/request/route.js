import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import Stripe from "stripe";
import { dailyLimit, checkRateLimit } from "@/libs/ratelimit";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check rate limit (5 requests per day)
    const rateLimitCheck = await checkRateLimit(dailyLimit, session.user.id);
    if (!rateLimitCheck.success) {
      console.log(`[RATE LIMIT] Refund request blocked for user ${session.user.id}`);
      return NextResponse.json(
        rateLimitCheck.response,
        { 
          status: 429,
          headers: rateLimitCheck.headers
        }
      );
    }

    const body = await req.json();
    const { paymentId, feedback } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // Validate feedback is provided
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length < 10) {
      return NextResponse.json(
        { error: "Feedback is required (minimum 10 characters)" },
        { status: 400 }
      );
    }

    // Get payment details and user info
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', session.user.id)
      .single();

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Get user details for email and extract referral source before cleanup
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email, name, onboarding_data')
      .eq('id', session.user.id)
      .single();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Extract referral source from onboarding_data before cleanup
    const referralSource = user.onboarding_data?.referral_source || null;

    if (payment.status !== 'paid') {
      return NextResponse.json(
        { error: "Payment is not eligible for refund" },
        { status: 400 }
      );
    }

    // Check if refund is within 7 days
    const paymentDate = new Date(payment.paid_at);
    const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSincePayment > 7) {
      return NextResponse.json(
        { error: "Refund period has expired (7 days)" },
        { status: 400 }
      );
    }

    // Always attempt to process refund through Stripe
    // This works for both test mode (cs_test_*) and live mode (cs_live_*) payments
    let refund;
    
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(payment.stripe_session_id);
      
      if (!checkoutSession.payment_intent) {
        return NextResponse.json(
          { error: "Payment intent not found for this payment" },
          { status: 400 }
        );
      }

      // Create Stripe refund using the payment intent ID
      refund = await stripe.refunds.create({
        payment_intent: checkoutSession.payment_intent,
        amount: payment.amount,
        reason: 'requested_by_customer'
      });
      
      console.log('✅ Stripe refund created:', refund.id);
    } catch (stripeError) {
      // Only skip Stripe refund if session doesn't exist (manually created test payment in DB)
      if (stripeError.code === 'resource_missing') {
        console.log('⚠️ Checkout session not found in Stripe - treating as manual test payment');
        refund = {
          id: `re_test_${Date.now()}`,
          amount: payment.amount,
          status: 'succeeded'
        };
      } else {
        // Re-throw any other Stripe errors
        console.error('❌ Stripe refund error:', stripeError);
        throw stripeError;
      }
    }

    // Update payment status
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString()
      })
      .eq('id', paymentId);

    // Clean up personal study data (hybrid approach)
    // Delete personal study data but preserve marketing/analytics data
    console.log('🧹 Cleaning up user study data for refund...');
    
    const userId = session.user.id;
    
    // Delete personal study data in parallel
    // Using Promise.allSettled so one failure doesn't stop others
    const cleanupPromises = [
      // Delete revision blocks
      supabaseAdmin.from('blocks').delete().eq('user_id', userId),
      // Delete topic ratings/confidence
      supabaseAdmin.from('user_topic_confidence').delete().eq('user_id', userId),
      supabaseAdmin.from('topic_ratings').delete().eq('user_id', userId),
      // Delete availability preferences
      supabaseAdmin.from('user_availability').delete().eq('user_id', userId),
      // Delete unavailable times
      supabaseAdmin.from('unavailable_times').delete().eq('user_id', userId),
      // Delete exam dates
      supabaseAdmin.from('user_exam_dates').delete().eq('user_id', userId),
      // Delete AI insights
      supabaseAdmin.from('user_insights').delete().eq('user_id', userId),
      // Delete time preferences
      supabaseAdmin.from('week_time_preferences').delete().eq('user_id', userId),
      // Delete repeatable events
      supabaseAdmin.from('repeatable_events').delete().eq('user_id', userId),
      // Delete availability confirmations
      supabaseAdmin.from('week_availability_confirmed').delete().eq('user_id', userId),
    ];

    // Execute cleanup (some tables might not exist, so we'll catch errors)
    const cleanupResults = await Promise.allSettled(cleanupPromises);
    
    // Log any errors but don't fail the refund
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`⚠️ Cleanup warning (table ${index}):`, result.reason?.message || result.reason);
      }
    });

    // Update user: revoke access and preserve only referral source in onboarding_data
    // Also reset time preference columns
    const updatedOnboardingData = referralSource 
      ? { referral_source: referralSource }
      : {};

    await supabaseAdmin
      .from('users')
      .update({
        has_access: false,
        onboarding_data: updatedOnboardingData, // Only keep referral source
        has_completed_onboarding: false, // Reset onboarding status
        // Reset time preferences to defaults
        weekday_earliest_time: '04:30',
        weekday_latest_time: '23:30',
        weekend_earliest_time: null,
        weekend_latest_time: null,
        use_same_weekend_times: true
      })
      .eq('id', userId);

    console.log('✅ User data cleaned up. Referral source preserved:', referralSource);

    // Log the event (include referral source and feedback for analytics)
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: session.user.id,
        event_type: 'refund_requested',
        event_data: {
          payment_id: paymentId,
          refund_id: refund.id,
          amount: payment.amount,
          referral_source: referralSource, // Preserve for analytics
          feedback: feedback.trim(), // Store user feedback
          data_cleaned: true // Indicates hybrid cleanup was performed
        }
      });

    console.log('📝 Refund feedback stored:', feedback.trim().substring(0, 50) + '...');

    // Send confirmation email
    try {
      const { sendRefundConfirmationEmail } = await import('@/libs/emails/refund-confirmation');
      const refundAmountInPounds = (payment.amount / 100).toFixed(2);
      const emailResult = await sendRefundConfirmationEmail(
        user.email,
        user.name || 'User',
        refundAmountInPounds,
        refund.id
      );
      
      if (emailResult?.success) {
        console.log('✅ Refund confirmation email sent successfully to:', user.email);
      } else {
        console.error('❌ Failed to send refund confirmation email:', emailResult?.error);
        console.error('   Email was attempted to:', user.email);
        console.error('   Check Resend dashboard and domain verification');
      }
    } catch (emailError) {
      // Log but don't fail the refund if email fails
      console.error('❌ Error sending refund confirmation email:', emailError);
      console.error('   Email was attempted to:', user.email);
      console.error('   Make sure RESEND_API_KEY is set and reviseme.co domain is verified in Resend');
    }

    return NextResponse.json({ 
      success: true, 
      refund_id: refund.id 
    });
  } catch (error) {
    console.error("Refund request error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process refund request" },
      { status: 500 }
    );
  }
}


