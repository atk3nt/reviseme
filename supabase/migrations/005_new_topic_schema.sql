-- Migration: Update topics and specs schema to match new CSV format
-- Run this in Supabase SQL Editor: https://supabase.com > SQL Editor

-- =====================================================
-- STEP 1: Update specs table
-- =====================================================

-- Rename board to exam_board
ALTER TABLE specs RENAME COLUMN IF EXISTS board TO exam_board;

-- Drop old name column (we'll generate it via slug or derive it)
ALTER TABLE specs DROP COLUMN IF EXISTS name;

-- Add slug as generated column
ALTER TABLE specs ADD COLUMN IF NOT EXISTS slug TEXT 
  GENERATED ALWAYS AS (lower(replace(subject,' ','-')) || '-' || lower(exam_board)) STORED;

-- Add unique constraint on (subject, exam_board)
ALTER TABLE specs DROP CONSTRAINT IF EXISTS specs_subject_exam_board_key;
ALTER TABLE specs ADD CONSTRAINT specs_subject_exam_board_key UNIQUE (subject, exam_board);

-- =====================================================
-- STEP 2: Drop old flat columns from topics (if they exist)
-- =====================================================

ALTER TABLE topics DROP COLUMN IF EXISTS subject;
ALTER TABLE topics DROP COLUMN IF EXISTS board;
ALTER TABLE topics DROP COLUMN IF EXISTS level_1;
ALTER TABLE topics DROP COLUMN IF EXISTS level_2;
ALTER TABLE topics DROP COLUMN IF EXISTS level_3;
ALTER TABLE topics DROP COLUMN IF EXISTS est_minutes;

-- =====================================================
-- STEP 3: Update topics table schema
-- =====================================================

-- Rename name to title
ALTER TABLE topics RENAME COLUMN IF EXISTS name TO title;

-- Drop old parent_id foreign key constraint
ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_parent_id_fkey;

-- Drop parent_id column (we'll use parent_title instead)
ALTER TABLE topics DROP COLUMN IF EXISTS parent_id;

-- Add parent_title column
ALTER TABLE topics ADD COLUMN IF NOT EXISTS parent_title TEXT;

-- Add order_index column
ALTER TABLE topics ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

-- Drop duration_minutes (not needed in new schema)
ALTER TABLE topics DROP COLUMN IF EXISTS duration_minutes;

-- Update level constraint to ensure it's 1, 2, or 3
ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_level_check;
ALTER TABLE topics ADD CONSTRAINT topics_level_check CHECK (level IN (1, 2, 3));

-- =====================================================
-- STEP 4: Create indexes
-- =====================================================

-- Drop old indexes that reference removed columns
DROP INDEX IF EXISTS idx_topics_subject;
DROP INDEX IF EXISTS idx_topics_board;
DROP INDEX IF EXISTS idx_topics_subject_board;
DROP INDEX IF EXISTS idx_topics_level_1;
DROP INDEX IF EXISTS idx_topics_parent_id;

-- Create new composite index for efficient queries
CREATE INDEX IF NOT EXISTS topics_spec_level_idx ON topics(spec_id, level, parent_title, order_index);

-- =====================================================
-- STEP 5: Enable RLS and set policies
-- =====================================================

-- Enable RLS on specs table
ALTER TABLE specs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on topics table
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "specs_select_authenticated" ON specs;
DROP POLICY IF EXISTS "specs_block_insert_update" ON specs;
DROP POLICY IF EXISTS "topics_select_authenticated" ON topics;
DROP POLICY IF EXISTS "topics_block_insert_update" ON topics;

-- Specs: Allow SELECT for authenticated users only
CREATE POLICY "specs_select_authenticated" ON specs
  FOR SELECT
  TO authenticated
  USING (true);

-- Specs: Block INSERT/UPDATE for authenticated users (service role only)
CREATE POLICY "specs_block_insert_update" ON specs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Topics: Allow SELECT for authenticated users only
CREATE POLICY "topics_select_authenticated" ON topics
  FOR SELECT
  TO authenticated
  USING (true);

-- Topics: Block INSERT/UPDATE for authenticated users (service role only)
CREATE POLICY "topics_block_insert_update" ON topics
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Note: Service role (used by import script) bypasses RLS automatically


