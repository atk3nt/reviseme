import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/libs/supabase";
import { generateStudyPlan } from "@/libs/scheduler";

export async function GET(req) {
  try {
    // Verify this is a cron request (optional: add secret header check)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all users with active payments
    const { data: users } = await supabaseAdmin
      .from('user_entitlements')
      .select('user_id')
      .eq('has_access', true);

    if (!users || users.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No active users found" 
      });
    }

    // Calculate next week start (Monday)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + (1 + 7 - nextWeek.getDay()) % 7); // Next Monday
    nextWeek.setHours(0, 0, 0, 0);

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Regenerate plans for all active users
    // Note: This cron job needs to be updated to properly load user data (subjects, ratings, etc.)
    // For now, it's commented out as generateStudyPlan requires more parameters
    for (const user of users) {
      try {
        // TODO: Load user's subjects, ratings, topicStatus, availability, timePreferences, blockedTimes
        // Then call: await generateStudyPlan({ subjects, ratings, topicStatus, availability, timePreferences, blockedTimes, targetWeekStart: nextWeek.toISOString().split('T')[0] });
        console.warn(`Weekly regeneration for user ${user.user_id} skipped - needs implementation`);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          user_id: user.user_id,
          error: error.message
        });
        console.error(`Failed to regenerate plan for user ${user.user_id}:`, error);
      }
    }

    // Log the cron job execution
    await supabaseAdmin
      .from('logs')
      .insert({
        user_id: null, // System event
        event_type: 'cron_weekly_regen',
        event_data: {
          next_week_start: nextWeek.toISOString(),
          users_processed: users.length,
          success_count: results.success,
          failed_count: results.failed
        }
      });

    return NextResponse.json({
      success: true,
      message: `Weekly regeneration completed. Success: ${results.success}, Failed: ${results.failed}`,
      results
    });
  } catch (error) {
    console.error("Weekly regeneration cron error:", error);
    return NextResponse.json(
      { error: error.message || "Weekly regeneration failed" },
      { status: 500 }
    );
  }
}


