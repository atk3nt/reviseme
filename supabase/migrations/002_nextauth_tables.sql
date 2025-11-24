-- NextAuth.js required tables
-- Reference: https://authjs.dev/reference/adapter/supabase

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

-- Add email_verified field to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;

-- Create indexes for NextAuth tables
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

-- RLS policies for NextAuth tables
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all NextAuth tables
CREATE POLICY "Service role can manage verification_tokens" ON verification_tokens
  FOR ALL USING (true);

CREATE POLICY "Service role can manage accounts" ON accounts
  FOR ALL USING (true);

CREATE POLICY "Service role can manage sessions" ON sessions
  FOR ALL USING (true);


