-- Migration: add parent_school_access table for multi-campus parent accounts
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS parent_school_access (
  parent_id INT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, school_id)
);

-- Index for fast lookups by school
CREATE INDEX IF NOT EXISTS idx_parent_school_access_school_id ON parent_school_access(school_id);
