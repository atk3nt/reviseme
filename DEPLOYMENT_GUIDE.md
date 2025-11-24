# Markr Planner - Deployment Guide

## Prerequisites

- GitHub account
- Supabase account
- Stripe account
- Vercel account
- OpenAI account
- Domain name (optional)

## Step 1: Supabase Setup

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and enter project details
4. Set database password (save this securely)
5. Wait for project to be ready

### 1.2 Run Database Migrations
1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and run the migration
4. Verify all tables are created

### 1.3 Configure Authentication
1. Go to Authentication > Settings
2. Add your domain to "Site URL"
3. Add redirect URLs:
   - `https://yourdomain.com/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/email`
4. Enable Google provider if using

### 1.4 Get API Keys
1. Go to Settings > API
2. Copy:
   - Project URL
   - Anon public key
   - Service role key (keep secret)

## Step 2: Stripe Setup

### 2.1 Create Stripe Account
1. Go to [stripe.com](https://stripe.com)
2. Create account and complete verification
3. Switch to live mode when ready

### 2.2 Create Product
1. Go to Products in Stripe Dashboard
2. Click "Add product"
3. Name: "Exam Season Pass"
4. Description: "Jan–July 2026 • 7-day refund guarantee"
5. Price: £24.99 GBP, one-time payment
6. Save and copy the Price ID

### 2.3 Configure Webhooks
1. Go to Developers > Webhooks
2. Click "Add endpoint"
3. URL: `https://yourdomain.com/api/webhook/stripe`
4. Events to send:
   - `checkout.session.completed`
   - `checkout.session.expired`
5. Copy webhook signing secret

### 2.4 Enable Payment Methods
1. Go to Settings > Payment methods
2. Enable Apple Pay and Google Pay
3. Configure your business information

## Step 3: OpenAI Setup

### 3.1 Create OpenAI Account
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create account and add billing
3. Go to API Keys section
4. Create new secret key
5. Copy the key (keep secret)

## Step 4: Vercel Deployment

### 4.1 Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Choose Next.js framework

### 4.2 Configure Environment Variables
Add these in Vercel Dashboard > Settings > Environment Variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# NextAuth
NEXTAUTH_SECRET=your_random_secret_key
NEXTAUTH_URL=https://yourdomain.com

# Stripe
STRIPE_PUBLIC_KEY=your_stripe_public_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Google OAuth (optional)
GOOGLE_ID=your_google_client_id
GOOGLE_SECRET=your_google_client_secret

# Resend (for emails)
RESEND_API_KEY=your_resend_api_key
```

### 4.3 Deploy
1. Click "Deploy" in Vercel
2. Wait for deployment to complete
3. Note the deployment URL

### 4.4 Configure Custom Domain
1. Go to Settings > Domains
2. Add your custom domain
3. Configure DNS records as instructed
4. Wait for SSL certificate

## Step 5: Import Subject Data

### 5.1 Generate CSV Files
```bash
npm run generate-csvs
```

### 5.2 Import to Supabase
```bash
npm run import-specs
```

Or manually:
1. Go to Supabase Dashboard > Table Editor
2. Import CSV files to `specs` and `topics` tables
3. Verify data is imported correctly

## Step 6: Configure Cron Jobs

### 6.1 Vercel Cron
1. Go to Vercel Dashboard > Functions
2. The cron job is already configured in `vercel.json`
3. It will run every Sunday at 23:00 UTC

### 6.2 Test Cron Job
1. Go to Functions tab in Vercel
2. Find the weekly-regen function
3. Test it manually to ensure it works

## Step 7: Final Testing

### 7.1 Test Payment Flow
1. Go to your live site
2. Click "Get Markr Planner — £24.99"
3. Complete test payment
4. Verify webhook processes payment
5. Check user gets access

### 7.2 Test Onboarding
1. Sign in with test account
2. Complete all 3 onboarding steps
3. Verify plan is generated
4. Check all data is saved

### 7.3 Test Core Features
1. Mark blocks as done/missed
2. Check AI insights generate
3. Test settings page
4. Verify refund flow

## Step 8: Monitoring Setup

### 8.1 Error Tracking
1. Sign up for Sentry (optional)
2. Add Sentry to your project
3. Configure error reporting

### 8.2 Analytics
1. Vercel Analytics is enabled by default
2. Monitor page views and performance
3. Set up custom events if needed

### 8.3 Uptime Monitoring
1. Use UptimeRobot or similar
2. Monitor your main pages
3. Set up alerts for downtime

## Step 9: Launch Checklist

### 9.1 Pre-Launch
- [ ] All tests pass
- [ ] Payment flow works
- [ ] Database is populated
- [ ] Cron jobs are configured
- [ ] Monitoring is set up
- [ ] Domain is configured
- [ ] SSL certificate is active

### 9.2 Launch Day
- [ ] Deploy to production
- [ ] Test critical paths
- [ ] Monitor error logs
- [ ] Check payment processing
- [ ] Verify email delivery

### 9.3 Post-Launch
- [ ] Monitor user sign-ups
- [ ] Track payment conversions
- [ ] Respond to support requests
- [ ] Monitor performance metrics
- [ ] Plan marketing activities

## Troubleshooting

### Common Issues

1. **Supabase Connection Failed**
   - Check environment variables
   - Verify RLS policies
   - Check network connectivity

2. **Stripe Webhook Not Working**
   - Verify webhook URL
   - Check webhook secret
   - Test with Stripe CLI

3. **NextAuth Issues**
   - Check NEXTAUTH_SECRET
   - Verify callback URLs
   - Check provider configuration

4. **Build Failures**
   - Check for TypeScript errors
   - Verify all imports
   - Check environment variables

5. **Cron Job Not Running**
   - Check Vercel function logs
   - Verify cron schedule
   - Test function manually

### Getting Help

1. Check Vercel function logs
2. Check Supabase logs
3. Check Stripe webhook logs
4. Review error tracking (if configured)
5. Check browser console for client errors

## Maintenance

### Regular Tasks
- Monitor error rates
- Check payment processing
- Review user feedback
- Update dependencies
- Backup database

### Weekly Tasks
- Check cron job execution
- Review analytics
- Monitor performance
- Check for security updates

### Monthly Tasks
- Review user growth
- Analyze conversion rates
- Plan feature updates
- Review costs and billing


