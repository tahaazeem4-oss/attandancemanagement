const db              = require('../config/db');
const whatsappService = require('../services/whatsappService');

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

// ── POST /api/attendance/send-whatsapp ────────────────────────
// Sends today's attendance report to the WhatsApp group for a class/section
exports.sendWhatsApp = async (req, res) => {
  const { class_id, section_id, date } = req.body;
  const reportDate = date || new Date().toISOString().slice(0, 10);

  if (!class_id || !section_id) {
    return res.status(400).json({ message: 'class_id and section_id are required' });
  }

  try {
    // Fetch WhatsApp group JID for this class/section
    const [groups] = await db.query(
      'SELECT * FROM whatsapp_groups WHERE class_id = ? AND section_id = ?',
      [class_id, section_id]
    );

    if (groups.length === 0) {
      return res.status(404).json({ message: 'No WhatsApp group configured for this class/section' });
    }

    const groupJid = groups[0].group_jid;

    // Fetch attendance records
    const [records] = await db.query(
      `SELECT s.first_name, s.last_name, s.roll_no,
              COALESCE(a.status, 'not_marked') AS status
       FROM   students s
       LEFT   JOIN student_attendance a
              ON  a.student_id = s.id AND a.date = ?
       JOIN   classes  c   ON c.id   = s.class_id
       JOIN   sections sec ON sec.id  = s.section_id
       WHERE  s.class_id = ? AND s.section_id = ?
       ORDER  BY s.last_name, s.first_name`,
      [reportDate, class_id, section_id]
    );

    const [classInfo] = await db.query(
      `SELECT c.class_name, s.section_name
       FROM classes c JOIN sections s ON s.class_id = c.id
       WHERE c.id = ? AND s.id = ?`,
      [class_id, section_id]
    );

    const info = classInfo[0] || {};
    const present = records.filter(r => r.status === 'present').length;
    const absent  = records.filter(r => r.status === 'absent').length;
    const leave   = records.filter(r => r.status === 'leave').length;

    // Build message
    let message = `📋 *Attendance Report*\n`;
    message    += `📅 Date: ${reportDate}\n`;
    message    += `🏫 Class: ${info.class_name || class_id} — Section ${info.section_name || section_id}\n`;
    message    += `👨‍🏫 Teacher: ${req.teacher.first_name} ${req.teacher.last_name}\n\n`;
    message    += `✅ Present: ${present}  ❌ Absent: ${absent}  🟡 Leave: ${leave}\n\n`;
    message    += `*Student Details:*\n`;

    records.forEach((r, i) => {
      const icon = r.status === 'present' ? '✅' : r.status === 'absent' ? '❌' : '🟡';
      message   += `${i + 1}. ${r.first_name} ${r.last_name}${r.roll_no ? ' (#' + r.roll_no + ')' : ''} — ${icon} ${r.status.toUpperCase()}\n`;
    });

    await whatsappService.sendMessage(groupJid, message);

    return res.json({ message: 'Report sent to WhatsApp successfully' });
  } catch (err) {
    console.error('Send WhatsApp error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};
