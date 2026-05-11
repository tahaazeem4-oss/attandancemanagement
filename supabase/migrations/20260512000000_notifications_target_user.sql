-- Extend notifications to support per-user targeting (specific admin / specific teacher)
-- 1. Add target_user_id column (nullable, stores admin/teacher ID for specific targets)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id INT;

-- 2. Drop old constraint and replace with extended one
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_target_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_target_type_check
  CHECK (target_type IN ('school','class','section','student','specific_admin','specific_teacher'));

-- 3. Add group_id to leave_applications (required for multi-date leave grouping)
--    Safe to run multiple times (IF NOT EXISTS).
ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS group_id UUID DEFAULT gen_random_uuid();

-- Backfill any rows that may have a NULL group_id (assigns a unique UUID per row)
UPDATE leave_applications
  SET group_id = gen_random_uuid()
  WHERE group_id IS NULL;

