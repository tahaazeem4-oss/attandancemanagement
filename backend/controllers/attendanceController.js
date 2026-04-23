const db = require('../config/db');

// ── POST /api/attendance/mark ─────────────────────────────────
// Body: { date, records: [{ student_id, status }] }
exports.markAttendance = async (req, res) => {
  const { date, records } = req.body;
  const teacherId = req.teacher.id;

  if (!date || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'date and records[] are required' });
  }

  try {
    const values = records.map(r => [r.student_id, teacherId, date, r.status]);

    await db.query(
      `INSERT INTO student_attendance (student_id, teacher_id, date, status)
       VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status), teacher_id = VALUES(teacher_id)`,
      [values]
    );

    return res.json({ message: 'Attendance saved successfully', count: records.length });
  } catch (err) {
    console.error('Mark attendance error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/attendance/report?class_id=&section_id=&date= ────
exports.getReport = async (req, res) => {
  const { class_id, section_id, date } = req.query;
  const reportDate = date || new Date().toISOString().slice(0, 10);

  if (!class_id || !section_id) {
    return res.status(400).json({ message: 'class_id and section_id are required' });
  }

  try {
    const [rows] = await db.query(
      `SELECT s.id, s.first_name, s.last_name, s.roll_no,
              COALESCE(a.status, 'not_marked') AS status
       FROM   students s
       LEFT   JOIN student_attendance a
              ON  a.student_id = s.id AND a.date = ?
       WHERE  s.class_id = ? AND s.section_id = ?
       ORDER  BY s.last_name, s.first_name`,
      [reportDate, class_id, section_id]
    );

    return res.json({ date: reportDate, class_id, section_id, records: rows });
  } catch (err) {
    console.error('Get report error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// WhatsApp feature removed
exports.sendWhatsApp = (req, res) => res.status(503).json({ message: 'WhatsApp feature is not available' });
