-- Auto-normalize phone numbers on INSERT/UPDATE for all user tables.
-- Converts any Pakistan phone format to +92XXXXXXXXXX before storage.
-- This ensures login queries for +92XXXXXXXXXX always find the record.

CREATE OR REPLACE FUNCTION public.normalize_phone_format()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  d text;
BEGIN
  IF NEW.phone IS NOT NULL AND TRIM(NEW.phone) <> '' THEN
    -- Strip everything except digits
    d := REGEXP_REPLACE(TRIM(NEW.phone), '[^0-9]', '', 'g');

    IF d ~ '^92[0-9]{9,10}$' THEN
      -- 923001234567 (12 digits) or 920012345678 → +92...
      NEW.phone := '+' || d;
    ELSIF d ~ '^0[0-9]{10}$' THEN
      -- 03001234567 (11 digits starting with 0) → +923001234567
      NEW.phone := '+92' || SUBSTRING(d FROM 2);
    ELSIF d ~ '^3[0-9]{9}$' THEN
      -- 3001234567 (10 digits starting with 3) → +923001234567
      NEW.phone := '+92' || d;
    ELSE
      -- Already +92..., 0092..., or unrecognised — strip spaces/dashes only
      NEW.phone := REGEXP_REPLACE(TRIM(NEW.phone), '[\s\-]', '', 'g');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to all user tables
DROP TRIGGER IF EXISTS teachers_normalize_phone     ON public.teachers;
DROP TRIGGER IF EXISTS admins_normalize_phone       ON public.admins;
DROP TRIGGER IF EXISTS parents_normalize_phone      ON public.parents;
DROP TRIGGER IF EXISTS org_admins_normalize_phone   ON public.org_admins;
DROP TRIGGER IF EXISTS super_admins_normalize_phone ON public.super_admins;

CREATE TRIGGER teachers_normalize_phone
  BEFORE INSERT OR UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_format();

CREATE TRIGGER admins_normalize_phone
  BEFORE INSERT OR UPDATE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_format();

CREATE TRIGGER parents_normalize_phone
  BEFORE INSERT OR UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_format();

CREATE TRIGGER org_admins_normalize_phone
  BEFORE INSERT OR UPDATE ON public.org_admins
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_format();

CREATE TRIGGER super_admins_normalize_phone
  BEFORE INSERT OR UPDATE ON public.super_admins
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_format();
