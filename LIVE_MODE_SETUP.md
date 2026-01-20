# Live Mode Setup Guide

This guide will help you switch from Stripe test mode to live mode for production.

## 📋 Checklist

- [ ] Get live Stripe API keys
- [ ] Create live product and price in Stripe
- [ ] Set up live webhook in Stripe
- [ ] Update Vercel environment variables
- [ ] Update config.js with live price ID
- [ ] Verify email domain in Resend
- [ ] Test with real payment
- [ ] Test refund flow

---

## 1. Stripe Live Mode Setup

### Step 1: Get Live API Keys

1. Go to https://dashboard.stripe.com
2. **Toggle OFF "Test mode"** (switch in top-right corner)
3. Navigate to **Developers → API keys**
4. Copy these keys:
   - **Publishable key**: `pk_live_...`
   - **Secret key**: `sk_live_...` (click "Reveal" to see it)

⚠️ **IMPORTANT**: Never commit these keys to git. Only add them to Vercel environment variables.

### Step 2: Create Live Product & Price

1. Still in live mode, go to **Products** in Stripe Dashboard
2. Click **Add product**
3. Fill in:
   - **Name**: Exam Season Pass
   - **Description**: AI-powered revision scheduling for A-Level students
   - **Pricing**: One-time payment
   - **Price**: £29.99 GBP
4. Click **Save product**
5. **Copy the Price ID** (looks like `price_1ABC...` - NOT `price_test_...`)

### Step 3: Set Up Live Webhook

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Configure:
   - **Endpoint URL**: `https://app.reviseme.co/api/webhook/stripe`
   - **Description**: ReviseMe production webhook
   - **Events to send**: Select these events:
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `customer.subscription.deleted`
     - `customer.subscription.updated`
     - `invoice.paid`
     - `invoice.payment_failed`
4. Click **Add endpoint**
5. **Copy the Signing secret** (starts with `whsec_...`)

---

## 2. Update Vercel Environment Variables

Go to: https://vercel.com/[your-team]/reviseme/settings/environment-variables

### Add/Update These Variables for Production:

| Variable Name | Value | Environment |
|--------------|-------|-------------|
| `STRIPE_PUBLIC_KEY` | `pk_live_...` (from Step 1) | Production |
| `STRIPE_SECRET_KEY` | `sk_live_...` (from Step 1) | Production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from Step 3) | Production |

**How to update:**
1. Find each variable in the list
2. Click the three dots → Edit
3. Update the value for **Production** environment only
4. Save

⚠️ **Keep test keys for Preview/Development** environments so local dev still works.

---

## 3. Update config.js

Open `config.js` and replace the live price ID:

```javascript
priceId:
  process.env.NODE_ENV === "development"
    ? "price_1Si3ZCAgE33YyUIxdlINuIXq" // Test mode (keep this)
    : "price_YOUR_LIVE_PRICE_ID_HERE",  // Replace with price ID from Step 2
```

**Then commit and push:**
```bash
git add config.js
git commit -m "Add live Stripe price ID for production"
git push
```

Vercel will automatically deploy the changes.

---

## 4. Email Domain Setup (Resend)

### Verify Domain

1. Go to https://resend.com/domains
2. Click **Add Domain**
3. Enter: `mail.reviseme.co` (or just `reviseme.co`)
4. Add the DNS records shown to your domain provider (Cloudflare, Namecheap, etc.)
5. Wait 5-10 minutes for verification

### DNS Records to Add

You'll need to add these records (exact values shown in Resend):
- **TXT record** for domain verification
- **MX records** for receiving emails (optional)
- **DKIM records** (TXT) for authentication

### Update config.js (Optional)

Once verified, you can update email addresses to use the verified domain:

```javascript
fromNoReply: `ReviseMe <noreply@mail.reviseme.co>`,
fromAdmin: `ReviseMe <hello@mail.reviseme.co>`,
fromAlex: `Alex from ReviseMe <alex@mail.reviseme.co>`,
```

---

## 5. Testing in Live Mode

### Test Payment Flow

1. Go to https://app.reviseme.co
2. Sign up with a test account
3. Complete onboarding
4. Go to pricing/checkout
5. **Use your own real card** (you'll get a refund)
6. Complete payment
7. Verify:
   - Payment appears in Stripe Dashboard (live mode)
   - User gets access in the app
   - Payment record created in database

### Test Refund Flow

1. Immediately after payment, open Support Modal
2. Click "Guarantee" button
3. Verify eligibility screen shows correct details
4. Click "Confirm Refund"
5. Verify:
   - Success message appears
   - Access is revoked
   - Refund appears in Stripe Dashboard → Refunds
   - Confirmation email is sent
   - Payment status updated to "refunded" in database

---

## 6. Environment Variables Reference

### Production (Vercel)

```bash
# Stripe Live Mode
STRIPE_PUBLIC_KEY=pk_live_your_key_here
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_live_webhook_secret

# Resend (same for all environments)
RESEND_API_KEY=re_your_api_key

# Supabase (should already be set)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# NextAuth (should already be set)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://app.reviseme.co

# Google OAuth (if using)
GOOGLE_ID=your_google_client_id
GOOGLE_SECRET=your_google_client_secret
```

### Local Development (.env.local)

Keep test keys for local development:

```bash
# Stripe Test Mode (keep these)
STRIPE_PUBLIC_KEY=pk_test_your_test_key
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_WEBHOOK_SECRET=whsec_test_your_test_webhook_secret

# Other variables same as production
```

---

## 7. Verification Checklist

After setup, verify everything works:

### Stripe
- [ ] Live keys added to Vercel (Production only)
- [ ] Live product created in Stripe
- [ ] Live price ID updated in config.js
- [ ] Webhook endpoint configured and active
- [ ] Webhook secret added to Vercel

### Payment Flow
- [ ] Can complete checkout with real card
- [ ] Payment appears in Stripe Dashboard (live mode)
- [ ] User gets access after payment
- [ ] Payment record created in database

### Refund Flow
- [ ] Can request refund within 7 days
- [ ] Refund processes through Stripe
- [ ] Refund appears in Stripe Dashboard
- [ ] User access is revoked
- [ ] Confirmation email is sent
- [ ] Payment status updated to "refunded"

### Email
- [ ] Domain verified in Resend
- [ ] DNS records added and verified
- [ ] Test emails are delivered

---

## 8. Troubleshooting

### "No such price" error
- Check that live price ID in config.js matches the one in Stripe Dashboard
- Make sure you're looking at live mode in Stripe, not test mode

### Webhook not receiving events
- Verify webhook URL is `https://app.reviseme.co/api/webhook/stripe`
- Check webhook signing secret matches in Vercel
- Look at webhook logs in Stripe Dashboard → Developers → Webhooks

### Refund not processing
- Check Stripe Dashboard → Logs for API errors
- Verify live secret key is set in Vercel
- Check server logs in Vercel → Deployments → [latest] → Logs

### Email not sending
- Verify domain is verified in Resend (green checkmark)
- Check DNS records are correct
- Look at Resend dashboard → Emails for delivery status

---

## 9. Going Back to Test Mode

If you need to test more before going live:

1. In Vercel, change environment variables back to test keys
2. In config.js, use test price ID for production:
   ```javascript
   priceId: "price_1Si3ZCAgE33YyUIxdlINuIXq"
   ```
3. Redeploy

---

## 10. Security Reminders

- ✅ Live keys are ONLY in Vercel environment variables
- ✅ Never commit live keys to git
- ✅ Never share live keys in Slack, email, etc.
- ✅ Use test mode for all development
- ✅ Test thoroughly before processing real customer payments

---

## Need Help?

- **Stripe Docs**: https://stripe.com/docs/payments/checkout
- **Vercel Docs**: https://vercel.com/docs/environment-variables
- **Resend Docs**: https://resend.com/docs

Good luck with your launch! 🚀
