import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

const DEV_USER_EMAIL = 'dev-test@markr.local';

async function ensureDevUser() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
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
      .select('id')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    return created?.id ?? null;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data?.id ?? null;
}

async function resolveUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId || process.env.NODE_ENV !== 'development') {
    return userId;
  }

  return await ensureDevUser();
}

export async function GET() {
  try {
    const userId = await resolveUserId();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get ALL blocks for this user (no date filter)
    const { data: allBlocks, error } = await supabaseAdmin
      .from('blocks')
      .select(`
        id,
        topic_id,
        scheduled_at,
        duration_minutes,
        status,
        created_at,
        topics(title, specs(subject, exam_board))
      `)
      .eq('user_id', userId)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('Error fetching blocks:', error);
      return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
    }

    // Also get user info
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, email, has_completed_onboarding, has_access')
      .eq('id', userId)
      .single();

    return NextResponse.json({
      success: true,
      userId,
      user: userData,
      totalBlocks: allBlocks?.length || 0,
      blocks: allBlocks?.map(block => ({
        id: block.id,
        topic: block.topics?.title || 'Unknown',
        subject: block.topics?.specs?.subject || 'Unknown',
        scheduled_at: block.scheduled_at,
        status: block.status,
        created_at: block.created_at,
        duration_minutes: block.duration_minutes
      })) || []
    });
  } catch (error) {
    console.error('Check blocks error:', error);
    return NextResponse.json({ error: 'Failed to check blocks' }, { status: 500 });
  }
}

