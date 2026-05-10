-- Add campus_id and created_by_admin_id to parents table for campus-scoped parent management
-- These track which campus the parent belongs to and which admin created them
ALTER TABLE parents ADD COLUMN campus_id UUID;
ALTER TABLE parents ADD COLUMN created_by_admin_id UUID;

-- Add indexes for filtering by campus
CREATE INDEX IF NOT EXISTS idx_parents_campus_id ON parents(campus_id);
CREATE INDEX IF NOT EXISTS idx_parents_created_by_admin_id ON parents(created_by_admin_id);

-- Drop old email unique constraint and add campus-scoped unique constraint
ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_email_key;
ALTER TABLE parents ADD CONSTRAINT parents_email_campus_unique UNIQUE(email, campus_id);
