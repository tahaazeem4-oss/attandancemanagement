-- Rename generated dummy parent emails to firstname@parent.com style.
-- If duplicate/conflicting emails exist, append a numeric suffix (e.g. ali2@parent.com).

BEGIN;

DO $$
DECLARE
  rec RECORD;
  base_name TEXT;
  candidate_email TEXT;
  suffix_num INTEGER;
BEGIN
  FOR rec IN
    SELECT p.id, p.first_name
    FROM parents p
    WHERE p.email ~ '^(parent|dummyparent)[0-9]+_[0-9]+@parent\.com$'
    ORDER BY p.id
  LOOP
    base_name := LOWER(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(rec.first_name), ''), 'parent'), '[^a-zA-Z0-9]+', '', 'g'));

    IF base_name = '' THEN
      base_name := 'parent';
    END IF;

    suffix_num := 0;

    LOOP
      candidate_email := base_name || CASE WHEN suffix_num = 0 THEN '' ELSE suffix_num::TEXT END || '@parent.com';

      BEGIN
        UPDATE parents
        SET email = candidate_email
        WHERE id = rec.id;

        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          suffix_num := suffix_num + 1;

          IF suffix_num > 999999 THEN
            RAISE EXCEPTION 'Unable to generate unique dummy parent email for parent id %', rec.id;
          END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
