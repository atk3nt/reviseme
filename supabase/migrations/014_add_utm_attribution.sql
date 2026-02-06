-- Campaign attribution: store UTM params when user lands from email/marketing
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_captured_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_utm_campaign ON users(utm_campaign) WHERE utm_campaign IS NOT NULL;
