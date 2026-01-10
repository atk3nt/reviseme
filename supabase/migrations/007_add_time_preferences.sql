-- Migration: Add time preferences and unavailable times
-- Run this in Supabase SQL Editor: https://supabase.com > SQL Editor

-- Add time preference columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekday_earliest_time TIME DEFAULT '04:30';
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekday_latest_time TIME DEFAULT '23:30';
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekend_earliest_time TIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekend_latest_time TIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS use_same_weekend_times BOOLEAN DEFAULT TRUE;

-- Create unavailable_times table
CREATE TABLE IF NOT EXISTS unavailable_times (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT, -- Optional: 'Football practice', 'Family event', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_unavailable_times_user_id ON unavailable_times(user_id);
CREATE INDEX IF NOT EXISTS idx_unavailable_times_start ON unavailable_times(start_datetime);
CREATE INDEX IF NOT EXISTS idx_unavailable_times_end ON unavailable_times(end_datetime);

-- Add unique constraint to prevent duplicate blocks
CREATE UNIQUE INDEX IF NOT EXISTS unavailable_times_user_start_end_unique 
ON unavailable_times(user_id, start_datetime, end_datetime);

-- Enable RLS
ALTER TABLE unavailable_times ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own unavailable times
DROP POLICY IF EXISTS "Users can manage own unavailable times" ON unavailable_times;
CREATE POLICY "Users can manage own unavailable times" ON unavailable_times
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);



