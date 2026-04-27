const { randomUUID } = require('crypto');
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
// Returns leaves grouped by group_id so multi-date requests appear as one entry
exports.getLeaves = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, group_id, date, reason, status, withdrawal_status, applied_at
       FROM leave_applications WHERE student_id = ?
       ORDER BY applied_at DESC, date`,
      [req.user.student_id]
    );

    // Group by group_id
    const groupMap = {};
    const STATUS_PRIORITY = { pending: 4, approved: 3, rejected: 2, cancelled: 1 };
    for (const row of rows) {
      const gid = row.group_id;
      if (!groupMap[gid]) {
        groupMap[gid] = {
          group_id: gid,
          reason: row.reason,
          status: row.status,
          withdrawal_status: row.withdrawal_status || null,
          applied_at: row.applied_at,
          dates: [],
          ids: [],
        };
      }
      groupMap[gid].dates.push(row.date);
      groupMap[gid].ids.push(row.id);
      // Show the most "active" status for the group
      if ((STATUS_PRIORITY[row.status] || 0) > (STATUS_PRIORITY[groupMap[gid].status] || 0)) {
        groupMap[gid].status = row.status;
      }
      // Propagate withdrawal_status if any row has it
      if (row.withdrawal_status) groupMap[gid].withdrawal_status = row.withdrawal_status;
    }
    res.json(Object.values(groupMap));
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/student-portal/leaves ──────────────────────────
// Body: { dates: ['YYYY-MM-DD', ...], reason }  (also accepts single { date, reason } for compat)
exports.applyLeave = async (req, res) => {
  let { dates, date, reason } = req.body;
  if (!dates && date) dates = [date];               // backward compat
  if (!Array.isArray(dates) || dates.length === 0)
    return res.status(400).json({ message: 'dates array is required' });
  if (!reason || !reason.trim())
    return res.status(400).json({ message: 'reason is required' });

  const dateReg = /^\d{4}-\d{2}-\d{2}$/;
  for (const d of dates) {
    if (!dateReg.test(d)) return res.status(400).json({ message: `Invalid date: ${d}` });
  }

  const group_id  = randomUUID();
  const studentId = req.user.student_id;
  const inserted  = [];

  try {
    for (const d of dates) {
      const [ex] = await db.query(
        `SELECT id FROM leave_applications WHERE student_id=? AND date=? AND status != 'cancelled'`,
        [studentId, d]
      );
      if (ex.length > 0)
        return res.status(409).json({ message: `Leave already applied for ${d}` });

      const [r] = await db.query(
        `INSERT INTO leave_applications (student_id, date, reason, group_id)
         VALUES (?,?,?,?) RETURNING id`,
        [studentId, d, reason.trim(), group_id]
      );
      inserted.push({ id: r[0].id, date: d });
    }
    res.status(201).json({ message: 'Leave application submitted', group_id, inserted });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/student-portal/leaves/group/:group_id/withdraw ─
// Student requests withdrawal — teacher must approve/reject.
exports.requestWithdrawal = async (req, res) => {
  const { group_id } = req.params;
  const studentId    = req.user.student_id;
  try {
    const [rows] = await db.query(
      `SELECT id, status, withdrawal_status FROM leave_applications
       WHERE group_id=? AND student_id=? AND status IN ('pending','approved')`,
      [group_id, studentId]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: 'Leave not found or already cancelled' });
    if (rows.some(r => r.withdrawal_status === 'pending'))
      return res.status(400).json({ message: 'A withdrawal request is already pending for this leave' });

    await db.query(
      `UPDATE leave_applications SET withdrawal_status='pending'
       WHERE group_id=? AND student_id=? AND status IN ('pending','approved')`,
      [group_id, studentId]
    );
    res.json({ message: 'Withdrawal request submitted, awaiting teacher approval' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/student-portal/leaves/group/:group_id ────────
// Direct cancel (kept for backward compat / admin-side use)
exports.cancelLeaveGroup = async (req, res) => {
  const { group_id } = req.params;
  const studentId    = req.user.student_id;
  try {
    const [rows] = await db.query(
      `SELECT id, date, status FROM leave_applications
       WHERE group_id=? AND student_id=? AND status IN ('pending','approved')`,
      [group_id, studentId]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: 'Leave not found or already cancelled' });

    for (const row of rows) {
      await db.query('UPDATE leave_applications SET status=?, withdrawal_status=NULL WHERE id=?', ['cancelled', row.id]);
      await db.query(
        `DELETE FROM student_attendance WHERE student_id=? AND date=? AND status='leave'`,
        [studentId, row.date]
      );
    }
    res.json({ message: 'Leave cancelled', count: rows.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/student-portal/leaves/:id (legacy, single-date) ─
exports.cancelLeave = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, date, group_id FROM leave_applications
       WHERE id=? AND student_id=? AND status IN ('pending','approved')`,
      [req.params.id, req.user.student_id]
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Leave not found or cannot be cancelled' });
    await db.query('UPDATE leave_applications SET status=? WHERE id=?', ['cancelled', req.params.id]);
    await db.query(
      `DELETE FROM student_attendance WHERE student_id=? AND date=? AND status='leave'`,
      [req.user.student_id, rows[0].date]
    );
    res.json({ message: 'Leave cancelled' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};
