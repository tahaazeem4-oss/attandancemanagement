-- Add phone column to super_admins and org_admins (teachers, admins, parents already have it)
ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL;

ALTER TABLE public.org_admins
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL;

-- Deduplicate phone numbers before creating unique indexes.
-- Keep the lowest-id row's phone and null out duplicates in each table.
UPDATE public.teachers t
SET phone = NULL
WHERE phone IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM public.teachers WHERE phone IS NOT NULL GROUP BY phone
  );

UPDATE public.admins a
SET phone = NULL
WHERE phone IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM public.admins WHERE phone IS NOT NULL GROUP BY phone
  );

UPDATE public.parents p
SET phone = NULL
WHERE phone IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM public.parents WHERE phone IS NOT NULL GROUP BY phone
  );

-- Partial unique indexes on phone (NULLs are excluded — multiple NULLs allowed)
-- This enforces uniqueness once a phone is set, while not breaking existing rows with no phone.
CREATE UNIQUE INDEX IF NOT EXISTS super_admins_phone_unique
  ON public.super_admins(phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admins_phone_unique
  ON public.admins(phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS org_admins_phone_unique
  ON public.org_admins(phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teachers_phone_unique
  ON public.teachers(phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS parents_phone_unique
  ON public.parents(phone) WHERE phone IS NOT NULL;
