import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

export async function GET(req) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get user payments
    const { data: payments, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payments:', error);
      return NextResponse.json(
        { error: "Failed to fetch payments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: payments || [] });
  } catch (error) {
    console.error("Payments API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

