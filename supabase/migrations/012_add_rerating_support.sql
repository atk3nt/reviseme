-- Migration: Add re-rating support to blocks table
-- This enables tracking when users re-rate topics after completing spaced repetition blocks

-- Add rerating_score column to blocks (user's confidence after completing the block)
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS rerating_score INTEGER CHECK (rerating_score >= 1 AND rerating_score <= 5);

-- Add session tracking columns for spaced repetition display ("Block 2/3" etc.)
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS session_number INTEGER;
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS session_total INTEGER;

-- Add index for querying blocks that have been re-rated
CREATE INDEX IF NOT EXISTS idx_blocks_rerating_score ON blocks(rerating_score) WHERE rerating_score IS NOT NULL;

-- Add index for finding blocks by topic for maintenance scheduling
CREATE INDEX IF NOT EXISTS idx_blocks_topic_completed ON blocks(user_id, topic_id, completed_at) WHERE completed_at IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN blocks.rerating_score IS 'User confidence re-rating after completing this block (1-5). Only applies to topics with original rating 1-3.';
COMMENT ON COLUMN blocks.session_number IS 'Which session this is in the spaced repetition sequence (e.g., 2 of 3)';
COMMENT ON COLUMN blocks.session_total IS 'Total sessions required for this topic based on original rating';



