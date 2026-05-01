const db = require('../config/db');

// ── GET /api/subjects ─────────────────────────────────────────
// Returns all subjects for this school (teacher + admin)
exports.listSubjects = async (req, res) => {
  try {
    const { school_id } = req.user;
    const [rows] = await db.query(
      `SELECT id, name FROM school_subjects WHERE school_id = $1 ORDER BY name`,
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
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Subject name is required' });
    if (name.length > 100) return res.status(400).json({ message: 'Subject name too long (max 100 chars)' });

    const [rows] = await db.query(
      `INSERT INTO school_subjects (school_id, name)
       VALUES ($1, $2)
       ON CONFLICT (school_id, name) DO NOTHING
       RETURNING id, name`,
      [school_id, name]
    );

    if (!rows.length) {
      // already exists — return existing row
      const [existing] = await db.query(
        `SELECT id, name FROM school_subjects WHERE school_id = $1 AND name = $2`,
        [school_id, name]
      );
      return res.status(200).json(existing[0]);
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ message: 'Subjects table not set up yet. Please run the database migration (add_school_subjects.sql) in Supabase.' });
    }
    console.error('[addSubject]', err);
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
