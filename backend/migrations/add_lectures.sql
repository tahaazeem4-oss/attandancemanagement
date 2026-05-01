-- ── Lectures ──────────────────────────────────────────────────
-- Run this once in your Supabase SQL editor to add the lectures feature
CREATE TABLE IF NOT EXISTS lectures (
  id            SERIAL PRIMARY KEY,
  school_id     INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id    INT REFERENCES teachers(id) ON DELETE SET NULL,
  class_id      INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id    INT REFERENCES sections(id) ON DELETE CASCADE, -- NULL = visible to ALL sections
  subject_name  VARCHAR(150) NOT NULL,
  lecture_name  VARCHAR(200) NOT NULL,
  type          VARCHAR(20)  NOT NULL DEFAULT 'classwork'
                             CHECK (type IN ('classwork','homework')),
  date          DATE         NOT NULL,
  file_path     VARCHAR(500) NOT NULL,   -- relative filename inside uploads/lectures/
  uploaded_by   VARCHAR(150),            -- display name of uploader
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Index for fast student queries (class + section + date desc)
CREATE INDEX IF NOT EXISTS lectures_class_section_idx ON lectures (class_id, section_id, date DESC);
CREATE INDEX IF NOT EXISTS lectures_school_idx        ON lectures (school_id, date DESC);
