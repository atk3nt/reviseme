-- =====================================================
-- MARKR PLANNER - COMPLETE DATABASE SETUP
-- =====================================================
-- Run this entire file in Supabase SQL Editor
-- Go to: https://supabase.com > Your Project > SQL Editor > New Query
-- Copy and paste this entire file, then click "Run"

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PART 1: MAIN APPLICATION TABLES
-- =====================================================

-- Users table (extends NextAuth users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  email_verified TIMESTAMPTZ,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exam specifications (subject + board combinations)
CREATE TABLE IF NOT EXISTS specs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject TEXT NOT NULL,
  board TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Topics (hierarchical, 3 levels)
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spec_id UUID REFERENCES specs(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 3),
  duration_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User topic confidence ratings
CREATE TABLE IF NOT EXISTS user_topic_confidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Scheduled revision blocks
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'missed', 'skipped')),
  ai_rationale TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Stripe payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'GBP',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  paid_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event logs
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI insights and summaries
CREATE TABLE IF NOT EXISTS user_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User availability preferences
CREATE TABLE IF NOT EXISTS user_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_duration_minutes INTEGER DEFAULT 90,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, day_of_week)
);

-- User exam dates
CREATE TABLE IF NOT EXISTS user_exam_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  spec_id UUID REFERENCES specs(id) ON DELETE CASCADE,
  exam_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, spec_id)
);

-- =====================================================
-- PART 2: NEXTAUTH TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

-- =====================================================
-- PART 3: INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_user_topic_confidence_user_id ON user_topic_confidence(user_id);
CREATE INDEX IF NOT EXISTS idx_user_topic_confidence_topic_id ON user_topic_confidence(topic_id);
CREATE INDEX IF NOT EXISTS idx_blocks_user_id ON blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_scheduled_at ON blocks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_event_type ON logs(event_type);
CREATE INDEX IF NOT EXISTS idx_topics_spec_id ON topics(spec_id);
CREATE INDEX IF NOT EXISTS idx_topics_parent_id ON topics(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- =====================================================
-- PART 4: VIEWS
-- =====================================================

CREATE OR REPLACE VIEW user_entitlements AS
SELECT 
  u.id as user_id,
  EXISTS(
    SELECT 1 FROM payments p 
    WHERE p.user_id = u.id 
    AND p.status = 'paid'
  ) AS has_access
FROM users u;

CREATE OR REPLACE VIEW user_stats AS
SELECT 
  u.id as user_id,
  COUNT(b.id) FILTER (WHERE b.status = 'done') AS blocks_done,
  COUNT(b.id) FILTER (WHERE b.status = 'missed') AS blocks_missed,
  COUNT(b.id) FILTER (WHERE b.status = 'scheduled') AS blocks_scheduled,
  AVG(utc.rating) AS avg_confidence,
  COUNT(DISTINCT DATE(b.scheduled_at)) FILTER (WHERE b.status = 'done') AS active_days,
  MAX(b.completed_at) AS last_activity
FROM users u
LEFT JOIN blocks b ON u.id = b.user_id
LEFT JOIN user_topic_confidence utc ON u.id = utc.user_id
GROUP BY u.id;

-- =====================================================
-- PART 5: ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_topic_confidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exam_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can manage own confidence ratings" ON user_topic_confidence;
DROP POLICY IF EXISTS "Users can manage own blocks" ON blocks;
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Users can view own logs" ON logs;
DROP POLICY IF EXISTS "Users can manage own insights" ON user_insights;
DROP POLICY IF EXISTS "Users can manage own availability" ON user_availability;
DROP POLICY IF EXISTS "Users can manage own exam dates" ON user_exam_dates;
DROP POLICY IF EXISTS "Service role can manage verification_tokens" ON verification_tokens;
DROP POLICY IF EXISTS "Service role can manage accounts" ON accounts;
DROP POLICY IF EXISTS "Service role can manage sessions" ON sessions;

-- User policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Application table policies
CREATE POLICY "Users can manage own confidence ratings" ON user_topic_confidence
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own blocks" ON blocks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own logs" ON logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own insights" ON user_insights
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own availability" ON user_availability
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own exam dates" ON user_exam_dates
  FOR ALL USING (auth.uid() = user_id);

-- NextAuth table policies (allow service role to manage)
CREATE POLICY "Service role can manage verification_tokens" ON verification_tokens
  FOR ALL USING (true);

CREATE POLICY "Service role can manage accounts" ON accounts
  FOR ALL USING (true);

CREATE POLICY "Service role can manage sessions" ON sessions
  FOR ALL USING (true);

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- You should see "Success. No rows returned" if everything worked
-- Now you can close this and restart your Next.js app


