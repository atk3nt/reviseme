-- Migration: Create repeatable_events table for recurring unavailable slots

CREATE TABLE IF NOT EXISTS repeatable_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL, -- 0 = Sunday, 6 = Saturday
  start_date DATE,
  end_date DATE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repeatable_events_user_id ON repeatable_events(user_id);
CREATE INDEX IF NOT EXISTS idx_repeatable_events_days ON repeatable_events USING GIN (days_of_week);

ALTER TABLE repeatable_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own repeatable events" ON repeatable_events;
CREATE POLICY "Users can manage own repeatable events" ON repeatable_events
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Simple trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_repeatable_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_repeatable_events_updated_at
BEFORE UPDATE ON repeatable_events
FOR EACH ROW
EXECUTE FUNCTION update_repeatable_events_updated_at();

