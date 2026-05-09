-- ── Organizations (parent school entities) ───────────────────
-- Each organization = a "school" (e.g., "ABC Academy")
-- Each row in the existing `schools` table = a campus of that school

CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add org_id to schools table (schools are now "campuses")
ALTER TABLE schools ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- Seed: for every existing school create a matching organization (same name)
DO $$
DECLARE
  sc          RECORD;
  new_org_id  INTEGER;
BEGIN
  FOR sc IN SELECT id, name FROM schools WHERE org_id IS NULL LOOP
    INSERT INTO organizations (name) VALUES (sc.name) RETURNING id INTO new_org_id;
    UPDATE schools SET org_id = new_org_id WHERE id = sc.id;
  END LOOP;
END $$;
