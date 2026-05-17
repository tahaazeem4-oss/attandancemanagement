-- Normalize school subjects and prevent case/spacing duplicates.

WITH ranked AS (
  SELECT
    id,
    school_id,
    LOWER(BTRIM(name)) AS normalized_name,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, LOWER(BTRIM(name))
      ORDER BY id
    ) AS row_num
  FROM school_subjects
)
DELETE FROM school_subjects s
USING ranked r
WHERE s.id = r.id
  AND r.row_num > 1;

UPDATE school_subjects
SET name = REGEXP_REPLACE(BTRIM(name), '\s+', ' ', 'g')
WHERE name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS school_subjects_school_name_normalized_uidx
  ON school_subjects (school_id, LOWER(BTRIM(name)));