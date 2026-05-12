-- Remove direct student login accounts and map all students to dummy parent accounts.
-- Default dummy parent credentials:
--   email: parent<schoolId>_<familyNo>@parent.com
--   password: Karachi@123

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Remove all student login credentials (student portal will be parent-only).
DELETE FROM student_accounts;

-- 2) Build deterministic student -> dummy parent mapping per school.
CREATE TEMP TABLE tmp_student_parent_map AS
WITH ordered AS (
  SELECT
    s.id AS student_id,
    s.school_id,
    s.first_name,
    ROW_NUMBER() OVER (PARTITION BY s.school_id ORDER BY s.id) AS rn
  FROM students s
),
planned AS (
  SELECT
    o.student_id,
    o.school_id,
    -- Pattern per school: 2 kids share same parent, then 1 kid has single parent.
    -- This creates a mix of multi-child and single-child parents.
    (((o.rn - 1) / 3) * 2) +
      CASE WHEN ((o.rn - 1) % 3) IN (0, 1) THEN 1 ELSE 2 END AS family_no
  FROM ordered o
),
family_heads AS (
  SELECT p.school_id, p.family_no, MIN(p.student_id) AS head_student_id
  FROM planned p
  GROUP BY p.school_id, p.family_no
)
SELECT
  p.student_id,
  p.school_id,
  p.family_no,
  CONCAT('dummyparent', p.school_id, '_', p.family_no, '@parent.com') AS parent_email,
  COALESCE(NULLIF(hs.first_name, ''), 'Parent') AS parent_first_name,
  CONCAT('Family ', p.family_no) AS parent_last_name
FROM planned p
JOIN family_heads fh
  ON fh.school_id = p.school_id AND fh.family_no = p.family_no
JOIN students hs
  ON hs.id = fh.head_student_id;

-- 3) Remove existing parent links for current students so remapping is clean.
DELETE FROM parent_student
WHERE student_id IN (SELECT student_id FROM tmp_student_parent_map);

-- 4) Remove previously generated dummy parents (idempotent reruns).
DELETE FROM parent_school_access
WHERE parent_id IN (
  SELECT id FROM parents WHERE email ~ '^(parent|dummyparent)[0-9]+_[0-9]+@parent\.com$'
);

DELETE FROM parent_student
WHERE parent_id IN (
  SELECT id FROM parents WHERE email ~ '^(parent|dummyparent)[0-9]+_[0-9]+@parent\.com$'
);

DELETE FROM parents
WHERE email ~ '^(parent|dummyparent)[0-9]+_[0-9]+@parent\.com$';

-- 5) Create dummy parent accounts.
INSERT INTO parents (email, password, first_name, last_name, school_id, phone)
SELECT
  seed.parent_email,
  extensions.crypt('Karachi@123', extensions.gen_salt('bf')),
  seed.parent_first_name,
  seed.parent_last_name,
  seed.school_id,
  NULL
FROM (
  SELECT
    m.parent_email,
    MIN(m.parent_first_name) AS parent_first_name,
    MIN(m.parent_last_name) AS parent_last_name,
    MIN(m.school_id) AS school_id
  FROM tmp_student_parent_map m
  GROUP BY m.parent_email
) seed
LEFT JOIN parents p ON LOWER(p.email) = LOWER(seed.parent_email)
WHERE p.id IS NULL;

-- 6) Link students to generated parents.
INSERT INTO parent_student (parent_id, student_id, relationship, verified)
SELECT
  p.id,
  m.student_id,
  'parent',
  true
FROM tmp_student_parent_map m
JOIN parents p ON p.email = m.parent_email
ON CONFLICT (parent_id, student_id) DO NOTHING;

-- 7) Ensure parent school access rows exist.
INSERT INTO parent_school_access (parent_id, school_id)
SELECT DISTINCT p.id, m.school_id
FROM tmp_student_parent_map m
JOIN parents p ON p.email = m.parent_email
ON CONFLICT (parent_id, school_id) DO NOTHING;

COMMIT;
