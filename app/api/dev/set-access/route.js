import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

/**
 * Family Access Whitelist
 * Add family member emails here to grant them free access
 * Example: ['mom@example.com', 'brother@example.com']
 */
const FAMILY_EMAILS = [
  'ppk3nt@gmail.com',
  'jmk3nt@gmail.com',
  'owk3nt@gmail.com',
  'atk3nt@gmail.com',
]; 

/**
 * Endpoint to set has_access for dev testing and family members
 * Works in development mode OR for whitelisted family emails
 * POST /api/dev/set-access
 */
export async function POST(req) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if user is allowed (dev mode OR family email)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isFamilyMember = FAMILY_EMAILS.includes(session.user.email);
    
    if (!isDevelopment && !isFamilyMember) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Set has_access to true
    const { error } = await supabaseAdmin
      .from('users')
      .update({ has_access: true })
      .eq('id', session.user.id);

    if (error) {
      console.error('Error setting access:', error);
      return NextResponse.json(
        { error: "Failed to set access" },
        { status: 500 }
      );
    }

    console.log(`✅ Access granted to: ${session.user.email}${isFamilyMember ? ' (family member)' : ' (dev mode)'}`);

    return NextResponse.json({
      success: true,
      message: "Access granted"
    });

  } catch (error) {
    console.error('Error in set-access:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



