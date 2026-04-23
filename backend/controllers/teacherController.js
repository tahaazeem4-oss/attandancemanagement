const db = require('../config/db');

// ── POST /api/teachers/attendance ─────────────────────────────
// Teacher marks their own daily attendance
exports.markAttendance = async (req, res) => {
  const { status } = req.body;   // 'present' | 'absent' | 'leave'
  const teacherId  = req.teacher.id;
  const today      = new Date().toISOString().slice(0, 10);

  if (!['present', 'absent', 'leave'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    await db.query(
      `INSERT INTO teacher_attendance (teacher_id, date, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [teacherId, today, status]
    );
    return res.json({ message: 'Attendance marked', date: today, status });
  } catch (err) {
    console.error('Teacher attendance error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/teachers/attendance/today ────────────────────────
exports.getTodayAttendance = async (req, res) => {
  const teacherId = req.teacher.id;
  const today     = new Date().toISOString().slice(0, 10);

  try {
    const [rows] = await db.query(
      'SELECT * FROM teacher_attendance WHERE teacher_id = ? AND date = ?',
      [teacherId, today]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    console.error('Get attendance error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/teachers/classes ─────────────────────────────────
// Returns the class/sections assigned to the logged-in teacher
exports.getAssignedClasses = async (req, res) => {
  const teacherId = req.teacher.id;

  try {
    const [rows] = await db.query(
      `SELECT tc.id, c.id AS class_id, c.class_name,
              s.id AS section_id, s.section_name
       FROM   teacher_classes tc
       JOIN   classes  c ON c.id = tc.class_id
       JOIN   sections s ON s.id = tc.section_id
       WHERE  tc.teacher_id = ?`,
      [teacherId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get assigned classes error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
