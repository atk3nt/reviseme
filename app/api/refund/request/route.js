import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import Stripe from "stripe";

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

    const body = await req.json();
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // Get payment details
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

    // Create Stripe refund
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_session_id, // This should be the payment intent ID
      amount: payment.amount,
      reason: 'requested_by_customer'
    });

    // Update payment status
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString()
      })
      .eq('id', paymentId);

    // Log the event
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: session.user.id,
        event_type: 'refund_requested',
        event_data: {
          payment_id: paymentId,
          refund_id: refund.id,
          amount: payment.amount
        }
      });

    // TODO: Send confirmation email
    // await sendRefundConfirmationEmail(user.email, refund);

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


