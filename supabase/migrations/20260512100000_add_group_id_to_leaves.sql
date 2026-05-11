-- Add group_id to leave_applications (required for multi-date leave grouping)
-- The backend groups leave rows by group_id to show multi-date requests as one entry.
-- Safe to run multiple times.
ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS group_id UUID DEFAULT gen_random_uuid();

-- Backfill existing rows that have NULL group_id (each gets its own UUID)
UPDATE leave_applications
  SET group_id = gen_random_uuid()
  WHERE group_id IS NULL;

-- Index for fast group lookups
CREATE INDEX IF NOT EXISTS idx_leave_applications_group
  ON leave_applications (group_id);
