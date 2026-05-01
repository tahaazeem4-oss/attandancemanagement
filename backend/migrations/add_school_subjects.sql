-- ── School Subjects ──────────────────────────────────────────
-- Run this once in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS school_subjects (
  id         SERIAL PRIMARY KEY,
  school_id  INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS school_subjects_school_idx ON school_subjects (school_id, name);
