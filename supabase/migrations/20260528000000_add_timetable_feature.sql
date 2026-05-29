CREATE TABLE IF NOT EXISTS public.school_timetable_days (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_key VARCHAR(16) NOT NULL,
  day_label VARCHAR(32) NOT NULL,
  display_order INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, day_key)
);

CREATE TABLE IF NOT EXISTS public.school_timetable_slots (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  slot_name VARCHAR(64) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_type VARCHAR(24) NOT NULL DEFAULT 'instruction' CHECK (slot_type IN ('instruction', 'break', 'assembly', 'free_period', 'other')),
  display_order INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, display_order)
);

CREATE TABLE IF NOT EXISTS public.section_timetable_entries (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id INT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  section_id INT NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  day_key VARCHAR(16) NOT NULL,
  slot_id INT NOT NULL REFERENCES public.school_timetable_slots(id) ON DELETE CASCADE,
  subject_id INT NULL REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id INT NULL REFERENCES public.teachers(id) ON DELETE SET NULL,
  note TEXT NULL,
  version_status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (version_status IN ('draft', 'published')),
  updated_by_role VARCHAR(24) NULL,
  updated_by_id INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, section_id, day_key, slot_id, version_status)
);

CREATE INDEX IF NOT EXISTS idx_school_timetable_days_school_order
  ON public.school_timetable_days (school_id, display_order);

CREATE INDEX IF NOT EXISTS idx_school_timetable_slots_school_order
  ON public.school_timetable_slots (school_id, display_order);

CREATE INDEX IF NOT EXISTS idx_section_timetable_entries_scope
  ON public.section_timetable_entries (school_id, class_id, section_id, version_status, day_key);

CREATE INDEX IF NOT EXISTS idx_section_timetable_entries_teacher_slot
  ON public.section_timetable_entries (teacher_id, day_key, slot_id, version_status)
  WHERE teacher_id IS NOT NULL;

INSERT INTO public.school_timetable_days (school_id, day_key, day_label, display_order)
SELECT s.id, day_seed.day_key, day_seed.day_label, day_seed.display_order
FROM public.schools s
CROSS JOIN (
  VALUES
    ('monday', 'Monday', 1),
    ('tuesday', 'Tuesday', 2),
    ('wednesday', 'Wednesday', 3),
    ('thursday', 'Thursday', 4),
    ('friday', 'Friday', 5)
) AS day_seed(day_key, day_label, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.school_timetable_days d
  WHERE d.school_id = s.id
);
