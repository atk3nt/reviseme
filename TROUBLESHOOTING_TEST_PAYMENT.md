# Troubleshooting: Create Test Payment Not Working

## Quick Diagnosis

**What error are you seeing?**

### Error: "Authentication required" (401)
**Cause:** You're not logged in.

**Solution:**
1. Sign in to your app first
2. Then try creating the test payment again

### Error: "Failed to create test payment" (500)
**Cause:** Database connection issue or missing fields.

**Solution:** Use the manual database insert method below.

### Error: Network error or fetch failed
**Cause:** API endpoint not accessible or CORS issue.

**Solution:** Use the browser console method below.

---

## Method 1: Browser Console (Easiest)

1. **Make sure you're logged in** to your app
2. **Open browser console:**
   - Chrome/Edge: `F12` or `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
   - Firefox: `F12` or `Cmd+Option+K` (Mac) or `Ctrl+Shift+K` (Windows)
3. **Copy and paste** the contents of `CREATE_TEST_PAYMENT.js`
4. **Press Enter**

You should see:
```
✅ SUCCESS! Test payment created:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Amount: £29.99
Status: paid
Payment ID: xxx-xxx-xxx
Days remaining for refund: 7
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Method 2: Manual Database Insert (Most Reliable)

If the API isn't working, you can insert directly into the database:

### Step 1: Get Your User ID

Go to Supabase SQL Editor and run:

```sql
SELECT id, email FROM users WHERE email = 'your-email@example.com';
```

Copy your user ID.

### Step 2: Insert Test Payment

Replace `YOUR_USER_ID` with the ID from step 1:

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
  'YOUR_USER_ID',  -- Replace with your actual user ID
  'cs_test_' || floor(random() * 1000000)::text,
  'cus_test_' || floor(random() * 1000000)::text,
  2999,  -- £29.99 in pence
  'GBP',
  'paid',
  NOW()
)
RETURNING *;
```

You should see the newly created payment record.

---

## Method 3: Using curl (Command Line)

If you have your session cookie:

```bash
# Get your session cookie from browser DevTools > Application > Cookies
# Then run:

curl -X POST http://localhost:3000/api/dev/create-test-payment \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN_HERE"
```

---

## Method 4: Dev Tools Page (If Working)

1. Navigate to: `http://localhost:3000/dev-tools`
2. Make sure you see "Logged in as: your-email@example.com"
3. Click "Create Test Payment"
4. Check browser console for any errors

---

## Verification

After creating a test payment, verify it exists:

```sql
SELECT 
  id,
  user_id,
  amount,
  status,
  paid_at,
  created_at
FROM payments
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 1;
```

You should see your test payment with:
- `status = 'paid'`
- `amount = 2999` (£29.99)
- `paid_at` = today's date

---

## Common Issues

### Issue: "User not found"
**Solution:** Make sure you're logged in and have a user record in the database.

### Issue: "Foreign key constraint violation"
**Solution:** Your user_id doesn't exist in the users table. Check your user ID.

### Issue: "Column 'X' does not exist"
**Solution:** Your payments table might have different columns. Check the schema:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payments';
```

### Issue: Dev tools page shows "Login Required"
**Solution:** You're not logged in. Click "Sign In" and authenticate first.

### Issue: Button stays disabled after creating payment
**Solution:** Refresh the page or navigate to the support modal to see the payment.

---

## Testing the Refund Flow

Once you have a test payment:

1. **Open Support Modal**
   - Go to your app
   - Click Support button (in sidebar or settings)

2. **Click "Guarantee"**
   - You should see refund details
   - Amount: £29.99
   - Days remaining: 7

3. **Enter Feedback**
   - Type at least 10 characters
   - Watch the character counter

4. **Confirm Refund**
   - Button becomes enabled when feedback is valid
   - Click "Confirm Refund"
   - You should see success message

5. **Verify in Database**
   ```sql
   SELECT 
     created_at,
     event_data->>'feedback' as feedback,
     event_data->>'amount' as amount
   FROM logs
   WHERE event_type = 'refund_requested'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

---

## Still Not Working?

### Check These:

1. **Is your dev server running?**
   ```bash
   npm run dev
   ```

2. **Are you logged in?**
   - Check browser console: `console.log(document.cookie)`
   - Should see session token

3. **Is Supabase connected?**
   - Check `.env.local` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

4. **Check browser console for errors**
   - Press F12
   - Look in Console tab
   - Look in Network tab for failed requests

5. **Check server logs**
   - Look at your terminal where `npm run dev` is running
   - Check for error messages

---

## Alternative: Skip Test Payment

If you can't create a test payment, you can still test the feedback UI:

1. Comment out the eligibility check temporarily
2. Test the feedback form UI
3. Uncomment when done

Or use the **Manual Database Insert** method above - it's the most reliable!

---

## Need Help?

If none of these methods work, please provide:
1. The exact error message you're seeing
2. Browser console logs
3. Server terminal logs
4. Which method you tried

This will help diagnose the specific issue!
