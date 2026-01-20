# Family Access Setup Guide

This guide explains how to grant free access to family members without requiring payment.

## Overview

The family access feature allows you to whitelist specific email addresses that can activate free access to the app through a special activation page.

## How It Works

1. Family members sign up normally through the app
2. They visit the special `/family` activation page
3. They click "Activate My Family Access"
4. If their email is whitelisted, they get instant access
5. When they continue onboarding and reach Slide 17 (payment page), it auto-skips to Slide 19

## Setup Instructions

### Step 1: Add Family Emails to Whitelist

Open the file: `app/api/dev/set-access/route.js`

Find the `FAMILY_EMAILS` array at the top of the file (around line 9):

```javascript
const FAMILY_EMAILS = [
  // Add family member emails here (one per line)
  // 'example@email.com',
];
```

**Add your family member emails like this:**

```javascript
const FAMILY_EMAILS = [
  'mom@example.com',
  'brother@example.com',
  'sister@example.com',
];
```

**Important:**
- Use the exact email they will sign up with
- Include quotes around each email
- Add a comma after each email (except the last one)
- Emails are case-insensitive

### Step 2: Deploy Changes

After adding emails to the whitelist:

```bash
# Commit the changes
git add app/api/dev/set-access/route.js
git commit -m "Add family members to access whitelist"

# Push to deploy
git push origin main
```

Vercel will automatically deploy your changes.

### Step 3: Share Instructions with Family

Send them these instructions:

---

**For Family Members:**

1. Go to: **app.reviseme.co/family**
2. Click "Sign In" 
3. Enter your email (the one that was whitelisted)
4. Check your email for the magic link
5. Click the magic link to sign in
6. You'll return to the family page
7. Click "Activate My Family Access"
8. You'll see "✅ Access granted!"
9. Continue to onboarding
10. Complete the onboarding flow - the payment page will be automatically skipped

---

## User Flow Diagram

```
1. Visit app.reviseme.co/family
   ↓
2. Click "Sign In" → Enter email → Get magic link
   ↓
3. Click magic link → Return to /family page
   ↓
4. Click "Activate My Family Access"
   ↓
5. Access granted ✅ (has_access = true in database)
   ↓
6. Redirected to /onboarding/slide-1
   ↓
7. Complete onboarding slides 1-16
   ↓
8. Reach Slide 17 (payment page) → AUTO-SKIPS to Slide 19
   ↓
9. Continue onboarding normally (Slides 19-22)
   ↓
10. Access full app features
```

## Adding New Family Members

To add more family members later:

1. Edit `app/api/dev/set-access/route.js`
2. Add their email to the `FAMILY_EMAILS` array
3. Commit and push to deploy
4. Send them the family activation link

## Removing Family Members

To revoke family access:

### Option 1: Remove from Whitelist (prevents future activations)
1. Remove their email from `FAMILY_EMAILS` array
2. Deploy changes

**Note:** This doesn't revoke existing access, only prevents future activations.

### Option 2: Revoke Database Access (removes existing access)

Run this SQL in Supabase SQL Editor:

```sql
UPDATE users 
SET has_access = false 
WHERE email = 'member@example.com';
```

This immediately revokes their access.

## Troubleshooting

### "Your email is not on the family access list"

**Problem:** The email they're using doesn't match the whitelist

**Solution:**
1. Check they're using the exact email you whitelisted
2. Check for typos in the `FAMILY_EMAILS` array
3. Make sure changes are deployed to production

### "Not authorized" error

**Problem:** Same as above - email not whitelisted

**Solution:** Add their email to `FAMILY_EMAILS` and redeploy

### Family member still sees payment page

**Problem:** They didn't activate family access before reaching Slide 17

**Solution:**
1. Have them go back to app.reviseme.co/family
2. Activate their access
3. Continue onboarding - Slide 17 will auto-skip

## Security Notes

- Only emails in the `FAMILY_EMAILS` array can activate access
- The endpoint requires authentication (can't be exploited)
- Family members still go through normal onboarding (just skip payment)
- Family accounts have identical features to paid accounts
- If a family member requests a refund, they lose access (standard flow)

## Testing Locally

When developing locally (`localhost:3000`):
- The `/family` page works
- Any authenticated user can activate access (dev mode)
- Family whitelist still applies in production

## Production URLs

- **Family activation page:** app.reviseme.co/family
- **Onboarding:** app.reviseme.co/onboarding/slide-1
- **Marketing site:** reviseme.co

## Support

If family members have issues:
1. Check they're using the whitelisted email
2. Check changes are deployed to Vercel
3. Check Vercel logs for any errors
4. Manually grant access via SQL if needed:

```sql
UPDATE users 
SET has_access = true 
WHERE email = 'member@example.com';
```

---

## Quick Reference

**Add family member:**
1. Add email to `FAMILY_EMAILS` in `app/api/dev/set-access/route.js`
2. Git commit + push
3. Share link: app.reviseme.co/family

**Remove family member:**
```sql
UPDATE users SET has_access = false WHERE email = 'member@example.com';
```

**Check if someone has access:**
```sql
SELECT email, has_access FROM users WHERE email = 'member@example.com';
```
