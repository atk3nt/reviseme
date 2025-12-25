# Testing Money Back Guarantee Flow

## Quick Test Guide

### Prerequisites
1. **Stripe Test Mode** - Make sure you're using test API keys
2. **Test User** - Create a test user account
3. **Test Payment** - Create a test payment record

---

## Method 1: Manual Testing (Recommended)

### Step 1: Create Test Payment

**Option A: Use Stripe Test Checkout**
1. Sign in to your app with a test account
2. Go through onboarding
3. Complete payment using Stripe test card: `4242 4242 4242 4242`
4. Use any future expiry date and any CVC
5. This creates a real payment record in your database

**Option B: Manually Insert Test Payment (Faster)**
Run this SQL in Supabase SQL Editor:

```sql
-- First, get your test user ID
SELECT id, email FROM users WHERE email = 'your-test-email@example.com';

-- Then insert a test payment (replace USER_ID with actual ID)
INSERT INTO payments (
  user_id,
  stripe_session_id,
  stripe_customer_id,
  amount,
  currency,
  status,
  paid_at
) VALUES (
  'USER_ID_HERE',  -- Replace with your test user ID
  'cs_test_1234567890',  -- Fake Stripe session ID
  'cus_test_1234567890',  -- Fake customer ID
  2499,  -- £24.99 in pence
  'GBP',
  'paid',
  NOW()  -- Payment made just now (within 7 days)
);

-- Verify payment was created
SELECT * FROM payments WHERE user_id = 'USER_ID_HERE';
```

### Step 2: Test Refund Flow

1. **Open Support Modal**
   - Go to any page with Support button
   - Click Support button
   - Click "Guarantee" button

2. **Check Eligibility Screen**
   - Should show payment details
   - Should show days remaining (should be 7 or less)
   - Should show warning about access revocation

3. **Process Refund**
   - Click "Confirm Refund"
   - Should see success toast
   - Should redirect to home page

4. **Verify Results**
   - Check Stripe Dashboard → Refunds (should see refund)
   - Check database: `payments.status` should be `refunded`
   - Check database: `users.has_access` should be `false`
   - Check email inbox (if Resend is configured)
   - Check logs table for refund event

### Step 3: Test Edge Cases

**Test Expired Refund (Over 7 Days)**
```sql
-- Update payment to be 8 days old
UPDATE payments 
SET paid_at = NOW() - INTERVAL '8 days'
WHERE user_id = 'USER_ID_HERE' AND status = 'paid';
```
- Try refund → Should show "Refund period has expired"

**Test No Payment**
```sql
-- Delete payment
DELETE FROM payments WHERE user_id = 'USER_ID_HERE';
```
- Try refund → Should show "No eligible payments found"

**Test Already Refunded**
```sql
-- Mark payment as already refunded
UPDATE payments 
SET status = 'refunded', refunded_at = NOW()
WHERE user_id = 'USER_ID_HERE';
```
- Try refund → Should show "Payment is not eligible for refund"

---

## Method 2: Automated Testing Script

Create a test script to automate the process:

```javascript
// scripts/test-refund-flow.js
// Run with: node scripts/test-refund-flow.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRefundFlow() {
  console.log('🧪 Testing Refund Flow...\n');

  // 1. Find or create test user
  const testEmail = 'test-refund@example.com';
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', testEmail)
    .single();

  if (!user) {
    console.log('Creating test user...');
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        email: testEmail,
        name: 'Test Refund User',
        has_access: true
      })
      .select()
      .single();
    user = newUser;
  }

  console.log(`✅ Test user: ${user.email} (${user.id})\n`);

  // 2. Create test payment
  console.log('Creating test payment...');
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      user_id: user.id,
      stripe_session_id: `cs_test_${Date.now()}`,
      stripe_customer_id: `cus_test_${Date.now()}`,
      amount: 2499,
      currency: 'GBP',
      status: 'paid',
      paid_at: new Date().toISOString()
    })
    .select()
    .single();

  if (paymentError) {
    console.error('❌ Error creating payment:', paymentError);
    return;
  }

  console.log(`✅ Test payment created: £${(payment.amount / 100).toFixed(2)}`);
  console.log(`   Payment ID: ${payment.id}\n`);

  // 3. Test eligibility check
  console.log('Testing eligibility check...');
  const paymentDate = new Date(payment.paid_at);
  const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = 7 - daysSincePayment;

  if (daysRemaining > 0) {
    console.log(`✅ Eligible for refund (${daysRemaining} days remaining)`);
  } else {
    console.log(`❌ Not eligible (expired ${Math.abs(daysRemaining)} days ago)`);
  }

  console.log('\n📋 Test Summary:');
  console.log(`   User ID: ${user.id}`);
  console.log(`   Payment ID: ${payment.id}`);
  console.log(`   Amount: £${(payment.amount / 100).toFixed(2)}`);
  console.log(`   Status: ${payment.status}`);
  console.log(`   Days since payment: ${daysSincePayment}`);
  console.log(`   Days remaining: ${daysRemaining}`);

  console.log('\n✅ Test data ready!');
  console.log('   Now test the refund flow in the UI:');
  console.log(`   1. Sign in as: ${testEmail}`);
  console.log('   2. Open Support Modal');
  console.log('   3. Click "Guarantee" button');
  console.log('   4. Confirm refund');
  console.log('   5. Check results below\n');

  // 4. Wait for manual testing, then verify
  console.log('⏳ After processing refund, run verification...');
  console.log('   (This script will check results in 30 seconds)\n');

  setTimeout(async () => {
    const { data: updatedPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment.id)
      .single();

    const { data: updatedUser } = await supabase
      .from('users')
      .select('has_access')
      .eq('id', user.id)
      .single();

    console.log('\n📊 Verification Results:');
    console.log(`   Payment Status: ${updatedPayment?.status}`);
    console.log(`   Refunded At: ${updatedPayment?.refunded_at || 'Not set'}`);
    console.log(`   User Access: ${updatedUser?.has_access ? 'Has access' : 'Access revoked ✅'}`);

    if (updatedPayment?.status === 'refunded' && !updatedUser?.has_access) {
      console.log('\n✅ Refund flow test PASSED!');
    } else {
      console.log('\n❌ Refund flow test FAILED - Check the results above');
    }
  }, 30000);
}

testRefundFlow().catch(console.error);
```

---

## Method 3: Using Stripe CLI (For Webhook Testing)

If you want to test the full Stripe integration:

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhook/stripe

# Trigger test payment
stripe trigger checkout.session.completed

# Then test refund in UI
```

---

## Checklist

### Pre-Testing Setup
- [ ] Stripe test mode enabled
- [ ] Test user account created
- [ ] Test payment record created
- [ ] Resend email configured (optional)

### Test Scenarios
- [ ] **Happy Path**: Eligible payment → Refund succeeds
- [ ] **Expired**: Payment > 7 days old → Shows error
- [ ] **No Payment**: No payment record → Shows error
- [ ] **Already Refunded**: Payment already refunded → Shows error
- [ ] **Email Delivery**: Confirmation email sent (check Resend dashboard)

### Verification Points
- [ ] Stripe refund created (check Stripe Dashboard)
- [ ] Payment status updated to `refunded`
- [ ] User access revoked (`has_access: false`)
- [ ] Event logged in `logs` table
- [ ] Email sent (check Resend dashboard or inbox)
- [ ] User redirected to home page
- [ ] Success toast message shown

### Edge Cases
- [ ] Network error during refund → Shows error message
- [ ] Stripe API error → Handled gracefully
- [ ] Email fails → Refund still processes (email error logged)

---

## Quick Test Commands

```bash
# Create test payment (SQL in Supabase)
# See Method 1, Option B above

# Check payment status
SELECT id, status, paid_at, refunded_at 
FROM payments 
WHERE user_id = 'YOUR_USER_ID';

# Check user access
SELECT id, email, has_access 
FROM users 
WHERE id = 'YOUR_USER_ID';

# Check refund logs
SELECT * FROM logs 
WHERE event_type = 'refund_requested' 
ORDER BY created_at DESC 
LIMIT 5;
```

---

## Troubleshooting

### Refund Button Not Showing
- Check if user has a payment with `status = 'paid'`
- Check if payment is within 7 days

### "Payment not found" Error
- Verify payment exists in database
- Check payment `user_id` matches logged-in user

### Stripe Refund Fails
- Check Stripe API key is correct
- Verify `payment_intent` ID is correct (might need to fix line 78 in refund route)
- Check Stripe Dashboard for error details

### Email Not Sending
- Check Resend API key
- Verify email domain is verified in Resend
- Check console logs for email errors
- Email failure shouldn't block refund

### Access Not Revoked
- Check database: `users.has_access` should be `false`
- Verify refund API completed successfully
- Check for errors in API logs

---

## Production Testing

Before going live:
1. Test with real Stripe test mode
2. Test with real Resend account
3. Verify email delivery
4. Test all edge cases
5. Monitor error logs
6. Test refund processing time

