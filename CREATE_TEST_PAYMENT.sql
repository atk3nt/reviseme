-- ============================================
-- CREATE TEST PAYMENT - Supabase SQL Script
-- ============================================
-- 
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Create a new query
-- 3. Replace 'YOUR_USER_ID' below with your actual user ID
-- 4. Run the query
-- 
-- To find your user ID, first run:
-- SELECT id, email FROM users WHERE email = 'your-email@example.com';
-- ============================================

-- Step 1: Find your user ID (REPLACE THE EMAIL)
SELECT id, email, name 
FROM users 
WHERE email = 'your-email@example.com';  -- CHANGE THIS TO YOUR EMAIL

-- Copy the 'id' from the result above, then use it below

-- Step 2: Create test payment (REPLACE YOUR_USER_ID)
INSERT INTO payments (
  user_id,
  stripe_session_id,
  stripe_customer_id,
  amount,
  currency,
  status,
  paid_at,
  created_at
) VALUES (
  'YOUR_USER_ID',  -- PASTE YOUR USER ID HERE (from step 1)
  'cs_test_' || floor(random() * 1000000)::text,
  'cus_test_' || floor(random() * 1000000)::text,
  2999,  -- £29.99 in pence
  'GBP',
  'paid',
  NOW(),
  NOW()
)
RETURNING 
  id,
  user_id,
  amount,
  (amount / 100.0) as amount_in_pounds,
  status,
  paid_at;

-- ============================================
-- VERIFICATION
-- ============================================
-- 
-- After creating the payment, verify it exists:

SELECT 
  p.id,
  p.user_id,
  u.email,
  p.amount,
  (p.amount / 100.0) as amount_gbp,
  p.status,
  p.paid_at,
  EXTRACT(DAY FROM (NOW() - p.paid_at)) as days_since_payment,
  7 - EXTRACT(DAY FROM (NOW() - p.paid_at)) as days_remaining_for_refund
FROM payments p
JOIN users u ON p.user_id = u.id
WHERE p.user_id = 'YOUR_USER_ID'  -- PASTE YOUR USER ID HERE
ORDER BY p.created_at DESC
LIMIT 1;

-- ============================================
-- EXPECTED RESULT
-- ============================================
-- 
-- You should see:
-- - amount: 2999
-- - amount_gbp: 29.99
-- - status: paid
-- - paid_at: today's date
-- - days_since_payment: 0
-- - days_remaining_for_refund: 7
-- 
-- ✅ If you see this, your test payment is ready!
-- 
-- Now you can:
-- 1. Go to your app
-- 2. Open Support Modal
-- 3. Click "Guarantee"
-- 4. Test the refund feedback flow
-- ============================================

-- ============================================
-- CLEANUP (Optional)
-- ============================================
-- 
-- To delete test payments later:

-- DELETE FROM payments 
-- WHERE user_id = 'YOUR_USER_ID' 
-- AND stripe_session_id LIKE 'cs_test_%';

-- ============================================
