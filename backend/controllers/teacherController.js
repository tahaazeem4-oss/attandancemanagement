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
       WHERE  tc.teacher_id = ? AND c.school_id = ?`,
      [teacherId, req.teacher.school_id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get assigned classes error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/teachers/leaves ──────────────────────────────────
// Returns leave applications for students in teacher's assigned classes
exports.getClassLeaves = async (req, res) => {
  const teacherId = req.teacher.id;
  try {
    const [assignments] = await db.query(
      'SELECT class_id, section_id FROM teacher_classes WHERE teacher_id = ?',
      [teacherId]
    );
    if (assignments.length === 0) return res.json([]);
    const conditions = assignments.map(() => '(s.class_id = ? AND s.section_id = ?)').join(' OR ');
    const params = assignments.flatMap(a => [a.class_id, a.section_id]);
    const [rows] = await db.query(
      `SELECT la.id, la.student_id, la.date, la.reason, la.status, la.applied_at,
              s.first_name, s.last_name, s.roll_no, c.class_name, sec.section_name
       FROM   leave_applications la
       JOIN   students  s   ON s.id   = la.student_id
       JOIN   classes   c   ON c.id   = s.class_id
       JOIN   sections  sec ON sec.id = s.section_id
       WHERE  (${conditions})
       ORDER  BY la.applied_at DESC`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get class leaves error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── PUT /api/teachers/leaves/:id ─────────────────────────────
exports.updateLeaveStatus = async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'status must be approved or rejected' });
  try {
    await db.query('UPDATE leave_applications SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Leave status updated' });
  } catch (err) {
    console.error('Update leave status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
