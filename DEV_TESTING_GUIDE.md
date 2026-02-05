# Development Testing Guide

## 🚀 Quick Start - Testing Refund Flow

### Step 1: Access Dev Tools
Navigate to: **`http://localhost:3000/dev-tools`**

This page provides a simple UI to:
- ✅ Create test payments
- ✅ Grant access to the app
- ✅ Quick links to test features

### Step 2: Create a Test Payment

1. Click **"Create Test Payment"** button
2. You'll see a success message with:
   - Amount: £29.99
   - Status: paid
   - Days remaining: 7

### Step 3: Test the Refund Flow

**Option A - Support Modal (Recommended):**
1. Open your app
2. Click the Support button (in sidebar or settings)
3. Click **"Guarantee"** option
4. You'll see the refund form with feedback textarea
5. Try clicking "Confirm Refund" without feedback → Button is disabled
6. Enter at least 10 characters of feedback
7. Button becomes enabled
8. Click "Confirm Refund"
9. ✅ Success! Feedback is stored

**Option B - Settings Page:**
1. Go to `/settings`
2. Find your payment card
3. Click **"Request Refund"** button
4. A prompt will ask for feedback
5. Enter at least 10 characters
6. Confirm the refund
7. ✅ Success! Feedback is stored

### Step 4: Verify Feedback Was Stored

Go to Supabase SQL Editor and run:

```sql
SELECT 
  l.created_at as refund_date,
  u.email,
  u.name,
  (l.event_data->>'amount')::int / 100 as amount_gbp,
  l.event_data->>'feedback' as feedback,
  l.event_data->>'referral_source' as source
FROM logs l
JOIN users u ON l.user_id = u.id
WHERE l.event_type = 'refund_requested'
ORDER BY l.created_at DESC
LIMIT 5;
```

You should see your feedback in the results!

---

## 🔧 Alternative Methods

### Method 1: API Endpoint (Command Line)

```bash
# Create test payment
curl -X POST http://localhost:3000/api/dev/create-test-payment \
  -H "Content-Type: application/json" \
  --cookie "your-session-cookie"
```

### Method 2: Browser Console

```javascript
// Create test payment
fetch('/api/dev/create-test-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(d => console.log(d));
```

### Method 3: Direct Database Insert

Go to Supabase SQL Editor:

```sql
INSERT INTO payments (
  user_id,
  stripe_session_id,
  stripe_customer_id,
  amount,
  currency,
  status,
  paid_at
) VALUES (
  'your-user-id-here',
  'cs_test_' || floor(random() * 1000000)::text,
  'cus_test_' || floor(random() * 1000000)::text,
  2999, -- £29.99
  'GBP',
  'paid',
  NOW()
);
```

---

## 🐛 Troubleshooting

### Error: "Authentication required"
**Solution:** Make sure you're logged in to the app first.

### Error: "No eligible payments found"
**Solution:** You need to create a test payment first. Use the Dev Tools page or API.

### Error: "Refund period has expired"
**Solution:** The test payment is older than 7 days. Create a new test payment.

### Error: "Feedback is required"
**Solution:** Enter at least 10 characters in the feedback field.

### Button stays disabled
**Solution:** Make sure you've entered at least 10 characters of feedback. Check the character counter.

---

## 📊 Viewing Refund Feedback

### Quick View (Supabase)

```sql
-- All refund feedback
SELECT 
  created_at,
  event_data->>'feedback' as feedback,
  event_data->>'amount' as amount_pence
FROM logs
WHERE event_type = 'refund_requested'
ORDER BY created_at DESC;
```

### Detailed View with User Info

```sql
SELECT 
  l.created_at as refund_date,
  u.email,
  u.name,
  (l.event_data->>'amount')::int / 100 as amount_gbp,
  l.event_data->>'feedback' as feedback,
  l.event_data->>'referral_source' as how_they_found_us,
  l.event_data->>'refund_id' as stripe_refund_id
FROM logs l
JOIN users u ON l.user_id = u.id
WHERE l.event_type = 'refund_requested'
ORDER BY l.created_at DESC;
```

### Refund Statistics

```sql
-- Summary stats
SELECT 
  COUNT(*) as total_refunds,
  SUM((event_data->>'amount')::int) / 100 as total_refunded_gbp,
  AVG((event_data->>'amount')::int) / 100 as avg_refund_gbp,
  COUNT(*) FILTER (WHERE event_data->>'feedback' IS NOT NULL) as with_feedback
FROM logs
WHERE event_type = 'refund_requested';
```

---

## 🎯 Testing Checklist

- [ ] Created test payment via Dev Tools page
- [ ] Opened Support Modal
- [ ] Clicked "Guarantee" option
- [ ] Saw refund details displayed
- [ ] Saw feedback textarea
- [ ] Tried clicking "Confirm Refund" without feedback (button disabled)
- [ ] Entered 5 characters (button still disabled)
- [ ] Entered 10+ characters (button enabled)
- [ ] Clicked "Confirm Refund"
- [ ] Saw success message
- [ ] Verified feedback in Supabase logs table
- [ ] Checked that payment status changed to 'refunded'

---

## 🔗 Useful Links

- **Dev Tools Page:** `/dev-tools`
- **Settings Page:** `/settings`
- **Supabase Dashboard:** Your project URL
- **API Docs:** See `REFUND_FEEDBACK_IMPLEMENTATION.md`

---

## 📝 Notes

- Test payments are created with status `'paid'` and today's date
- Refund eligibility is 7 days from payment date
- Feedback must be at least 10 characters
- Feedback is stored in `logs.event_data.feedback`
- In production, this will work with real Stripe payments
