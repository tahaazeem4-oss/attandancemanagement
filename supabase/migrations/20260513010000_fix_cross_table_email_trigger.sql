-- Repair cross-table email uniqueness trigger.
-- Fixes a bug where the trigger referenced students.email (column may not exist)
-- and caused inserts/updates to fail with generic server errors.

CREATE OR REPLACE FUNCTION check_email_unique_across_users()
RETURNS TRIGGER AS $$
DECLARE
  email_lower TEXT;
  cnt INT;
BEGIN
  IF NEW.email IS NULL OR TRIM(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  email_lower := LOWER(NEW.email);

  -- Check admins
  SELECT COUNT(*) INTO cnt FROM admins WHERE LOWER(email) = email_lower AND (TG_TABLE_NAME != 'admins' OR id != NEW.id);
  IF cnt > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Email already exists in admins';
  END IF;

  -- Check super admins
  SELECT COUNT(*) INTO cnt FROM super_admins WHERE LOWER(email) = email_lower AND (TG_TABLE_NAME != 'super_admins' OR id != NEW.id);
  IF cnt > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Email already exists in super_admins';
  END IF;

  -- Check org admins
  SELECT COUNT(*) INTO cnt FROM org_admins WHERE LOWER(email) = email_lower AND (TG_TABLE_NAME != 'org_admins' OR id != NEW.id);
  IF cnt > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Email already exists in org_admins';
  END IF;

  -- Check teachers
  SELECT COUNT(*) INTO cnt FROM teachers WHERE LOWER(email) = email_lower AND (TG_TABLE_NAME != 'teachers' OR id != NEW.id);
  IF cnt > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Email already exists in teachers';
  END IF;

  -- Check parents
  SELECT COUNT(*) INTO cnt FROM parents WHERE LOWER(email) = email_lower AND (TG_TABLE_NAME != 'parents' OR id != NEW.id);
  IF cnt > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Email already exists in parents';
  END IF;

  -- Check student portal accounts
  SELECT COUNT(*) INTO cnt FROM student_accounts WHERE LOWER(email) = email_lower AND (TG_TABLE_NAME != 'student_accounts' OR id != NEW.id);
  IF cnt > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Email already exists in student_accounts';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reattach trigger to all tables that actually have an email column and are part of user accounts
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['admins','super_admins','org_admins','teachers','parents','student_accounts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_unique_email ON %I', tbl);
    EXECUTE format('CREATE TRIGGER trg_unique_email BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION check_email_unique_across_users()', tbl);
  END LOOP;
END$$;
