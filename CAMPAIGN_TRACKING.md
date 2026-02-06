# Campaign attribution (UTM tracking)

When users land from an email (or any link) with UTM params, we store `utm_source`, `utm_medium`, and `utm_campaign` on their user record after they sign in. You can then query signups and conversions by campaign.

## Resend broadcast CTA link

Use this as the “Finish setup and get your plan” link in Resend (or any email). Replace the domain if needed.

**Example – email campaign 1 (non-paying signups):**

```
https://app.reviseme.co/onboarding/slide-1?utm_source=resend&utm_medium=email&utm_campaign=email-campaign-1
```

For other campaigns, keep `utm_source=resend` and `utm_medium=email`, and change `utm_campaign` (e.g. `email-campaign-2`, `re-engagement-mar-2025`).

## Querying results in Supabase

**Signups from a campaign (users who landed with that campaign and have an account):**

```sql
SELECT id, email, created_at, utm_source, utm_medium, utm_campaign, utm_captured_at
FROM users
WHERE utm_campaign = 'email-campaign-1'
ORDER BY utm_captured_at DESC;
```

**Paid conversions from a campaign:**

```sql
SELECT u.id, u.email, u.utm_captured_at, u.has_access
FROM users u
WHERE u.utm_campaign = 'email-campaign-1'
  AND u.has_access = true;
```

## How it works

1. User clicks the link in the email → lands on the app with UTM in the URL.
2. Middleware sets a cookie with the UTM params (7-day expiry).
3. After they sign in, the client calls `GET /api/attribution`, which reads the cookie, saves the UTM fields to their user row, and clears the cookie.

No env vars or external services required. Run the migration `014_add_utm_attribution.sql` in Supabase if you haven’t already.
