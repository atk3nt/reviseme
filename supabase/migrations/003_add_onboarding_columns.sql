-- Migration: Add onboarding columns to users table and update topic ratings
-- Run this in Supabase SQL Editor: https://supabase.com > SQL Editor

-- Add onboarding columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_access BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS price_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT FALSE;

-- Update user_topic_confidence to support extended rating system
-- Current: rating 1-5
-- New: rating 0-5 (0 = Haven't Learned, 1-5 = strength, -1 = Skip, -2 = Not Doing)
ALTER TABLE user_topic_confidence DROP CONSTRAINT IF EXISTS user_topic_confidence_rating_check;
ALTER TABLE user_topic_confidence ADD CONSTRAINT user_topic_confidence_rating_check 
  CHECK (rating >= -2 AND rating <= 5);

-- Create topic_ratings table (new name, same structure but with extended ratings)
CREATE TABLE IF NOT EXISTS topic_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= -2 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_topic_ratings_user_id ON topic_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_ratings_topic_id ON topic_ratings(topic_id);

-- Create study_blocks table (alternative name for blocks table, more semantic)
CREATE TABLE IF NOT EXISTS study_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  duration_minutes INTEGER DEFAULT 120,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_blocks_user_id ON study_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_study_blocks_scheduled_date ON study_blocks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_study_blocks_status ON study_blocks(status);


