-- Add missing columns needed by org-admin import/export
-- schools table is missing city, address, phone
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS city    VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone   VARCHAR(20)  DEFAULT NULL;

-- admins table is missing phone
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL;
