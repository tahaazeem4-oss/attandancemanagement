-- Replace the entire timetable module with a single, normalized table.
-- Old design: school_timetable_days + school_timetable_slots (shared bell
-- schedule) + section_timetable_entries (draft/published dual-row
-- versioning) + school_holidays. New design: one row per class period,
-- saved immediately (no draft/publish), with an explicit 'friday' override
-- bucket that falls back to the normal week when absent.

CREATE TABLE IF NOT EXISTS timetable_periods (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id       int NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id        int NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id      int NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  day_key         text NOT NULL CHECK (day_key IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  schedule_type   text NOT NULL DEFAULT 'default' CHECK (schedule_type IN ('default','friday')),
  period_order    int NOT NULL,
  subject_id      int REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id      int REFERENCES teachers(id) ON DELETE SET NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  updated_by_role text,
  updated_by_id   bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timetable_periods_time_order CHECK (end_time > start_time),
  CONSTRAINT timetable_periods_friday_only CHECK (schedule_type = 'default' OR day_key = 'friday'),
  CONSTRAINT timetable_periods_unique_slot UNIQUE (class_id, section_id, schedule_type, day_key, period_order)
);

CREATE INDEX IF NOT EXISTS idx_timetable_periods_scope
  ON timetable_periods (school_id, class_id, section_id, schedule_type, day_key);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_teacher
  ON timetable_periods (teacher_id) WHERE teacher_id IS NOT NULL;

-- Migrate existing PUBLISHED data (drafts are unsaved work, discarded).
-- Skip non-instruction slots (breaks/assembly/free periods carry no
-- subject/teacher and have no place in the new per-class period model).
-- period_order is recomputed per (class, section, day) since the old
-- display_order was global to the school's slot list, not contiguous once
-- break/assembly rows are filtered out.
INSERT INTO timetable_periods (
  school_id, class_id, section_id, day_key, schedule_type, period_order,
  subject_id, teacher_id, start_time, end_time, created_at, updated_at
)
SELECT
  e.school_id,
  e.class_id,
  e.section_id,
  e.day_key,
  'default',
  ROW_NUMBER() OVER (
    PARTITION BY e.class_id, e.section_id, e.day_key
    ORDER BY s.display_order
  ) AS period_order,
  e.subject_id,
  e.teacher_id,
  s.start_time,
  s.end_time,
  now(),
  now()
FROM section_timetable_entries e
JOIN school_timetable_slots s ON s.id = e.slot_id
WHERE e.version_status = 'published'
  AND s.slot_type = 'instruction'
  AND s.start_time IS NOT NULL
  AND s.end_time IS NOT NULL
  AND s.end_time > s.start_time
ON CONFLICT (class_id, section_id, schedule_type, day_key, period_order) DO NOTHING;

DROP TABLE IF EXISTS section_timetable_entries;
DROP TABLE IF EXISTS school_timetable_slots;
DROP TABLE IF EXISTS school_timetable_days;
DROP TABLE IF EXISTS school_holidays;
