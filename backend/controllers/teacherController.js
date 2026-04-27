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
       ON CONFLICT (teacher_id, date) DO UPDATE SET status = EXCLUDED.status`,
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
      `SELECT la.id, la.group_id, la.student_id, la.date, la.reason,
              la.status, la.withdrawal_status, la.applied_at,
              s.first_name, s.last_name, s.roll_no,
              c.class_name, sec.section_name
       FROM   leave_applications la
       JOIN   students  s   ON s.id   = la.student_id
       JOIN   classes   c   ON c.id   = s.class_id
       JOIN   sections  sec ON sec.id = s.section_id
       WHERE  (${conditions})
         AND  la.status != 'cancelled'
       ORDER  BY la.applied_at DESC, la.date`,
      params
    );

    // Group by group_id
    const groupMap = {};
    const STATUS_PRIORITY = { pending: 4, approved: 3, rejected: 2, cancelled: 1 };
    for (const row of rows) {
      const gid = row.group_id || String(row.id);
      if (!groupMap[gid]) {
        groupMap[gid] = {
          group_id:         gid,
          student_id:       row.student_id,
          first_name:       row.first_name,
          last_name:        row.last_name,
          roll_no:          row.roll_no,
          class_name:       row.class_name,
          section_name:     row.section_name,
          reason:           row.reason,
          status:           row.status,
          withdrawal_status: row.withdrawal_status || null,
          applied_at:       row.applied_at,
          dates: [],
          ids:   [],
        };
      }
      groupMap[gid].dates.push(row.date);
      groupMap[gid].ids.push(row.id);
      if ((STATUS_PRIORITY[row.status] || 0) > (STATUS_PRIORITY[groupMap[gid].status] || 0))
        groupMap[gid].status = row.status;
      if (row.withdrawal_status) groupMap[gid].withdrawal_status = row.withdrawal_status;
    }
    return res.json(Object.values(groupMap));
  } catch (err) {
    console.error('Get class leaves error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── PUT /api/teachers/leaves/group/:group_id/status ──────────
// Teacher approves or rejects a whole leave group (new leaves).
// On approve: auto-marks student_attendance rows as 'leave'.
exports.updateLeaveGroupStatus = async (req, res) => {
  const { group_id } = req.params;
  const { status }   = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'status must be approved or rejected' });
  try {
    const [rows] = await db.query(
      `SELECT id, student_id, date FROM leave_applications
       WHERE group_id=? AND status='pending'`,
      [group_id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: 'Leave group not found or not pending' });

    for (const row of rows) {
      await db.query(
        'UPDATE leave_applications SET status=?, withdrawal_status=NULL WHERE id=?',
        [status, row.id]
      );
      if (status === 'approved') {
        await db.query(
          `INSERT INTO student_attendance (student_id, date, status, teacher_id)
           VALUES (?,?,?,NULL)
           ON CONFLICT (student_id, date) DO UPDATE SET status='leave', teacher_id=NULL`,
          [row.student_id, row.date, 'leave']
        );
      }
    }
    res.json({ message: `Leave group ${status}`, count: rows.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/teachers/leaves/group/:group_id/withdrawal ───────
// Teacher approves or rejects a student's withdrawal request.
exports.handleWithdrawalRequest = async (req, res) => {
  const { group_id } = req.params;
  const { action }   = req.body; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ message: 'action must be approve or reject' });
  try {
    const [rows] = await db.query(
      `SELECT id, student_id, date, status FROM leave_applications
       WHERE group_id=? AND withdrawal_status='pending'`,
      [group_id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: 'No pending withdrawal request for this group' });

    if (action === 'approve') {
      for (const row of rows) {
        await db.query(
          `UPDATE leave_applications SET status='cancelled', withdrawal_status=NULL WHERE id=?`,
          [row.id]
        );
        if (row.status === 'approved') {
          await db.query(
            `DELETE FROM student_attendance WHERE student_id=? AND date=? AND status='leave'`,
            [row.student_id, row.date]
          );
        }
      }
      res.json({ message: 'Withdrawal approved — leave cancelled', count: rows.length });
    } else {
      await db.query(
        `UPDATE leave_applications SET withdrawal_status='rejected'
         WHERE group_id=? AND withdrawal_status='pending'`,
        [group_id]
      );
      res.json({ message: 'Withdrawal request rejected' });
    }
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/teachers/leaves/:id (legacy single-row) ─────────
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
