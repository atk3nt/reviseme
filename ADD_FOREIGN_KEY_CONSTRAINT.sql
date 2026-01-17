-- ============================================================================
-- CRITICAL FIX: Add Foreign Key Constraint to Accounts Table
-- ============================================================================
-- This prevents orphaned accounts (accounts without a corresponding user)
-- Run this in your Supabase SQL Editor
-- Date: 2026-01-17
-- ============================================================================

-- Step 1: Check for any orphaned accounts (accounts without a user)
-- This query will show you if there are any problematic accounts
SELECT 
  a.id as account_id,
  a.user_id,
  a.provider,
  a.provider_account_id,
  a.created_at
FROM accounts a
LEFT JOIN users u ON a.user_id = u.id
WHERE u.id IS NULL;

-- If the above query returns any rows, you have orphaned accounts.
-- You should delete them before adding the constraint:
-- DELETE FROM accounts WHERE user_id NOT IN (SELECT id FROM users);

-- ============================================================================

-- Step 2: Add the foreign key constraint
-- This ensures every account must have a valid user
ALTER TABLE accounts
ADD CONSTRAINT accounts_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Step 3: Add index for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Step 4: Add documentation comment
COMMENT ON CONSTRAINT accounts_user_id_fkey ON accounts IS 
'Ensures every account is linked to a valid user. Prevents orphaned accounts during OAuth sign-up.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running the above, verify the constraint was added:
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'accounts'::regclass
  AND conname = 'accounts_user_id_fkey';

-- You should see one row with the foreign key constraint details
-- ============================================================================
