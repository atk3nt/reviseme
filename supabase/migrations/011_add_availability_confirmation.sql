-- Migration: Add availability confirmation tracking
-- Users must confirm their availability for next week before the cron generates their plan

CREATE TABLE IF NOT EXISTS week_availability_confirmed (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday of the week (ISO week)
  confirmed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_week_availability_confirmed_user_id ON week_availability_confirmed(user_id);
CREATE INDEX IF NOT EXISTS idx_week_availability_confirmed_week_start ON week_availability_confirmed(week_start_date);

-- Enable RLS
ALTER TABLE week_availability_confirmed ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own confirmations
DROP POLICY IF EXISTS "Users can manage own availability confirmations" ON week_availability_confirmed;
CREATE POLICY "Users can manage own availability confirmations" ON week_availability_confirmed
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);



