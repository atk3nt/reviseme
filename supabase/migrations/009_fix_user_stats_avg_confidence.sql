-- Migration: Fix user_stats view to exclude negative ratings from avg_confidence
-- This ensures avg_confidence only includes positive ratings (1-5), excluding 0, -1, -2
-- Run this in Supabase SQL Editor: https://supabase.com > SQL Editor

CREATE OR REPLACE VIEW user_stats AS
SELECT 
  u.id as user_id,
  COUNT(b.id) FILTER (WHERE b.status = 'done') AS blocks_done,
  COUNT(b.id) FILTER (WHERE b.status = 'missed') AS blocks_missed,
  COUNT(b.id) FILTER (WHERE b.status = 'scheduled') AS blocks_scheduled,
  AVG(utc.rating) FILTER (WHERE utc.rating >= 1 AND utc.rating <= 5) AS avg_confidence,
  COUNT(DISTINCT DATE(b.scheduled_at)) FILTER (WHERE b.status = 'done') AS active_days,
  MAX(b.completed_at) AS last_activity
FROM users u
LEFT JOIN blocks b ON u.id = b.user_id
LEFT JOIN user_topic_confidence utc ON u.id = utc.user_id
GROUP BY u.id;


