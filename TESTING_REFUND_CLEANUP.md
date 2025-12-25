# Testing Refund Data Cleanup

This guide helps you test the hybrid data cleanup approach when a refund is processed.

## Prerequisites

1. You're logged in to the app
2. You have access to Supabase Dashboard (to verify data)
3. Browser console access (F12 or Cmd+Option+I)

## Step 1: Create Test Payment

Run this in your browser console:

```javascript
fetch('/api/dev/create-test-payment', { method: 'POST' })
  .then(r => r.json())
  .then(data => {
    console.log('✅ Test payment created:', data);
    window.testPaymentId = data.payment?.id;
  });
```

## Step 2: Create Test Study Data

You need to simulate having study data. The easiest way is to:

1. **Complete onboarding** (if not already done) - this creates:
   - Topic ratings (`user_topic_confidence`)
   - Availability preferences (`user_availability`)
   - Onboarding data (including referral source)

2. **Generate a plan** - this creates:
   - Revision blocks (`blocks`)
   - AI insights (`user_insights`)

3. **Or manually insert test data** (run in Supabase SQL Editor):

```sql
-- Replace YOUR_USER_ID with your actual user ID
-- Get it from: SELECT id, email FROM users WHERE email = 'your-email@example.com';

-- Create a test block
INSERT INTO blocks (user_id, topic_id, scheduled_at, status)
SELECT 
  'YOUR_USER_ID',
  id,
  NOW() + INTERVAL '1 day',
  'scheduled'
FROM topics
LIMIT 1;

-- Create a test rating
INSERT INTO user_topic_confidence (user_id, topic_id, rating)
SELECT 
  'YOUR_USER_ID',
  id,
  3
FROM topics
LIMIT 1
ON CONFLICT DO NOTHING;

-- Verify data exists
SELECT 
  (SELECT COUNT(*) FROM blocks WHERE user_id = 'YOUR_USER_ID') as blocks_count,
  (SELECT COUNT(*) FROM user_topic_confidence WHERE user_id = 'YOUR_USER_ID') as ratings_count,
  (SELECT COUNT(*) FROM user_availability WHERE user_id = 'YOUR_USER_ID') as availability_count;
```

## Step 3: Verify Data Before Refund

Check what data exists before the refund:

```sql
-- In Supabase SQL Editor, replace YOUR_USER_ID
SELECT 
  'blocks' as table_name, COUNT(*) as count 
FROM blocks WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_topic_confidence', COUNT(*) 
FROM user_topic_confidence WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_availability', COUNT(*) 
FROM user_availability WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_exam_dates', COUNT(*) 
FROM user_exam_dates WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_insights', COUNT(*) 
FROM user_insights WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'week_time_preferences', COUNT(*) 
FROM week_time_preferences WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'repeatable_events', COUNT(*) 
FROM repeatable_events WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'unavailable_times', COUNT(*) 
FROM unavailable_times WHERE user_id = 'YOUR_USER_ID';

-- Check referral source
SELECT onboarding_data->>'referral_source' as referral_source
FROM users 
WHERE id = 'YOUR_USER_ID';
```

**Note down these counts** - they should all be > 0 (or at least some of them).

## Step 4: Process Refund

1. Go to your app
2. Click **Support** button
3. Click **Guarantee** button
4. Click **Confirm Refund**

Or trigger via API (browser console):

```javascript
// First get your payment ID
fetch('/api/plan/payments')
  .then(r => r.json())
  .then(data => {
    const payment = data.payments.find(p => p.status === 'paid');
    if (!payment) {
      console.error('No eligible payment found');
      return;
    }
    
    // Process refund
    return fetch('/api/refund/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: payment.id })
    });
  })
  .then(r => r.json())
  .then(data => {
    console.log('✅ Refund processed:', data);
  });
```

## Step 5: Verify Cleanup Results

### 5.1 Check What Was Deleted

Run this in Supabase SQL Editor (replace YOUR_USER_ID):

```sql
-- All these should return 0
SELECT 
  'blocks' as table_name, COUNT(*) as count 
FROM blocks WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_topic_confidence', COUNT(*) 
FROM user_topic_confidence WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_availability', COUNT(*) 
FROM user_availability WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_exam_dates', COUNT(*) 
FROM user_exam_dates WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'user_insights', COUNT(*) 
FROM user_insights WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'week_time_preferences', COUNT(*) 
FROM week_time_preferences WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'repeatable_events', COUNT(*) 
FROM repeatable_events WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'unavailable_times', COUNT(*) 
FROM unavailable_times WHERE user_id = 'YOUR_USER_ID';
```

**Expected:** All counts should be `0` ✅

### 5.2 Check What Was Preserved

```sql
-- Replace YOUR_USER_ID
SELECT 
  id,
  email,
  name,
  has_access, -- Should be false
  has_completed_onboarding, -- Should be false
  onboarding_data->>'referral_source' as referral_source, -- Should still exist
  weekday_earliest_time, -- Should be reset to '6:00'
  weekday_latest_time -- Should be reset to '23:30'
FROM users 
WHERE id = 'YOUR_USER_ID';

-- Check payment record
SELECT 
  id,
  status, -- Should be 'refunded'
  refunded_at, -- Should have timestamp
  amount
FROM payments 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 1;

-- Check refund log
SELECT 
  event_type,
  event_data->>'referral_source' as referral_source,
  event_data->>'data_cleaned' as data_cleaned
FROM logs 
WHERE user_id = 'YOUR_USER_ID' 
  AND event_type = 'refund_requested'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- ✅ User account exists
- ✅ `has_access` = `false`
- ✅ `has_completed_onboarding` = `false`
- ✅ `referral_source` is preserved in `onboarding_data`
- ✅ Payment status = `'refunded'`
- ✅ Log entry includes `referral_source` and `data_cleaned: true`

## Step 6: Verify User Experience

1. **Try to access the app:**
   - User should be redirected or see "no access" message
   - Can't see their plan/blocks (because they're deleted)

2. **Check email:**
   - Should receive refund confirmation email

## Quick Test Script

Run this all at once in browser console:

```javascript
(async () => {
  console.log('🧪 Starting refund cleanup test...\n');
  
  // 1. Create test payment
  console.log('1️⃣ Creating test payment...');
  const paymentRes = await fetch('/api/dev/create-test-payment', { method: 'POST' });
  const paymentData = await paymentRes.json();
  console.log('✅', paymentData);
  
  if (!paymentData.payment?.id) {
    console.error('❌ No payment created');
    return;
  }
  
  const paymentId = paymentData.payment.id;
  
  // 2. Process refund
  console.log('\n2️⃣ Processing refund...');
  const refundRes = await fetch('/api/refund/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId })
  });
  const refundData = await refundRes.json();
  console.log('✅', refundData);
  
  // 3. Verify payment status
  console.log('\n3️⃣ Verifying payment status...');
  const paymentsRes = await fetch('/api/plan/payments');
  const paymentsData = await paymentsRes.json();
  const refundedPayment = paymentsData.payments.find(p => p.id === paymentId);
  console.log('Payment status:', refundedPayment?.status);
  console.log('Refunded at:', refundedPayment?.refunded_at);
  
  console.log('\n✅ Test complete!');
  console.log('📋 Next: Check Supabase to verify data cleanup');
})();
```

## Troubleshooting

### No data to clean up?
- Make sure you've completed onboarding
- Or manually insert test data using the SQL above

### Cleanup didn't work?
- Check browser console for errors
- Check server logs for cleanup warnings
- Verify tables exist in Supabase

### Referral source missing?
- Make sure you selected a referral source during onboarding
- Check `onboarding_data` column in users table

## Expected Console Output

When refund is processed, you should see in server logs:

```
🧹 Cleaning up user study data for refund...
✅ User data cleaned up. Referral source preserved: TikTok
✅ Refund confirmation email sent successfully to: user@example.com
```

---

**Time Required:** ~5-10 minutes  
**What You'll Learn:** 
- Which data gets deleted
- Which data gets preserved
- How referral source is maintained for analytics

