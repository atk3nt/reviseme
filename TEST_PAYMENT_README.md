# How to Create a Test Payment

## 🚨 Problem
You're getting an error when trying to test the refund flow because you don't have a test payment.

## ✅ Solutions (Choose One)

### 🥇 Method 1: SQL Script (RECOMMENDED - Most Reliable)

**File:** `CREATE_TEST_PAYMENT.sql`

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Open `CREATE_TEST_PAYMENT.sql`
4. Replace `'your-email@example.com'` with your actual email
5. Run the first query to get your user ID
6. Copy your user ID
7. Replace `'YOUR_USER_ID'` in the second query
8. Run the second query
9. ✅ Done! You now have a test payment

**Pros:**
- ✅ Always works
- ✅ No authentication issues
- ✅ Direct database access
- ✅ Easy to verify

---

### 🥈 Method 2: Browser Console Script

**File:** `CREATE_TEST_PAYMENT.js`

1. Make sure you're **logged in** to your app
2. Open browser console (F12)
3. Copy entire contents of `CREATE_TEST_PAYMENT.js`
4. Paste into console
5. Press Enter
6. ✅ Done! You'll see a success message

**Pros:**
- ✅ Quick and easy
- ✅ No need to find user ID
- ✅ Works from any page in your app

**Cons:**
- ❌ Requires being logged in
- ❌ Might have CORS issues

---

### 🥉 Method 3: Dev Tools Page

**URL:** `http://localhost:3000/dev-tools`

1. Navigate to `/dev-tools`
2. Make sure you see "Logged in as: your-email"
3. Click "Create Test Payment" button
4. ✅ Done! You'll see success message

**Pros:**
- ✅ Nice UI
- ✅ Shows payment details
- ✅ Easy to use

**Cons:**
- ❌ Requires being logged in
- ❌ Might have API issues

---

## 🧪 After Creating Test Payment

### Test the Refund Flow:

1. **Open Support Modal**
   - Go to your app
   - Click Support button

2. **Click "Guarantee"**
   - You should see:
     - Amount: £29.99
     - Days remaining: 7
     - Feedback textarea

3. **Enter Feedback**
   - Type at least 10 characters
   - Watch button become enabled

4. **Click "Confirm Refund"**
   - Success! Feedback is stored

### Verify Feedback Was Stored:

Go to Supabase SQL Editor:

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

## 🐛 Troubleshooting

See `TROUBLESHOOTING_TEST_PAYMENT.md` for detailed troubleshooting steps.

**Common issues:**
- Not logged in → Sign in first
- 401 error → Authentication issue
- 500 error → Use SQL method instead

---

## 📚 Related Files

- `CREATE_TEST_PAYMENT.sql` - SQL script (most reliable)
- `CREATE_TEST_PAYMENT.js` - Browser console script
- `TROUBLESHOOTING_TEST_PAYMENT.md` - Detailed troubleshooting
- `DEV_TESTING_GUIDE.md` - Complete testing guide
- `REFUND_FEEDBACK_IMPLEMENTATION.md` - Implementation details

---

## 💡 Pro Tip

**Use the SQL method** (`CREATE_TEST_PAYMENT.sql`) - it's the most reliable and always works!

Just:
1. Get your user ID from Supabase
2. Run the INSERT query
3. Done!

No authentication, no API issues, no problems! 🎉
