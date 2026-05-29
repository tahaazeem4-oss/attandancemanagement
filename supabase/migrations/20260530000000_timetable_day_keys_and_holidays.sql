-- Per-day slot scoping for the school timetable structure.
ALTER TABLE school_timetable_slots
  ADD COLUMN IF NOT EXISTS day_keys text[] NULL;

CREATE INDEX IF NOT EXISTS idx_school_timetable_slots_day_keys
  ON school_timetable_slots USING GIN (day_keys);

-- Calendar-date holidays per school.
CREATE TABLE IF NOT EXISTS school_holidays (
  id           bigserial PRIMARY KEY,
  school_id    bigint NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  holiday_date date   NOT NULL,
  label        text   NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_school_holidays_school_date
  ON school_holidays (school_id, holiday_date);
