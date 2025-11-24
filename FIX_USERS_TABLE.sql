-- Fix users table: Add missing email_verified column if it doesn't exist
-- Run this in your Supabase SQL Editor

-- First, check if the column exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'email_verified'
  ) THEN
    -- Add the column if it doesn't exist
    ALTER TABLE users ADD COLUMN email_verified TIMESTAMPTZ;
    RAISE NOTICE 'Added email_verified column to users table';
  ELSE
    RAISE NOTICE 'email_verified column already exists';
  END IF;
END $$;

-- Verify the fix
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
  AND table_schema = 'public'
ORDER BY ordinal_position;



