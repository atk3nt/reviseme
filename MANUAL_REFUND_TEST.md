# Manual Refund Testing Guide

## Step 1: Create Test Payment

Since you're in Stripe test mode and don't see a payment, you have two options:

### Option A: Create Payment Through App (Recommended)

1. **Sign in** with `testing@reviseme.co`
2. **Go through onboarding** (if not done already)
3. **Go to pricing/checkout page**
4. **Complete test payment** using Stripe test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/25`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
5. **Complete checkout** - This will:
   - Create payment in Stripe test mode
   - Trigger webhook (if configured)
   - Create payment record in database

### Option B: Manually Create Payment in Database (Faster)

Run this SQL in Supabase SQL Editor:

```sql
-- First, get your user ID
SELECT id, email FROM users WHERE email = 'testing@reviseme.co';

-- Then insert a test payment (replace USER_ID with actual ID from above)
INSERT INTO payments (
  user_id,
  stripe_session_id,
  stripe_customer_id,
  amount,
  currency,
  status,
  paid_at
) VALUES (
  'USER_ID_HERE',  -- Replace with your user ID
  'cs_test_' || extract(epoch from now())::text,  -- Fake session ID
  'cus_test_' || extract(epoch from now())::text,  -- Fake customer ID
  2499,  -- £24.99 in pence
  'GBP',
  'paid',
  NOW()  -- Payment made just now
);

-- Verify payment was created
SELECT * FROM payments WHERE user_id = 'USER_ID_HERE';
```

**Note:** This creates a payment record but NOT a real Stripe payment. For full testing, you'll need to create a real Stripe payment intent or use Option A.

---

## Step 2: Create Real Stripe Payment Intent (For Full Testing)

If you want to test the actual Stripe refund (not just the database), create a payment intent:

### Using Stripe Dashboard:
1. Go to https://dashboard.stripe.com/test/payments
2. Click "Create payment"
3. Enter:
   - Amount: £24.99
   - Currency: GBP
   - Customer: Create new or use existing
   - Payment method: Use test card `4242 4242 4242 4242`
4. Complete the payment
5. Copy the Payment Intent ID (starts with `pi_`)

### Update Database with Real Payment Intent:
```sql
-- Update your payment record with real Stripe payment intent ID
UPDATE payments 
SET stripe_session_id = 'pi_YOUR_PAYMENT_INTENT_ID_HERE'  -- Replace with actual ID
WHERE user_id = 'YOUR_USER_ID' AND status = 'paid';
```

---

## Step 3: Test Refund Flow

1. **Sign in** with `testing@reviseme.co`
2. **Open Support Modal** (click Support button anywhere)
3. **Click "Guarantee" button**
4. **Verify eligibility screen** shows:
   - Payment amount: £24.99
   - Payment date: Today
   - Days remaining: 7
5. **Click "Confirm Refund"**
6. **Check results:**

### Check Stripe Dashboard:
- Go to https://dashboard.stripe.com/test/payments
- Find your payment
- Click on it
- Scroll to "Refunds" section
- Should see refund listed

**OR**

- Go to https://dashboard.stripe.com/test/payments/refunds
- Should see all refunds listed

### Check Database:
```sql
-- Check payment status
SELECT id, status, refunded_at FROM payments 
WHERE user_id = 'YOUR_USER_ID';

-- Check user access
SELECT id, email, has_access FROM users 
WHERE email = 'testing@reviseme.co';

-- Check refund logs
SELECT * FROM logs 
WHERE event_type = 'refund_requested' 
ORDER BY created_at DESC 
LIMIT 5;
```

### Check Email:
- Check inbox for `testing@reviseme.co`
- Check Resend dashboard: https://resend.com/emails
- Check server logs for email errors

---

## Troubleshooting

### "No eligible payments found"
- Payment doesn't exist → Create payment (Option A or B above)
- Payment status is not 'paid' → Update status: `UPDATE payments SET status = 'paid' WHERE user_id = 'YOUR_USER_ID';`

### "Refund period has expired"
- Payment is > 7 days old → Create new payment or update date:
  ```sql
  UPDATE payments 
  SET paid_at = NOW() 
  WHERE user_id = 'YOUR_USER_ID';
  ```

### Stripe Refund Fails
- Check if `payment_intent` ID is correct (line 78 in refund route)
- For test payments created manually, you might need a real Stripe payment intent
- Check Stripe Dashboard for error details

### Email Not Sending
- Check server logs for email errors
- Verify `reviseme.co` domain is verified in Resend
- Check Resend dashboard for sent emails
- Email failure won't block refund (it's in try/catch)

---

## Quick Test Checklist

- [ ] User exists: `testing@reviseme.co`
- [ ] Payment exists with `status = 'paid'`
- [ ] Payment is within 7 days
- [ ] Stripe test mode is active
- [ ] Support Modal opens
- [ ] "Guarantee" button shows
- [ ] Eligibility check works
- [ ] Refund processes successfully
- [ ] Payment status → `refunded`
- [ ] User access → `has_access = false`
- [ ] Refund appears in Stripe Dashboard
- [ ] Email sent (check Resend dashboard)

