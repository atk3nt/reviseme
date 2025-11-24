-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends NextAuth users)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exam specifications (subject + board combinations)
CREATE TABLE specs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject TEXT NOT NULL, -- biology, chemistry, physics, etc.
  board TEXT NOT NULL,   -- aqa, edexcel, ocr
  name TEXT NOT NULL,    -- "Biology AQA"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Topics (hierarchical, 3 levels)
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spec_id UUID REFERENCES specs(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 3),
  duration_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User topic confidence ratings
CREATE TABLE user_topic_confidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Scheduled revision blocks
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'missed', 'skipped')),
  ai_rationale TEXT, -- Why this topic was scheduled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Stripe payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  amount INTEGER NOT NULL, -- in pence
  currency TEXT DEFAULT 'GBP',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  paid_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event logs
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- plan_generated, block_done, block_missed, etc.
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI insights and summaries
CREATE TABLE user_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- setup_summary, weekly_feedback, block_rationale
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User availability preferences
CREATE TABLE user_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_duration_minutes INTEGER DEFAULT 90, -- weekday cap
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, day_of_week)
);

-- User exam dates
CREATE TABLE user_exam_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  spec_id UUID REFERENCES specs(id) ON DELETE CASCADE,
  exam_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, spec_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_topic_confidence_user_id ON user_topic_confidence(user_id);
CREATE INDEX idx_user_topic_confidence_topic_id ON user_topic_confidence(topic_id);
CREATE INDEX idx_blocks_user_id ON blocks(user_id);
CREATE INDEX idx_blocks_scheduled_at ON blocks(scheduled_at);
CREATE INDEX idx_blocks_status ON blocks(status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_logs_user_id ON logs(user_id);
CREATE INDEX idx_logs_event_type ON logs(event_type);
CREATE INDEX idx_topics_spec_id ON topics(spec_id);
CREATE INDEX idx_topics_parent_id ON topics(parent_id);

-- User entitlements view (for access control)
CREATE VIEW user_entitlements AS
SELECT 
  u.id as user_id,
  EXISTS(
    SELECT 1 FROM payments p 
    WHERE p.user_id = u.id 
    AND p.status = 'paid'
  ) AS has_access
FROM users u;

-- User stats view (for progress tracking)
CREATE VIEW user_stats AS
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

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_topic_confidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exam_dates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- User topic confidence policies
CREATE POLICY "Users can manage own confidence ratings" ON user_topic_confidence
  FOR ALL USING (auth.uid() = user_id);

-- Blocks policies
CREATE POLICY "Users can manage own blocks" ON blocks
  FOR ALL USING (auth.uid() = user_id);

-- Payments policies
CREATE POLICY "Users can view own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- Logs policies
CREATE POLICY "Users can view own logs" ON logs
  FOR SELECT USING (auth.uid() = user_id);

-- User insights policies
CREATE POLICY "Users can manage own insights" ON user_insights
  FOR ALL USING (auth.uid() = user_id);

-- User availability policies
CREATE POLICY "Users can manage own availability" ON user_availability
  FOR ALL USING (auth.uid() = user_id);

-- User exam dates policies
CREATE POLICY "Users can manage own exam dates" ON user_exam_dates
  FOR ALL USING (auth.uid() = user_id);

-- Public read access for specs and topics (no RLS needed)
-- These are reference data that all users can read


