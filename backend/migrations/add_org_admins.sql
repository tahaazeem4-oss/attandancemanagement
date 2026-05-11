-- ============================================================
--  Migration: Add org_admins table (organization-level admins)
--  These users can see all campuses within their organization.
-- ============================================================

CREATE TABLE IF NOT EXISTS org_admins (
  id         SERIAL PRIMARY KEY,
  org_id     INT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
