-- Migration: Add week_time_preferences table for per-week time preferences
-- This allows users to override their default time preferences for specific weeks

CREATE TABLE IF NOT EXISTS week_time_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday of the week (ISO week)
  weekday_earliest_time TIME,
  weekday_latest_time TIME,
  weekend_earliest_time TIME,
  weekend_latest_time TIME,
  use_same_weekend_times BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_week_time_preferences_user_id ON week_time_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_week_time_preferences_week_start ON week_time_preferences(week_start_date);

-- Enable RLS
ALTER TABLE week_time_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own week time preferences
DROP POLICY IF EXISTS "Users can manage own week time preferences" ON week_time_preferences;
CREATE POLICY "Users can manage own week time preferences" ON week_time_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
