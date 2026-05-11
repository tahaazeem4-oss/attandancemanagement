-- Migration: add parent_school_access table for multi-campus parent accounts
-- Tracks which campuses a parent has access to (many-to-many)

CREATE TABLE IF NOT EXISTS parent_school_access (
  parent_id INT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, school_id)
);

-- Index for fast lookups by school/campus
CREATE INDEX IF NOT EXISTS idx_parent_school_access_school_id ON parent_school_access(school_id);

-- Backfill: register existing parents into the junction table based on their school_id
INSERT INTO parent_school_access (parent_id, school_id)
SELECT id, school_id FROM parents
WHERE school_id IS NOT NULL
ON CONFLICT (parent_id, school_id) DO NOTHING;
