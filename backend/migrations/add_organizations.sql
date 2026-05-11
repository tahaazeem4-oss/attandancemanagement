-- ============================================================
--  Migration: Add Organizations table (parent of schools/campuses)
--  The existing "schools" table acts as campuses.
--  This adds the parent "organizations" (school groups) level.
-- ============================================================

-- Step 1: Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Insert a default organization for all existing schools
INSERT INTO organizations (name)
SELECT 'Default Organization'
WHERE NOT EXISTS (SELECT 1 FROM organizations LIMIT 1);

-- Step 3: Add org_id column to schools table
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS org_id INT;

-- Step 4: Link all existing schools to the default organization
UPDATE schools
SET org_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
WHERE org_id IS NULL;

-- Step 5: Make org_id NOT NULL and add foreign key
ALTER TABLE schools
  ALTER COLUMN org_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_schools_org_id'
  ) THEN
    ALTER TABLE schools
      ADD CONSTRAINT fk_schools_org_id
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;
