-- Add school_id integer to parents table to match admin's school_id
ALTER TABLE parents ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS created_by_admin_id_int INTEGER;

CREATE INDEX IF NOT EXISTS idx_parents_school_id ON parents(school_id);

-- Drop campus-scoped unique and add school-scoped unique
ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_email_campus_unique;
ALTER TABLE parents ADD CONSTRAINT parents_email_school_unique UNIQUE(email, school_id);
