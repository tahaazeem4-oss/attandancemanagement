-- Ensure leave_applications.status allows 'cancelled'
-- (safe to run multiple times)
ALTER TABLE leave_applications
  DROP CONSTRAINT IF EXISTS leave_applications_status_check;

ALTER TABLE leave_applications
  ADD CONSTRAINT leave_applications_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled'));

-- Ensure withdrawal_status column exists
ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS withdrawal_status VARCHAR(20) DEFAULT NULL;

-- Ensure teacher_id is nullable in student_attendance
-- (admin can mark leave without a teacher_id)
ALTER TABLE student_attendance
  ALTER COLUMN teacher_id DROP NOT NULL;
