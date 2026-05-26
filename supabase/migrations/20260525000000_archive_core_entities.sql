ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_by_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_by_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_by_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_by_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS archived_by_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_schools_is_active ON schools(is_active);
CREATE INDEX IF NOT EXISTS idx_teachers_school_active ON teachers(school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_classes_school_active ON classes(school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sections_class_active ON sections(class_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subjects_school_active ON subjects(school_id, is_active);