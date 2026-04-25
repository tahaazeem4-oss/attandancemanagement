const db = require('../config/db');

// ── GET /api/students?class_id=&section_id= ───────────────────
exports.getStudents = async (req, res) => {
  const { class_id, section_id } = req.query;
  const sid = req.user.school_id;

  let query  = `SELECT s.*, c.class_name, sec.section_name
                FROM   students s
                JOIN   classes  c   ON c.id   = s.class_id
                JOIN   sections sec ON sec.id  = s.section_id
                WHERE  s.school_id = ?`;
  const params = [sid];

  if (class_id && section_id) {
    query += ' AND s.class_id = ? AND s.section_id = ?';
    params.push(class_id, section_id);
  } else if (class_id) {
    query += ' AND s.class_id = ?';
    params.push(class_id);
  }

  query += ' ORDER BY s.last_name, s.first_name';

  try {
    const [rows] = await db.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/students ────────────────────────────────────────
exports.addStudent = async (req, res) => {
  const { first_name, last_name, age, class_id, section_id, roll_no } = req.body;
  const sid = req.user.school_id;

  if (!first_name || !last_name || !age || !class_id || !section_id) {
    return res.status(400).json({ message: 'first_name, last_name, age, class_id and section_id are required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO students (school_id, first_name, last_name, age, class_id, section_id, roll_no) VALUES (?,?,?,?,?,?,?) RETURNING id',
      [sid, first_name, last_name, age, class_id, section_id, roll_no || null]
    );
    return res.status(201).json({ message: 'Student added', id: result[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── PUT /api/students/:id ─────────────────────────────────────
exports.updateStudent = async (req, res) => {
  const { first_name, last_name, age, class_id, section_id, roll_no } = req.body;
  const { id } = req.params;

  try {
    await db.query(
      'UPDATE students SET first_name=?, last_name=?, age=?, class_id=?, section_id=?, roll_no=? WHERE id=?',
      [first_name, last_name, age, class_id, section_id, roll_no || null, id]
    );
    return res.json({ message: 'Student updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE /api/students/:id ──────────────────────────────────
exports.deleteStudent = async (req, res) => {
  try {
    await db.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Student deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
