const db = require('../config/db');

// ── GET /api/classes ──────────────────────────────────────────
exports.getAllClasses = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [rows] = await db.query('SELECT * FROM classes WHERE school_id=? ORDER BY id', [sid]);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/classes/:classId/sections ───────────────────────
exports.getSections = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM sections WHERE class_id = ? ORDER BY section_name',
      [req.params.classId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
