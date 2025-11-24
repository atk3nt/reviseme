-- Migration: Add flat topic columns for easier querying
-- This adds subject, board, level_1, level_2, level_3, and est_minutes columns
-- to support the application's flat query structure

-- Add flat columns to topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS board TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS level_1 TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS level_2 TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS level_3 TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS est_minutes INTEGER;

-- Create indexes for the new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject);
CREATE INDEX IF NOT EXISTS idx_topics_board ON topics(board);
CREATE INDEX IF NOT EXISTS idx_topics_subject_board ON topics(subject, board);
CREATE INDEX IF NOT EXISTS idx_topics_level_1 ON topics(level_1);

-- Add comments for clarity
COMMENT ON COLUMN topics.subject IS 'Full subject name (e.g., Mathematics, Biology)';
COMMENT ON COLUMN topics.board IS 'Exam board (e.g., AQA, Edexcel, OCR)';
COMMENT ON COLUMN topics.level_1 IS 'Main topic name (level 1 parent)';
COMMENT ON COLUMN topics.level_2 IS 'Sub-topic name (level 2 parent, optional)';
COMMENT ON COLUMN topics.level_3 IS 'Specific topic name (level 3 - what students rate)';
COMMENT ON COLUMN topics.est_minutes IS 'Estimated minutes (mapped from duration_minutes)';


