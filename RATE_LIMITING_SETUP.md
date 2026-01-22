# Rate Limiting Setup Guide

## Overview

Rate limiting has been implemented to protect your API endpoints from abuse, accidental overuse, and malicious attacks. This guide will help you set up Upstash Redis for rate limiting.

## What's Protected

The following endpoints now have rate limiting:

| Endpoint | Limit | Reason |
|----------|-------|--------|
| `/api/plan/generate` | 5 requests/hour | Expensive operation (plan generation) |
| `/api/stats` | 60 requests/hour | Can be slow with large datasets |
| `/api/plan/rerate` | 100 requests/hour | Frequent user action |
| `/api/topics/save-rating` | 100 requests/hour | Frequent during onboarding |

## Setup Instructions (5 minutes)

### Step 1: Create Upstash Account

1. Go to https://console.upstash.com/
2. Sign up with Google or GitHub (instant)
3. Verify your email if prompted

### Step 2: Create Redis Database

1. Click **"Create Database"** button
2. Configure your database:
   - **Name**: `reviseme-ratelimit` (or any name you prefer)
   - **Type**: Select **Regional** (free tier)
   - **Region**: Choose closest to your users
     - UK users: `eu-west-1` (Ireland)
     - US users: `us-east-1` (Virginia)
     - Other regions available
3. Click **"Create"**

### Step 3: Copy Credentials

On the database page, you'll see two important values:

1. **UPSTASH_REDIS_REST_URL**
   - Example: `https://your-db-name.upstash.io`
2. **UPSTASH_REDIS_REST_TOKEN**
   - Example: `AXasdfQWERTY...` (long token)

### Step 4: Add to Environment Variables

#### Local Development (.env.local)

Add these lines to your `.env.local` file:

```bash
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

#### Production (Vercel)

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add both variables:
   - Name: `UPSTASH_REDIS_REST_URL`
   - Value: `https://your-db-name.upstash.io`
   - Click **Add**
   
   - Name: `UPSTASH_REDIS_REST_TOKEN`
   - Value: Your token
   - Click **Add**

4. Redeploy your app for changes to take effect

### Step 5: Install Dependencies

Run this command in your terminal:

```bash
npm install @upstash/ratelimit @upstash/redis
```

### Step 6: Test It Works

1. Start your development server: `npm run dev`
2. Check the console for: `[RATE LIMIT] ✅ Rate limiting enabled`
3. Try generating a plan 6 times in a row
4. The 6th request should be blocked with: "Too many requests. Please try again in X minutes."

## How It Works

### Rate Limit Algorithm

We use **sliding window** rate limiting:
- Tracks requests over a rolling time window
- Smooth rate limiting (no sudden resets)
- Fair distribution of requests

### Example: Plan Generation (5 requests/hour)

```
Time:     10:00  10:15  10:30  10:45  11:00  11:15
Requests:   1      2      3      4      5      ❌
                                              (blocked)
```

At 11:00, the first request from 10:00 expires, allowing 1 new request.

### Graceful Degradation

If Upstash credentials are missing:
- Rate limiting is **disabled** (dev mode)
- Console shows: `⚠️ Rate limiting disabled - Upstash credentials not found`
- All requests are allowed
- Perfect for local development without setup

## Rate Limit Response

When a user hits the rate limit, they receive:

```json
{
  "error": "Too many requests. Please try again in 45 minutes.",
  "limit": 5,
  "remaining": 0,
  "reset": "2026-01-22T15:00:00.000Z",
  "retryAfter": 2700
}
```

HTTP Status: `429 Too Many Requests`

Headers:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1737558000000
Retry-After: 2700
```

## Monitoring

### Check Rate Limit Usage

1. Log into Upstash dashboard
2. Go to your database
3. Click **"Metrics"** tab
4. View:
   - Total requests
   - Commands per second
   - Memory usage

### Logs

Rate limit events are logged:
```
[RATE LIMIT] ✅ Rate limiting enabled
[RATE LIMIT] Plan generation blocked for user abc123
[RATE LIMIT] Stats blocked for user xyz789
```

## Adjusting Limits

To change rate limits, edit `libs/ratelimit.js`:

```javascript
export const planGenerationLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"), // Change 5 to 10
  analytics: true,
  prefix: "ratelimit:plan-generate",
});
```

Common adjustments:
- `5, "1 h"` → 5 requests per hour
- `10, "1 h"` → 10 requests per hour
- `100, "1 d"` → 100 requests per day
- `1, "1 m"` → 1 request per minute

## Troubleshooting

### Rate limiting not working

**Check 1: Credentials**
```bash
# In your terminal
echo $UPSTASH_REDIS_REST_URL
echo $UPSTASH_REDIS_REST_TOKEN
```

If empty, add to `.env.local` and restart server.

**Check 2: Console logs**
Look for: `[RATE LIMIT] ✅ Rate limiting enabled`

If you see: `⚠️ Rate limiting disabled`, credentials are missing.

**Check 3: Package installed**
```bash
npm list @upstash/ratelimit
```

If not found, run: `npm install @upstash/ratelimit @upstash/redis`

### "Connection refused" errors

- Check Upstash dashboard - database should be "Active"
- Verify URL and token are correct (no extra spaces)
- Check Upstash status page: https://status.upstash.com/

### Rate limit too strict

Users complaining about being blocked too often:
1. Check logs to see actual usage patterns
2. Adjust limits in `libs/ratelimit.js`
3. Consider different limits for different user tiers

## Cost & Limits

### Upstash Free Tier

- **10,000 commands/day** (plenty for most apps)
- **256 MB storage**
- **No credit card required**

### Typical Usage

- Plan generation: ~5 commands per request
- Stats: ~2 commands per request
- Rating save: ~2 commands per request

**Example:** 100 users × 10 requests/day = 1,000 requests = ~3,000 commands/day (well within free tier)

### Paid Plans

If you exceed free tier:
- **Pay-as-you-go**: $0.20 per 100K commands
- **Pro**: $10/month for 1M commands

## Security Best Practices

1. **Never commit credentials** - Keep `.env.local` in `.gitignore`
2. **Use different databases** - Separate dev/staging/production
3. **Monitor usage** - Set up alerts in Upstash dashboard
4. **Rotate tokens** - If compromised, regenerate in Upstash dashboard

## FAQ

**Q: Do I need Upstash for local development?**
A: No, rate limiting is disabled if credentials are missing. Perfect for dev.

**Q: What happens if Upstash is down?**
A: Requests are allowed (fail-open). Your app stays online.

**Q: Can I use a different Redis provider?**
A: Yes, but Upstash is optimized for serverless (Vercel). Others may require different setup.

**Q: How do I disable rate limiting temporarily?**
A: Remove the Upstash env variables. Rate limiting will auto-disable.

**Q: Can I rate limit by IP instead of user ID?**
A: Yes, modify the identifier in API routes:
```javascript
const identifier = req.headers.get('x-forwarded-for') || 'anonymous';
const rateLimitCheck = await checkRateLimit(generalLimit, identifier);
```

## Support

- Upstash docs: https://docs.upstash.com/redis
- Upstash Discord: https://discord.gg/upstash
- Rate limiting library: https://github.com/upstash/ratelimit

## Next Steps

After setup:
1. ✅ Test rate limiting in development
2. ✅ Deploy to production
3. ✅ Monitor usage in Upstash dashboard
4. ✅ Adjust limits based on real usage patterns

---

**Setup complete!** Your API is now protected from abuse and overuse.
