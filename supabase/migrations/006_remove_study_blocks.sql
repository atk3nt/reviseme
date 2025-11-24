-- Migration: Remove duplicate study_blocks table
-- Run this in Supabase SQL Editor: https://supabase.com > SQL Editor
--
-- The study_blocks table was created in migration 003 but is not used.
-- All APIs use the 'blocks' table instead.
-- This migration removes the unused study_blocks table.

-- Drop study_blocks table if it exists
DROP TABLE IF EXISTS study_blocks CASCADE;

-- Note: CASCADE will automatically drop any indexes or constraints associated with the table
