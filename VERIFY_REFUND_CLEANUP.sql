-- ============================================
-- VERIFY REFUND CLEANUP - Supabase SQL Queries
-- ============================================
-- Replace YOUR_USER_ID with your actual user ID
-- Get it: SELECT id, email FROM users WHERE email = 'your-email@example.com';

-- ============================================
-- STEP 1: Check What Was DELETED (should all be 0)
-- ============================================

SELECT 
  'blocks' as table_name, 
  COUNT(*) as count 
FROM blocks 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'user_topic_confidence', COUNT(*) 
FROM user_topic_confidence 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'topic_ratings', COUNT(*) 
FROM topic_ratings 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'user_availability', COUNT(*) 
FROM user_availability 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'unavailable_times', COUNT(*) 
FROM unavailable_times 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'user_exam_dates', COUNT(*) 
FROM user_exam_dates 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'user_insights', COUNT(*) 
FROM user_insights 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'week_time_preferences', COUNT(*) 
FROM week_time_preferences 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'repeatable_events', COUNT(*) 
FROM repeatable_events 
WHERE user_id = 'YOUR_USER_ID'

UNION ALL

SELECT 'week_availability_confirmed', COUNT(*) 
FROM week_availability_confirmed 
WHERE user_id = 'YOUR_USER_ID';

-- Expected: All counts should be 0 ✅

-- ============================================
-- STEP 2: Check What Was PRESERVED (should exist)
-- ============================================

-- User account (should exist)
SELECT 
  id,
  email,
  name,
  has_access, -- Should be false
  has_completed_onboarding, -- Should be false
  onboarding_data->>'referral_source' as referral_source, -- Should still exist!
  weekday_earliest_time, -- Should be reset to '04:30'
  weekday_latest_time, -- Should be reset to '23:30'
  created_at
FROM users 
WHERE id = 'YOUR_USER_ID';

-- Payment record (should exist and be marked refunded)
SELECT 
  id,
  status, -- Should be 'refunded'
  refunded_at, -- Should have timestamp
  amount,
  currency,
  paid_at,
  created_at
FROM payments 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;

-- Refund log (should exist)
SELECT 
  id,
  event_type, -- Should be 'refund_requested'
  event_data->>'referral_source' as referral_source, -- Should be preserved
  event_data->>'data_cleaned' as data_cleaned, -- Should be true
  event_data->>'refund_id' as refund_id,
  created_at
FROM logs 
WHERE user_id = 'YOUR_USER_ID' 
  AND event_type = 'refund_requested'
ORDER BY created_at DESC
LIMIT 1;

-- ============================================
-- STEP 3: Quick Summary Check
-- ============================================

SELECT 
  'Personal Data Deleted' as check_type,
  CASE 
    WHEN (SELECT COUNT(*) FROM blocks WHERE user_id = 'YOUR_USER_ID') = 0 
      AND (SELECT COUNT(*) FROM user_topic_confidence WHERE user_id = 'YOUR_USER_ID') = 0
      AND (SELECT COUNT(*) FROM user_availability WHERE user_id = 'YOUR_USER_ID') = 0
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result

UNION ALL

SELECT 
  'User Account Preserved',
  CASE 
    WHEN EXISTS (SELECT 1 FROM users WHERE id = 'YOUR_USER_ID')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END

UNION ALL

SELECT 
  'Referral Source Preserved',
  CASE 
    WHEN (SELECT onboarding_data->>'referral_source' FROM users WHERE id = 'YOUR_USER_ID') IS NOT NULL
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END

UNION ALL

SELECT 
  'Payment Record Preserved',
  CASE 
    WHEN EXISTS (SELECT 1 FROM payments WHERE user_id = 'YOUR_USER_ID' AND status = 'refunded')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END

UNION ALL

SELECT 
  'Refund Log Created',
  CASE 
    WHEN EXISTS (SELECT 1 FROM logs WHERE user_id = 'YOUR_USER_ID' AND event_type = 'refund_requested')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END;

