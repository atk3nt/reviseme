import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'appmarkrai@gmail.com';

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

async function ensureDevUser() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', DEV_USER_EMAIL)
    .maybeSingle();

  if (!data && (!error || error.code === 'PGRST116')) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        email: DEV_USER_EMAIL,
        name: 'Dev Tester',
        has_completed_onboarding: false
      })
      .select('id, email')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    return created;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data;
}

async function resolveUser() {
  const session = await auth();
  
  if (session?.user?.id) {
    return { id: session.user.id, email: session.user.email };
  }

  // In dev mode, fall back to dev user
  if (process.env.NODE_ENV === 'development') {
    return await ensureDevUser();
  }

  return null;
}

/**
 * Endpoint to set has_access for dev testing and family members
 * Works in development mode OR for whitelisted family emails
 * POST /api/dev/set-access
 */
export async function POST(req) {
  try {
    const user = await resolveUser();
    
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if user is allowed (dev mode OR family email)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isFamilyMember = FAMILY_EMAILS.includes(user.email);
    
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
      .eq('id', user.id);

    if (error) {
      console.error('Error setting access:', error);
      return NextResponse.json(
        { error: "Failed to set access" },
        { status: 500 }
      );
    }

    console.log(`✅ Access granted to: ${user.email}${isFamilyMember ? ' (family member)' : ' (dev mode)'}`);

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



