-- Normalize all existing phone numbers to +92XXXXXXXXXX format (no spaces, no dashes)
-- This fixes login for existing users whose phones were stored in mixed formats.

-- Step 1: Drop unique phone indexes so we can freely update rows
DROP INDEX IF EXISTS public.teachers_phone_unique;
DROP INDEX IF EXISTS public.admins_phone_unique;
DROP INDEX IF EXISTS public.parents_phone_unique;
DROP INDEX IF EXISTS public.org_admins_phone_unique;
DROP INDEX IF EXISTS public.super_admins_phone_unique;

-- Step 2: Normalize phones in all user tables
-- Rules (applied to digit-only form):
--   92XXXXXXXXXX (12 digits, starts 92) → +92XXXXXXXXXX
--   0XXXXXXXXXX  (11 digits, starts 0)  → +92XXXXXXXXXX
--   3XXXXXXXXX   (10 digits, starts 3)  → +923XXXXXXXXX

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['teachers','admins','parents','org_admins','super_admins'] LOOP
    EXECUTE format($sql$
      UPDATE public.%I
      SET phone = CASE
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^92[0-9]{9,10}$'
          THEN '+' || REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^0[0-9]{10}$'
          THEN '+92' || SUBSTRING(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 2)
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^3[0-9]{9}$'
          THEN '+92' || REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
        ELSE phone
      END
      WHERE phone IS NOT NULL AND phone <> ''
    $sql$, _tbl);
  END LOOP;
END $$;

-- Step 3: After normalization, deduplicate — keep lowest id per normalized phone, null out the rest
DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['teachers','admins','parents','org_admins','super_admins'] LOOP
    EXECUTE format($sql$
      UPDATE public.%I t SET phone = NULL
      WHERE phone IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id) FROM public.%I WHERE phone IS NOT NULL GROUP BY phone
        )
    $sql$, _tbl, _tbl);
  END LOOP;
END $$;

-- Step 4: Recreate unique partial indexes
CREATE UNIQUE INDEX IF NOT EXISTS teachers_phone_unique    ON public.teachers(phone)    WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admins_phone_unique      ON public.admins(phone)      WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS parents_phone_unique     ON public.parents(phone)     WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_admins_phone_unique  ON public.org_admins(phone)  WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS super_admins_phone_unique ON public.super_admins(phone) WHERE phone IS NOT NULL;
