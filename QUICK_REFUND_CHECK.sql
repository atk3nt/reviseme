-- ============================================
-- QUICK REFUND CLEANUP CHECK
-- ============================================
-- Step 1: Get your user ID (run this first)
-- ============================================

SELECT id, email, name 
FROM users 
WHERE email = 'appmarkrai@gmail.com';

-- ============================================
-- Step 2: Copy the ID from above, then run this
-- Replace 'PASTE_YOUR_USER_ID_HERE' with the actual UUID
-- ============================================

-- Check what was DELETED (should all be 0)
SELECT 
  'blocks' as table_name, 
  COUNT(*) as count 
FROM blocks 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'user_topic_confidence', COUNT(*) 
FROM user_topic_confidence 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'topic_ratings', COUNT(*) 
FROM topic_ratings 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'user_availability', COUNT(*) 
FROM user_availability 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'unavailable_times', COUNT(*) 
FROM unavailable_times 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'user_exam_dates', COUNT(*) 
FROM user_exam_dates 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'user_insights', COUNT(*) 
FROM user_insights 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'week_time_preferences', COUNT(*) 
FROM week_time_preferences 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'repeatable_events', COUNT(*) 
FROM repeatable_events 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'

UNION ALL

SELECT 'week_availability_confirmed', COUNT(*) 
FROM week_availability_confirmed 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa';

-- Expected: All counts should be 0 ✅

-- ============================================
-- Step 3: Check what was PRESERVED
-- ============================================

-- User account with referral source
SELECT 
  email,
  has_access, -- Should be false
  has_completed_onboarding, -- Should be false
  onboarding_data->>'referral_source' as referral_source, -- Should still exist!
  weekday_earliest_time, -- Should be '04:30'
  weekday_latest_time -- Should be '23:30'
FROM users 
WHERE id = '346d4b7c-5aab-4674-869c-4be5cc5150aa';

-- Payment record
SELECT 
  id,
  status, -- Should be 'refunded'
  refunded_at, -- Should have timestamp
  amount,
  currency
FROM payments 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa'
ORDER BY created_at DESC
LIMIT 1;

-- Refund log
SELECT 
  event_type,
  event_data->>'referral_source' as referral_source,
  event_data->>'data_cleaned' as data_cleaned,
  created_at
FROM logs 
WHERE user_id = '346d4b7c-5aab-4674-869c-4be5cc5150aa' 
  AND event_type = 'refund_requested'
ORDER BY created_at DESC
LIMIT 1;

