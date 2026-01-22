# Environment Variables Template

Copy this into your `.env.local` file for local development.

## How to Use

1. Create a file named `.env.local` in the root of your project (if it doesn't exist)
2. Copy the template below into it
3. Fill in your actual values
4. **NEVER commit `.env.local` to git** (it's already in `.gitignore`)

---

## .env.local Template

```bash
# ============================================
# STRIPE - Test Mode (for local development)
# ============================================
# Get these from: https://dashboard.stripe.com/test/apikeys
STRIPE_PUBLIC_KEY=pk_test_your_test_publishable_key_here
STRIPE_SECRET_KEY=sk_test_your_test_secret_key_here

# Get this from: https://dashboard.stripe.com/test/webhooks
# After creating a webhook endpoint for http://localhost:3000/api/webhook/stripe
STRIPE_WEBHOOK_SECRET=whsec_test_your_test_webhook_secret_here

# ============================================
# SUPABASE
# ============================================
# Get these from: https://supabase.com/dashboard/project/[your-project]/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key_here

# ============================================
# NEXTAUTH
# ============================================
# Generate a secret with: openssl rand -base64 32
NEXTAUTH_SECRET=your_nextauth_secret_here

# For local development
NEXTAUTH_URL=http://localhost:3000

# ============================================
# GOOGLE OAUTH (Optional)
# ============================================
# Get these from: https://console.cloud.google.com/apis/credentials
GOOGLE_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_SECRET=your_google_client_secret_here

# ============================================
# RESEND (Email)
# ============================================
# Get this from: https://resend.com/api-keys
RESEND_API_KEY=re_your_resend_api_key_here

# ============================================
# OPENAI (for AI features)
# ============================================
# Get this from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your_openai_api_key_here

# ============================================
# UPSTASH REDIS (Rate Limiting)
# ============================================
# Get these from: https://console.upstash.com/
# See RATE_LIMITING_SETUP.md for detailed setup instructions
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token_here
```

---

## Production Environment Variables (Vercel)

For production, set these in **Vercel Dashboard → Settings → Environment Variables**:

### Stripe (Live Mode)
```bash
STRIPE_PUBLIC_KEY=pk_live_your_live_publishable_key_here
STRIPE_SECRET_KEY=sk_live_your_live_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_live_webhook_secret_here
```

### NextAuth
```bash
NEXTAUTH_URL=https://app.reviseme.co
NEXTAUTH_SECRET=your_nextauth_secret_here
```

### All Other Variables
Same as local (Supabase, Resend, OpenAI, Google OAuth)

---

## Quick Setup Steps

### 1. Stripe Test Mode (Local Development)

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy **Publishable key** → `STRIPE_PUBLIC_KEY`
3. Copy **Secret key** → `STRIPE_SECRET_KEY`
4. Go to https://dashboard.stripe.com/test/webhooks
5. Add endpoint: `http://localhost:3000/api/webhook/stripe`
6. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 2. Stripe Live Mode (Production/Vercel)

1. Toggle OFF test mode in Stripe Dashboard
2. Go to https://dashboard.stripe.com/apikeys
3. Copy **Publishable key** → Add to Vercel
4. Copy **Secret key** → Add to Vercel
5. Go to https://dashboard.stripe.com/webhooks
6. Add endpoint: `https://app.reviseme.co/api/webhook/stripe`
7. Copy **Signing secret** → Add to Vercel

### 3. Supabase

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings → API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 4. NextAuth Secret

Generate a random secret:
```bash
openssl rand -base64 32
```

Copy the output → `NEXTAUTH_SECRET`

### 5. Google OAuth (Optional)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://app.reviseme.co/api/auth/callback/google` (production)
4. Copy:
   - **Client ID** → `GOOGLE_ID`
   - **Client Secret** → `GOOGLE_SECRET`

### 6. Resend

1. Go to https://resend.com/api-keys
2. Create API key
3. Copy → `RESEND_API_KEY`

### 7. OpenAI

1. Go to https://platform.openai.com/api-keys
2. Create API key
3. Copy → `OPENAI_API_KEY`

### 8. Upstash Redis (Rate Limiting)

1. Go to https://console.upstash.com/
2. Create account (free)
3. Create Redis database (Regional, free tier)
4. Copy:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST TOKEN** → `UPSTASH_REDIS_REST_TOKEN`
5. See `RATE_LIMITING_SETUP.md` for detailed instructions

**Note:** Rate limiting is optional for local development. If credentials are missing, rate limiting will be disabled automatically.

---

## Testing Your Setup

After setting up `.env.local`, test that everything works:

```bash
# Start dev server
npm run dev

# Test Stripe checkout
# Go to http://localhost:3000/pricing
# Use test card: 4242 4242 4242 4242

# Check webhook
# Use Stripe CLI: stripe listen --forward-to localhost:3000/api/webhook/stripe
```

---

## Security Notes

- ✅ `.env.local` is in `.gitignore` - never commit it
- ✅ Use **test keys** for local development
- ✅ Use **live keys** only in Vercel (production)
- ✅ Never share your secret keys
- ✅ Rotate keys if accidentally exposed

---

## Troubleshooting

### "Missing environment variable" error
- Check that `.env.local` exists in project root
- Check variable names match exactly (case-sensitive)
- Restart dev server after adding variables

### Stripe webhook not working locally
- Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhook/stripe`
- Use the webhook secret from Stripe CLI output

### "Invalid API key" error
- Check you're using the right mode (test vs live)
- Verify keys are copied correctly (no extra spaces)
- Check keys haven't expired or been revoked
