const db = require('../config/db');

// ── GET /api/student-portal/profile ──────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, c.class_name, sec.section_name
       FROM   students  s
       JOIN   classes   c   ON c.id   = s.class_id
       JOIN   sections  sec ON sec.id = s.section_id
       WHERE  s.id = ?`,
      [req.user.student_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── GET /api/student-portal/attendance?month=&year= ───────────
exports.getAttendance = async (req, res) => {
  const { month, year } = req.query;
  let q = `SELECT date, status, marked_at FROM student_attendance WHERE student_id = ?`;
  const params = [req.user.student_id];
  if (month && year) { q += ' AND EXTRACT(MONTH FROM date) = ? AND EXTRACT(YEAR FROM date) = ?'; params.push(month, year); }
  q += ' ORDER BY date DESC';
  try {
    const [rows] = await db.query(q, params);
    const present = rows.filter(r => r.status === 'present').length;
    const absent  = rows.filter(r => r.status === 'absent').length;
    const leave   = rows.filter(r => r.status === 'leave').length;
    res.json({ records: rows, stats: { total: rows.length, present, absent, leave } });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── GET /api/student-portal/leaves ───────────────────────────
exports.getLeaves = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM leave_applications WHERE student_id = ? ORDER BY applied_at DESC',
      [req.user.student_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/student-portal/leaves ──────────────────────────
exports.applyLeave = async (req, res) => {
  const { date, reason } = req.body;
  if (!date || !reason)
    return res.status(400).json({ message: 'date and reason are required' });
  try {
    const [ex] = await db.query(
      'SELECT id FROM leave_applications WHERE student_id = ? AND date = ?',
      [req.user.student_id, date]
    );
    if (ex.length > 0)
      return res.status(409).json({ message: 'Leave already applied for this date' });
    const [r] = await db.query(
      'INSERT INTO leave_applications (student_id, date, reason) VALUES (?,?,?) RETURNING id',
      [req.user.student_id, date, reason]
    );
    res.status(201).json({ message: 'Leave application submitted', id: r[0].id });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/student-portal/leaves/:id ────────────────────
exports.cancelLeave = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id FROM leave_applications WHERE id=? AND student_id=? AND status='pending'`,
      [req.params.id, req.user.student_id]
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Leave not found or cannot be cancelled' });
    await db.query('DELETE FROM leave_applications WHERE id=?', [req.params.id]);
    res.json({ message: 'Leave cancelled' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};
