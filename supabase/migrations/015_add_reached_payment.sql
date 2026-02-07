-- Track when user reached the payment page (slide 17) for funnel analytics
ALTER TABLE users ADD COLUMN IF NOT EXISTS reached_payment_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_reached_payment_at ON users(reached_payment_at) WHERE reached_payment_at IS NOT NULL;
