import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

/**
 * Dev-only dashboard API - returns aggregated stats and user data for informed product decisions.
 * Only available when NODE_ENV === 'development'.
 * GET /api/dev/dashboard
 */
export async function GET() {
  try {
    // Strict: only in development
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { error: "Dashboard only available in development" },
        { status: 403 }
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Fetch all users with pagination (Supabase defaults to 1000 rows max per query)
    const PAGE_SIZE = 1000;
    let usersRaw = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabaseAdmin
        .from("users")
        .select(
          "id, email, name, created_at, has_access, has_completed_onboarding, onboarding_data, utm_source, utm_medium, utm_campaign, utm_captured_at, reached_payment_at"
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      usersRaw = usersRaw.concat(data || []);
      hasMore = (data?.length ?? 0) === PAGE_SIZE;
      page++;
    }

    // Fetch remaining data in parallel
    const [
      logsRes,
      blocksRes,
      paymentsRes,
      refundLogsRes,
      cronLogsRes,
      userStatsRes,
      sessionsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("logs")
        .select("id, user_id, event_type, event_data, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("blocks")
        .select("user_id, status, completed_at"),
      supabaseAdmin
        .from("payments")
        .select("user_id, amount, status, paid_at, refunded_at, created_at"),
      supabaseAdmin
        .from("logs")
        .select("id, user_id, event_type, event_data, created_at")
        .eq("event_type", "refund_requested")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("logs")
        .select("id, event_type, event_data, created_at")
        .eq("event_type", "cron_weekly_regen")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin.from("user_stats").select("*"),
      supabaseAdmin
        .from("sessions")
        .select("user_id")
        .gt("expires", new Date().toISOString()),
    ]);

    // Deduplicate by user id - count distinct users only
    const uniqueUsersById = new Map();
    usersRaw.forEach((u) => {
      if (u?.id && !uniqueUsersById.has(u.id)) {
        uniqueUsersById.set(u.id, u);
      }
    });
    const IGNORE_EMAIL = "appmarkrai@gmail.com";
    const allUsersArr = Array.from(uniqueUsersById.values());
    const ignoredUserId = allUsersArr.find(
      (u) => (u.email || "").toLowerCase() === IGNORE_EMAIL
    )?.id;
    const users = allUsersArr.filter(
      (u) => (u.email || "").toLowerCase() !== IGNORE_EMAIL
    );
    const logs = logsRes.data || [];
    const blocksRaw = blocksRes.data || [];
    const paymentsRaw = paymentsRes.data || [];
    const blocks = ignoredUserId
      ? blocksRaw.filter((b) => b.user_id !== ignoredUserId)
      : blocksRaw;
    const payments = ignoredUserId
      ? paymentsRaw.filter((p) => p.user_id !== ignoredUserId)
      : paymentsRaw;
    const refundLogs = refundLogsRes.data || [];
    const cronLogs = cronLogsRes.data || [];
    const userStatsRows = userStatsRes.data || [];
    const sessions = sessionsRes.data || [];

    // Build user_id -> stats map from user_stats view
    const statsByUser = {};
    userStatsRows.forEach((row) => {
      statsByUser[row.user_id] = {
        blocks_done: row.blocks_done || 0,
        blocks_missed: row.blocks_missed || 0,
        blocks_scheduled: row.blocks_scheduled || 0,
        avg_confidence: row.avg_confidence,
        active_days: row.active_days || 0,
        last_activity: row.last_activity,
      };
    });

    // Aggregate blocks by user (in case user_stats is empty or missing users)
    const blockCounts = {};
    blocks.forEach((b) => {
      if (!blockCounts[b.user_id]) {
        blockCounts[b.user_id] = { done: 0, missed: 0, skipped: 0, scheduled: 0 };
      }
      blockCounts[b.user_id][b.status] = (blockCounts[b.user_id][b.status] || 0) + 1;
    });

    // Event counts per user from logs
    const eventCountsByUser = {};
    const lastEventByUser = {};
    logs.forEach((log) => {
      if (log.user_id) {
        if (!eventCountsByUser[log.user_id]) {
          eventCountsByUser[log.user_id] = {};
        }
        eventCountsByUser[log.user_id][log.event_type] =
          (eventCountsByUser[log.user_id][log.event_type] || 0) + 1;
        const ts = new Date(log.created_at).getTime();
        if (
          !lastEventByUser[log.user_id] ||
          ts > new Date(lastEventByUser[log.user_id]).getTime()
        ) {
          lastEventByUser[log.user_id] = log.created_at;
        }
      }
    });

    // Active session count per user (proxy for "currently logged in")
    const activeSessionsByUser = {};
    sessions.forEach((s) => {
      activeSessionsByUser[s.user_id] = (activeSessionsByUser[s.user_id] || 0) + 1;
    });

    // Payment aggregates per user (including earliest paid date for guarantee window)
    const paymentByUser = {};
    let totalRevenue = 0;
    let totalRefunded = 0;
    payments.forEach((p) => {
      if (!paymentByUser[p.user_id]) {
        paymentByUser[p.user_id] = { paid: 0, refunded: 0, count: 0, earliest_paid_at: null };
      }
      if (p.status === "paid") {
        paymentByUser[p.user_id].paid += p.amount || 0;
        paymentByUser[p.user_id].count += 1;
        totalRevenue += p.amount || 0;
        const paidAt = p.paid_at || p.created_at;
        if (paidAt) {
          const current = paymentByUser[p.user_id].earliest_paid_at;
          if (!current || new Date(paidAt) < new Date(current)) {
            paymentByUser[p.user_id].earliest_paid_at = paidAt;
          }
        }
      }
      if (p.status === "refunded" || p.refunded_at) {
        paymentByUser[p.user_id].refunded += p.amount || 0;
        totalRefunded += p.amount || 0;
      }
    });

    // Build enriched user list
    const usersWithStats = users.map((u) => {
      const stats = statsByUser[u.id] || {};
      const bc = blockCounts[u.id] || {};
      const events = eventCountsByUser[u.id] || {};
      const pay = paymentByUser[u.id] || { paid: 0, refunded: 0, count: 0, earliest_paid_at: null };
      const totalEvents =
        Object.values(events).reduce((a, b) => a + b, 0) || 0;
      const lastActivity =
        lastEventByUser[u.id] ||
        stats.last_activity ||
        (blocks.find((b) => b.user_id === u.id && b.completed_at)
          ? blocks
              .filter((b) => b.user_id === u.id && b.completed_at)
              .sort(
                (a, b) =>
                  new Date(b.completed_at) - new Date(a.completed_at)
              )[0]?.completed_at
          : null);

      const onboardingData = u.onboarding_data || {};
      const referralSource = onboardingData.referral_source || null;

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        created_at: u.created_at,
        has_access: u.has_access,
        has_completed_onboarding: u.has_completed_onboarding,
        referral_source: referralSource,
        utm_source: u.utm_source ?? null,
        utm_medium: u.utm_medium ?? null,
        utm_campaign: u.utm_campaign ?? null,
        utm_captured_at: u.utm_captured_at ?? null,
        reached_payment_at: u.reached_payment_at ?? null,
        // Stats
        blocks_done: stats.blocks_done ?? bc.done ?? 0,
        blocks_missed: stats.blocks_missed ?? bc.missed ?? 0,
        blocks_skipped: bc.skipped ?? 0,
        blocks_scheduled: stats.blocks_scheduled ?? bc.scheduled ?? 0,
        active_days: stats.active_days ?? 0,
        total_activity_events: totalEvents,
        last_activity: lastActivity,
        payments_count: pay.count,
        total_paid_pence: pay.paid,
        total_refunded_pence: pay.refunded,
        earliest_paid_at: pay.earliest_paid_at,
        active_sessions: activeSessionsByUser[u.id] || 0,
      };
    });

    // Refund feedback for display (exclude ignored user)
    const refundFeedback = refundLogs
      .filter((l) => !ignoredUserId || l.user_id !== ignoredUserId)
      .map((l) => ({
      id: l.id,
      user_id: l.user_id,
      feedback: l.event_data?.feedback || "(no feedback)",
      amount: l.event_data?.amount,
      referral_source: l.event_data?.referral_source,
      created_at: l.created_at,
    }));

    // Recent activity stream (last 50, with user email, exclude ignored user)
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const recentActivity = logs
      .filter((l) => !ignoredUserId || l.user_id !== ignoredUserId)
      .slice(0, 50)
      .map((l) => ({
      id: l.id,
      user_id: l.user_id,
      user_email: userMap[l.user_id]?.email || "(unknown)",
      event_type: l.event_type,
      event_data: l.event_data,
      created_at: l.created_at,
    }));

    // Derived metrics
    // Paying = paid and NOT refunded (excludes users who have requested a refund)
    const payingUsersCount = usersWithStats.filter(
      (u) => u.total_paid_pence > 0 && (u.total_refunded_pence || 0) === 0
    ).length;
    const refundedUsersCount = usersWithStats.filter(
      (u) => (u.total_refunded_pence || 0) > 0
    ).length;
    const everPaidUsersCount = payingUsersCount + refundedUsersCount;
    const netRevenuePence = totalRevenue - totalRefunded;
    const refundRatePct =
      everPaidUsersCount > 0
        ? (refundedUsersCount / everPaidUsersCount) * 100
        : 0;
    const PRICE_PENCE = 3000; // £30 - single plan price
    const currentRevenuePence = payingUsersCount * PRICE_PENCE;
    const avgRevenuePerPayingPence = PRICE_PENCE; // Single price = avg is always £30
    // Refund rate (revenue): % of total intake that was refunded
    // Denominator = current revenue (paying users × £30) + refunded (revenue that came in then went out)
    const totalIntakePence = currentRevenuePence + totalRefunded;
    const refundRevenueRatePct =
      totalIntakePence > 0 ? (totalRefunded / totalIntakePence) * 100 : 0;
    const conversionRatePct =
      users.length > 0 ? (payingUsersCount / users.length) * 100 : 0;
    const onboardedCount = users.filter(
      (u) => u.has_completed_onboarding
    ).length;
    // Reached payment (exclude already-paid: only users we tracked from implementation, who haven't paid)
    const reachedPaymentNotPaidCount = users.filter(
      (u) => u.reached_payment_at && !(u.total_paid_pence > 0)
    ).length;
    const reachedPaymentTotalCount = users.filter(
      (u) => u.reached_payment_at
    ).length;
    const reachedAndPaidCount = users.filter(
      (u) => u.reached_payment_at && u.total_paid_pence > 0
    ).length;
    const conversionFromReachedPaymentPct =
      reachedPaymentTotalCount > 0
        ? (reachedAndPaidCount / reachedPaymentTotalCount) * 100
        : 0;
    const conversionFromOnboardedPct =
      onboardedCount > 0 ? (payingUsersCount / onboardedCount) * 100 : 0;
    const totalBlocks = blocks.length;
    const blocksDone = blocks.filter((b) => b.status === "done").length;
    const completionRatePct =
      totalBlocks > 0 ? (blocksDone / totalBlocks) * 100 : 0;

    // Campaign attribution stats: by utm_campaign
    const campaignMap = {};
    usersWithStats.forEach((u) => {
      const campaign = u.utm_campaign || "(none)";
      if (!campaignMap[campaign]) {
        campaignMap[campaign] = { users: 0, paying: 0 };
      }
      campaignMap[campaign].users += 1;
      if (u.total_paid_pence > 0 && (u.total_refunded_pence || 0) === 0) {
        campaignMap[campaign].paying += 1;
      }
    });
    const campaign_stats = {
      by_campaign: Object.entries(campaignMap)
        .filter(([c]) => c !== "(none)")
        .map(([campaign, { users, paying }]) => ({
          campaign,
          users,
          paying,
          conversion_pct: users > 0 ? Math.round((paying / users) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.users - a.users),
      total_attributed: usersWithStats.filter((u) => u.utm_campaign).length,
    };

    return NextResponse.json({
      summary: {
        total_users: users.length,
        users_with_access: users.filter((u) => u.has_access).length,
        users_completed_onboarding: onboardedCount,
        reached_payment_count: reachedPaymentNotPaidCount,
        reached_payment_total_count: reachedPaymentTotalCount,
        reached_and_paid_count: reachedAndPaidCount,
        conversion_from_reached_payment_pct: Math.round(
          conversionFromReachedPaymentPct * 10
        ) / 10,
        total_revenue_pence: totalRevenue,
        total_refunded_pence: totalRefunded,
        current_revenue_pence: currentRevenuePence,
        refund_count: refundLogs.length,
        paying_users_count: payingUsersCount,
        refunded_users_count: refundedUsersCount,
        ever_paid_users_count: everPaidUsersCount,
        refund_rate_pct: Math.round(refundRatePct * 10) / 10,
        refund_revenue_rate_pct: Math.round(refundRevenueRatePct * 10) / 10,
        conversion_rate_pct: Math.round(conversionRatePct * 10) / 10,
        conversion_from_onboarded_pct: Math.round(
          conversionFromOnboardedPct * 10
        ) / 10,
        avg_revenue_per_paying_pence: Math.round(avgRevenuePerPayingPence),
        total_blocks: totalBlocks,
        blocks_done: blocksDone,
        blocks_missed: blocks.filter((b) => b.status === "missed").length,
        completion_rate_pct: Math.round(completionRatePct * 10) / 10,
        active_sessions_now: sessions.length,
      },
      users: usersWithStats,
      refund_feedback: refundFeedback,
      recent_activity: recentActivity,
      cron_history: cronLogs.map((c) => ({
        id: c.id,
        event_data: c.event_data,
        created_at: c.created_at,
      })),
      campaign_stats,
    });
  } catch (error) {
    console.error("Dev dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard", details: error.message },
      { status: 500 }
    );
  }
}
