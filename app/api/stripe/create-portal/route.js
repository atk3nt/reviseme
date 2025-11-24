import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { createCustomerPortal } from "@/libs/stripe";

export async function POST(req) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userId = session.user.id;

    if (!body.returnUrl) {
      return NextResponse.json(
        { error: "Return URL is required" },
        { status: 400 }
      );
    }

    // Get user from Supabase
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('customer_id')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    if (!user?.customer_id) {
      return NextResponse.json(
        {
          error:
            "You don't have a billing account yet. Make a purchase first.",
        },
        { status: 400 }
      );
    }

    const stripePortalUrl = await createCustomerPortal({
      customerId: user.customer_id,
      returnUrl: body.returnUrl,
    });

    return NextResponse.json({
      url: stripePortalUrl,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
