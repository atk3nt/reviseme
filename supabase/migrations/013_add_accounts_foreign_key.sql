-- Migration: Add foreign key constraint to accounts table
-- This prevents orphaned accounts (accounts without a corresponding user)
-- Created: 2026-01-17

-- Add foreign key constraint to ensure every account has a valid user
-- ON DELETE CASCADE means if a user is deleted, their accounts are also deleted
ALTER TABLE accounts
ADD CONSTRAINT accounts_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Add index on user_id for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Add comment to document the constraint
COMMENT ON CONSTRAINT accounts_user_id_fkey ON accounts IS 
'Ensures every account is linked to a valid user. Prevents orphaned accounts.';
