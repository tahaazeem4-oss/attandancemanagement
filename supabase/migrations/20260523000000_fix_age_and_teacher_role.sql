-- ============================================================
-- Fix: make students.age nullable (optional in org/super-admin views)
-- Fix: ensure teachers.teacher_role column exists with a safe default
-- ============================================================

-- students.age is now optional (multi-org views don't require it)
ALTER TABLE public.students
  ALTER COLUMN age DROP NOT NULL;

-- Ensure teacher_role column exists in teachers (idempotent)
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS teacher_role text;

-- Backfill any NULL values
UPDATE public.teachers
SET teacher_role = CASE
  WHEN (SELECT COUNT(*) FROM public.teacher_classes tc WHERE tc.teacher_id = teachers.id) = 0 THEN 'subject_teacher'
  WHEN (SELECT COUNT(*) FROM public.teacher_classes tc WHERE tc.teacher_id = teachers.id) = 1 THEN 'class_teacher'
  ELSE 'floor_incharge'
END
WHERE teacher_role IS NULL
   OR teacher_role NOT IN ('class_teacher', 'floor_incharge', 'subject_teacher');

-- Set default and NOT NULL
ALTER TABLE public.teachers
  ALTER COLUMN teacher_role SET DEFAULT 'subject_teacher';

ALTER TABLE public.teachers
  ALTER COLUMN teacher_role SET NOT NULL;

-- Ensure constraint exists (drop and recreate for idempotency)
ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_teacher_role_check;

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_teacher_role_check
  CHECK (teacher_role IN ('class_teacher', 'floor_incharge', 'subject_teacher'));
