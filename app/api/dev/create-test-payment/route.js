import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

export async function POST(req) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if an eligible payment already exists (status = 'paid' and within 7 days)
    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPayment) {
      const paymentDate = new Date(existingPayment.paid_at);
      const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = 7 - daysSincePayment;
      
      if (daysRemaining > 0) {
        return NextResponse.json({ 
          success: true,
          message: 'Eligible payment already exists',
          payment: {
            id: existingPayment.id,
            amount: existingPayment.amount,
            daysRemaining,
            eligible: true
          }
        });
      }
      // If payment exists but expired, we'll create a new one below
    }

    // Create test payment
    const { data: newPayment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id: session.user.id,
        stripe_session_id: `cs_test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        stripe_customer_id: `cus_test_${Date.now()}`,
        amount: 2999, // £29.99 in pence
        currency: 'GBP',
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Error creating test payment:', paymentError);
      return NextResponse.json(
        { error: "Failed to create test payment", details: paymentError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: 'Test payment created successfully',
      payment: {
        id: newPayment.id,
        amount: newPayment.amount,
        amountInPounds: (newPayment.amount / 100).toFixed(2),
        status: newPayment.status,
        paidAt: newPayment.paid_at
      }
    });
  } catch (error) {
    console.error("Create test payment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create test payment" },
      { status: 500 }
    );
  }
}

