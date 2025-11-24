# Markr Planner - Testing Checklist

## Pre-Deployment Testing

### 1. Environment Setup
- [ ] Create Supabase project
- [ ] Run database migrations (`supabase/migrations/001_initial_schema.sql`)
- [ ] Set up environment variables in `.env.local`
- [ ] Configure Stripe test mode
- [ ] Set up OpenAI API key

### 2. Authentication Flow
- [ ] Google OAuth sign-in works
- [ ] Email sign-in works (with Resend)
- [ ] User data is stored in Supabase `users` table
- [ ] JWT tokens contain correct user ID
- [ ] Sign-out works correctly

### 3. Payment Flow (Stripe Test Mode)
- [ ] Pricing page displays correctly
- [ ] Stripe checkout session creation works
- [ ] Payment completion triggers webhook
- [ ] Payment record is stored in `payments` table
- [ ] User entitlement is updated correctly
- [ ] Middleware blocks access before payment
- [ ] Middleware allows access after payment

### 4. Onboarding Flow
- [ ] Step 1: Subject selection works
- [ ] Step 2: Confidence rating works
- [ ] Step 3: Availability setting works
- [ ] Plan generation API works
- [ ] Redirect to plan page after completion
- [ ] Data is saved to Supabase correctly

### 5. Plan Dashboard
- [ ] Today view displays blocks correctly
- [ ] Week view displays blocks correctly
- [ ] Block actions (done/missed/skip) work
- [ ] Progress tracking updates
- [ ] Subject colors display correctly
- [ ] AI rationale tooltips work

### 6. AI Integration
- [ ] Setup summary generation works
- [ ] Block rationale generation works
- [ ] Weekly feedback generation works
- [ ] AI responses are stored in `user_insights` table
- [ ] Error handling for API failures

### 7. Scheduler Logic
- [ ] Plan generation algorithm works
- [ ] Time-of-day logic applies correctly
- [ ] Daily caps are enforced
- [ ] Subject variety is maintained
- [ ] Regeneration triggers work

### 8. Settings & Refunds
- [ ] Settings page displays user data
- [ ] Refund request works (test mode)
- [ ] Refund confirmation email sent
- [ ] Access is revoked after refund
- [ ] Privacy toggles work

### 9. Email Templates
- [ ] Welcome email sent after payment
- [ ] Weekly summary email works
- [ ] Refund confirmation email works
- [ ] Email templates render correctly

### 10. Mobile Responsiveness
- [ ] Landing page works on mobile
- [ ] Pricing page works on mobile
- [ ] Onboarding flow works on mobile
- [ ] Plan dashboard works on mobile
- [ ] Settings page works on mobile

### 11. Error Handling
- [ ] Network errors are handled gracefully
- [ ] API errors show user-friendly messages
- [ ] 404 pages work correctly
- [ ] 500 errors are logged properly

### 12. Performance
- [ ] Page load times are acceptable
- [ ] Database queries are optimized
- [ ] Images load quickly
- [ ] No memory leaks in client-side code

## Production Deployment Checklist

### 1. Supabase Production Setup
- [ ] Create production Supabase project
- [ ] Run migrations in production
- [ ] Enable RLS on all tables
- [ ] Create database indexes
- [ ] Set up monitoring

### 2. Stripe Production Setup
- [ ] Create production Stripe account
- [ ] Create product and price in Stripe Dashboard
- [ ] Configure webhook endpoint
- [ ] Test webhook in production
- [ ] Enable Apple Pay and Google Pay

### 3. Vercel Deployment
- [ ] Connect GitHub repository
- [ ] Set environment variables
- [ ] Deploy to production
- [ ] Configure custom domain
- [ ] Set up Vercel Cron for weekly regeneration

### 4. Domain & SSL
- [ ] Configure custom domain
- [ ] SSL certificate is active
- [ ] HTTPS redirects work
- [ ] DNS propagation is complete

### 5. Monitoring & Analytics
- [ ] Set up error tracking (Sentry)
- [ ] Configure analytics (Vercel Analytics)
- [ ] Set up uptime monitoring
- [ ] Configure log aggregation

### 6. Security
- [ ] Environment variables are secure
- [ ] API keys are not exposed
- [ ] CORS is configured correctly
- [ ] Rate limiting is in place

### 7. Backup & Recovery
- [ ] Database backups are configured
- [ ] Recovery procedures are documented
- [ ] Data export functionality works

## Post-Launch Monitoring

### 1. Performance Monitoring
- [ ] Page load times
- [ ] API response times
- [ ] Database query performance
- [ ] Error rates

### 2. User Analytics
- [ ] User sign-ups
- [ ] Payment conversions
- [ ] Feature usage
- [ ] User retention

### 3. Business Metrics
- [ ] Revenue tracking
- [ ] Refund rates
- [ ] Customer support tickets
- [ ] User feedback

## Testing Commands

```bash
# Generate CSV files
npm run generate-csvs

# Import specs to Supabase
npm run import-specs

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Stripe
STRIPE_PUBLIC_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# OpenAI
OPENAI_API_KEY=

# Google OAuth (optional)
GOOGLE_ID=
GOOGLE_SECRET=

# Resend
RESEND_API_KEY=
```

## Common Issues & Solutions

### 1. Supabase Connection Issues
- Check environment variables
- Verify RLS policies
- Check network connectivity

### 2. Stripe Webhook Issues
- Verify webhook endpoint URL
- Check webhook secret
- Test with Stripe CLI

### 3. NextAuth Issues
- Check NEXTAUTH_SECRET
- Verify callback URLs
- Check provider configuration

### 4. OpenAI API Issues
- Check API key validity
- Monitor rate limits
- Handle API errors gracefully

### 5. Build Issues
- Check for TypeScript errors
- Verify all imports
- Check environment variables


