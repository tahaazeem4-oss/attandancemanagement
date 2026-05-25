-- Re-run phone normalization to catch any records inserted after 20260523020000
-- but before the normalize trigger (20260523030000) was deployed.
-- The DO $$ block is idempotent: already-normalized +92... phones are left unchanged.

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
