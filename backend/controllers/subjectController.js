const db = require('../config/db');

const normalizeSubjectName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

async function findExistingSubject(schoolId, name, excludeId = null) {
  const params = [schoolId, name];
  let sql = `
    SELECT id, BTRIM(name) AS name
    FROM school_subjects
    WHERE school_id = $1
      AND LOWER(BTRIM(name)) = LOWER(BTRIM($2))
  `;
  if (excludeId !== null) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ` ORDER BY id LIMIT 1`;
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

// ── GET /api/subjects ─────────────────────────────────────────
// Returns all subjects for this school (teacher + admin)
exports.listSubjects = async (req, res) => {
  try {
    const { school_id } = req.user;
    const [rows] = await db.query(
      `SELECT DISTINCT ON (LOWER(BTRIM(name))) id, BTRIM(name) AS name
       FROM school_subjects
       WHERE school_id = $1
         AND BTRIM(name) <> ''
       ORDER BY LOWER(BTRIM(name)), id`,
      [school_id]
    );
    res.json(rows);
  } catch (err) {
    // Table may not exist yet — return empty list so UI doesn't crash
    if (err.code === '42P01') return res.json([]);
    console.error('[listSubjects]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/subjects ────────────────────────────────────────
// Admin adds a subject to the school
exports.addSubject = async (req, res) => {
  try {
    const { school_id } = req.user;
    const name = normalizeSubjectName(req.body.name);
    if (!name) return res.status(400).json({ message: 'Subject name is required' });
    if (name.length > 100) return res.status(400).json({ message: 'Subject name too long (max 100 chars)' });

    const existing = await findExistingSubject(school_id, name);
    if (existing) {
      return res.status(200).json(existing);
    }

    const [rows] = await db.query(
      `INSERT INTO school_subjects (school_id, name)
       VALUES ($1, $2)
       RETURNING id, name`,
      [school_id, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Subjects table not set up yet. Please run the database migration (add_school_subjects.sql) in Supabase.' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Subject already exists' });
    }
    console.error('[addSubject]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── PUT /api/subjects/:id ─────────────────────────────────────
// Teacher/admin renames a subject in the school-scoped master list
exports.updateSubject = async (req, res) => {
  try {
    const { school_id } = req.user;
    const { id } = req.params;
    const name = normalizeSubjectName(req.body.name);
    if (!name) return res.status(400).json({ message: 'Subject name is required' });
    if (name.length > 100) return res.status(400).json({ message: 'Subject name too long (max 100 chars)' });

    const existing = await findExistingSubject(school_id, name, Number(id));
    if (existing) {
      return res.status(409).json({ message: 'Subject already exists' });
    }

    const [rows] = await db.query(
      `UPDATE school_subjects
       SET name = $1
       WHERE id = $2 AND school_id = $3
       RETURNING id, name`,
      [name, id, school_id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Subject not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Subject already exists' });
    }
    console.error('[updateSubject]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE /api/subjects/:id ──────────────────────────────────
// Admin deletes a subject (scoped to school)
exports.deleteSubject = async (req, res) => {
  try {
    const { school_id } = req.user;
    const { id } = req.params;
    await db.query(
      `DELETE FROM school_subjects WHERE id = $1 AND school_id = $2`,
      [id, school_id]
    );
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[deleteSubject]', err);
    res.status(500).json({ message: 'Server error' });
  }
};
