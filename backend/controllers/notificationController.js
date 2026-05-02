const db   = require('../config/db');
const push = require('../services/pushService');

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

const VALID_TARGETS    = ['school', 'class', 'section', 'student'];
const VALID_CATEGORIES = ['general', 'holiday', 'complaint', 'announcement', 'homework', 'exam'];

// ─────────────────────────────────────────────────────────────
//  SENDER SIDE  (teacher + admin)
// ─────────────────────────────────────────────────────────────

// POST /api/notifications
exports.send = async (req, res) => {
  try {
    const { id: sender_id, role, school_id, first_name, last_name } = req.user;
    const { target_type, class_id, section_id, student_id, category, title, message } = req.body;

    if (!VALID_TARGETS.includes(target_type))
      return res.status(400).json({ message: `target_type must be one of: ${VALID_TARGETS.join(', ')}` });
    if (!title?.trim() || !message?.trim())
      return res.status(400).json({ message: 'title and message are required' });
    const cat = VALID_CATEGORIES.includes(category) ? category : 'general';

    // Validate targets belong to this school
    if (class_id) {
      const [c] = await db.query('SELECT id FROM classes WHERE id=$1 AND school_id=$2', [class_id, school_id]);
      if (!c.length) return res.status(400).json({ message: 'Invalid class for this school' });
    }
    if (section_id) {
      const [s] = await db.query('SELECT id FROM sections WHERE id=$1 AND class_id=$2', [section_id, class_id || 0]);
      if (!s.length) return res.status(400).json({ message: 'Invalid section for this class' });
    }
    if (student_id) {
      const [s] = await db.query('SELECT id FROM students WHERE id=$1 AND school_id=$2', [student_id, school_id]);
      if (!s.length) return res.status(400).json({ message: 'Invalid student for this school' });
    }

    const cid = class_id   || null;
    const sid = section_id || null;
    const stid = student_id || null;

    const [rows] = await db.query(
      `INSERT INTO notifications
         (school_id, sender_id, sender_name, sender_role, target_type, class_id, section_id, student_id, category, title, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [school_id, sender_id, `${first_name} ${last_name}`, role, target_type, cid, sid, stid, cat, title.trim(), message.trim()]
    );

    res.status(201).json(rows[0]);

    // Fire push notification to all relevant users (non-blocking)
    const notifTitle   = title.trim();
    const notifMessage = message.trim();
    const senderName   = `${first_name} ${last_name}`;
    const pushData     = { type: 'notification', sender: senderName };

    if (target_type === 'student' && student_id) {
      push.tokensForStudents([student_id]).then(tokens =>
        push.send(tokens, notifTitle, notifMessage, pushData)
      );
    } else if (target_type === 'section' && class_id && section_id) {
      // Students + teachers of that section
      Promise.all([
        push.tokensForClassStudents(school_id, class_id, section_id),
        push.tokensForClassTeachers(class_id, section_id),
      ]).then(([stuTokens, tchTokens]) =>
        push.send([...new Set([...stuTokens, ...tchTokens])], notifTitle, notifMessage, pushData)
      );
    } else if (target_type === 'class' && class_id) {
      // Students of that class + school admins
      Promise.all([
        push.tokensForClassStudents(school_id, class_id, null),
        push.tokensForSchoolAdmins(school_id),
      ]).then(([stuTokens, admTokens]) =>
        push.send([...new Set([...stuTokens, ...admTokens])], notifTitle, notifMessage, pushData)
      );
    } else if (target_type === 'school') {
      // Everyone: students + all teachers + all admins
      Promise.all([
        push.tokensForSchoolStudents(school_id),
        push.tokensForSchoolAdmins(school_id),
        // All teachers for this school
        db.query(
          `SELECT pt.token FROM push_tokens pt
           JOIN teachers t ON t.id = pt.user_id
           WHERE pt.user_role='teacher' AND t.school_id=$1`,
          [school_id]
        ).then(([rows]) => rows.map(r => r.token).filter(t => t)),
      ]).then(([stuTokens, admTokens, tchTokens]) =>
        push.send([...new Set([...stuTokens, ...admTokens, ...tchTokens])], notifTitle, notifMessage, pushData)
      );
    }
  } catch (err) {
    console.error('[notifications.send]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/notifications/sent  — list notifications this sender created
exports.getSent = async (req, res) => {
  try {
    const { id: sender_id, role, school_id } = req.user;
    let q, params;

    if (role === 'admin') {
      // Admin sees all notifications for their school
      q = `SELECT n.*, c.class_name, sec.section_name,
                  s.first_name AS st_first, s.last_name AS st_last
           FROM notifications n
           LEFT JOIN classes  c   ON c.id   = n.class_id
           LEFT JOIN sections sec ON sec.id = n.section_id
           LEFT JOIN students s   ON s.id   = n.student_id
           WHERE n.school_id = $1
           ORDER BY n.created_at DESC`;
      params = [school_id];
    } else {
      // Teacher sees their own
      q = `SELECT n.*, c.class_name, sec.section_name,
                  s.first_name AS st_first, s.last_name AS st_last
           FROM notifications n
           LEFT JOIN classes  c   ON c.id   = n.class_id
           LEFT JOIN sections sec ON sec.id = n.section_id
           LEFT JOIN students s   ON s.id   = n.student_id
           WHERE n.school_id = $1 AND n.sender_id = $2
           ORDER BY n.created_at DESC`;
      params = [school_id, sender_id];
    }

    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error('[notifications.getSent]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/notifications/:id
exports.deleteNotification = async (req, res) => {
  try {
    const { id: sender_id, role, school_id } = req.user;
    const [rows] = await db.query('SELECT * FROM notifications WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const notif = rows[0];
    if (role === 'teacher' && notif.sender_id !== sender_id)
      return res.status(403).json({ message: 'You can only delete your own notifications' });
    if (role === 'admin' && notif.school_id !== school_id)
      return res.status(403).json({ message: 'Access denied' });
    await db.query('DELETE FROM notifications WHERE id=$1', [notif.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[notifications.delete]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/notifications/students?class_id=&section_id=
// Returns student list for the "target: student" picker in the send form
exports.getStudentsForPicker = async (req, res) => {
  try {
    const { school_id } = req.user;
    const { class_id, section_id } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id is required' });

    let q, params;
    if (section_id) {
      q = `SELECT s.id, s.first_name, s.last_name, s.roll_no
           FROM students s
           WHERE s.school_id=$1 AND s.class_id=$2 AND s.section_id=$3
           ORDER BY s.roll_no, s.last_name`;
      params = [school_id, class_id, section_id];
    } else {
      q = `SELECT s.id, s.first_name, s.last_name, s.roll_no
           FROM students s
           WHERE s.school_id=$1 AND s.class_id=$2
           ORDER BY s.roll_no, s.last_name`;
      params = [school_id, class_id];
    }
    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error('[notifications.getStudentsForPicker]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────
//  STUDENT SIDE
// ─────────────────────────────────────────────────────────────

// GET /api/notifications/me  — student's inbox
exports.getMyNotifications = async (req, res) => {
  try {
    const { student_id, school_id } = req.user;

    // Look up student's class_id and section_id (not in JWT)
    const [stu] = await db.query(
      'SELECT class_id, section_id FROM students WHERE id=$1',
      [student_id]
    );
    if (!stu.length) return res.status(404).json({ message: 'Student not found' });
    const { class_id, section_id } = stu[0];

    const [rows] = await db.query(
      `SELECT n.*,
              c.class_name, sec.section_name,
              (nr.read_at IS NOT NULL) AS is_read,
              nr.read_at
       FROM notifications n
       LEFT JOIN classes   c   ON c.id   = n.class_id
       LEFT JOIN sections  sec ON sec.id = n.section_id
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.student_id = $1
       WHERE n.school_id = $2
         AND (
           n.target_type = 'school'
           OR (n.target_type = 'class'   AND n.class_id   = $3)
           OR (n.target_type = 'section' AND n.section_id = $4)
           OR (n.target_type = 'student' AND n.student_id = $5)
         )
       ORDER BY n.created_at DESC`,
      [student_id, school_id, class_id, section_id, student_id]
    );

    res.json(rows);
  } catch (err) {
    console.error('[notifications.getMyNotifications]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/notifications/me/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    const { student_id, school_id } = req.user;

    const [stu] = await db.query(
      'SELECT class_id, section_id FROM students WHERE id=$1',
      [student_id]
    );
    if (!stu.length) return res.json({ count: 0 });
    const { class_id, section_id } = stu[0];

    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM notifications n
       WHERE n.school_id = $1
         AND (
           n.target_type = 'school'
           OR (n.target_type = 'class'   AND n.class_id   = $2)
           OR (n.target_type = 'section' AND n.section_id = $3)
           OR (n.target_type = 'student' AND n.student_id = $4)
         )
         AND NOT EXISTS (
           SELECT 1 FROM notification_reads nr
           WHERE nr.notification_id = n.id AND nr.student_id = $4
         )`,
      [school_id, class_id, section_id, student_id]
    );

    res.json({ count: Number(count) });
  } catch (err) {
    console.error('[notifications.getUnreadCount]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const { student_id } = req.user;
    const notif_id = Number(req.params.id);

    // Upsert: ignore conflict
    await db.query(
      `INSERT INTO notification_reads (notification_id, student_id)
       VALUES ($1, $2)
       ON CONFLICT (notification_id, student_id) DO NOTHING`,
      [notif_id, student_id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('[notifications.markRead]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────
//  STAFF INBOX  (admin + teacher)
// ─────────────────────────────────────────────────────────────

// GET /api/notifications/inbox  — staff notification inbox
// Admin and teacher only see school-wide (target_type='school') notifications.
// Class/section/student notifications are for students only.
exports.getStaffInbox = async (req, res) => {
  try {
    const { id: user_id, role, school_id } = req.user;

    const q = `SELECT n.*,
                  (snr.user_id IS NOT NULL) AS is_read,
                  snr.read_at
           FROM notifications n
           LEFT JOIN staff_notification_reads snr
                  ON snr.notification_id = n.id AND snr.user_id = $1 AND snr.user_role = $2
           WHERE n.school_id = $3
             AND n.target_type = 'school'
           ORDER BY n.created_at DESC`;

    const [rows] = await db.query(q, [user_id, role, school_id]);
    res.json(rows);
  } catch (err) {
    console.error('[notifications.getStaffInbox]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/notifications/inbox/unread-count
exports.getStaffUnreadCount = async (req, res) => {
  try {
    const { id: user_id, role, school_id } = req.user;

    const q = `SELECT COUNT(*) AS count FROM notifications n
         WHERE n.school_id = $1
           AND n.target_type = 'school'
           AND NOT EXISTS (
             SELECT 1 FROM staff_notification_reads snr
             WHERE snr.notification_id = n.id AND snr.user_id = $2 AND snr.user_role = $3
           )`;

    const [[{ count }]] = await db.query(q, [school_id, user_id, role]);
    res.json({ count: Number(count) });
  } catch (err) {
    console.error('[notifications.getStaffUnreadCount]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/notifications/inbox/:id/read
exports.markStaffRead = async (req, res) => {
  try {
    const { id: user_id, role } = req.user;
    await db.query(
      `INSERT INTO staff_notification_reads (notification_id, user_id, user_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (notification_id, user_id, user_role) DO NOTHING`,
      [Number(req.params.id), user_id, role]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('[notifications.markStaffRead]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/notifications/inbox/read-all
exports.markStaffAllRead = async (req, res) => {
  try {
    const { id: user_id, role, school_id } = req.user;

    const [unread] = await db.query(
      `SELECT id FROM notifications
       WHERE school_id = $1
         AND target_type = 'school'
         AND NOT EXISTS (
           SELECT 1 FROM staff_notification_reads snr
           WHERE snr.notification_id = notifications.id AND snr.user_id = $2 AND snr.user_role = $3
         )`,
      [school_id, user_id, role]
    );
    if (unread.length > 0) {
      const vals = unread.map((r, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const pms  = unread.flatMap(r => [r.id, user_id, role]);
      await db.query(
        `INSERT INTO staff_notification_reads (notification_id, user_id, user_role) VALUES ${vals}
         ON CONFLICT DO NOTHING`,
        pms
      );
    }
    res.json({ message: 'All marked as read', count: unread.length });
  } catch (err) {
    console.error('[notifications.markStaffAllRead]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/notifications/read-all  — mark all visible notifications as read
exports.markAllRead = async (req, res) => {
  try {
    const { student_id, school_id } = req.user;

    const [stu] = await db.query(
      'SELECT class_id, section_id FROM students WHERE id=$1',
      [student_id]
    );
    if (!stu.length) return res.json({ message: 'Done' });
    const { class_id, section_id } = stu[0];

    // Get all relevant notification IDs not yet read
    const [unread] = await db.query(
      `SELECT n.id FROM notifications n
       WHERE n.school_id = $1
         AND (
           n.target_type = 'school'
           OR (n.target_type = 'class'   AND n.class_id   = $2)
           OR (n.target_type = 'section' AND n.section_id = $3)
           OR (n.target_type = 'student' AND n.student_id = $4)
         )
         AND NOT EXISTS (
           SELECT 1 FROM notification_reads nr
           WHERE nr.notification_id = n.id AND nr.student_id = $4
         )`,
      [school_id, class_id, section_id, student_id]
    );

    if (unread.length > 0) {
      const values = unread.map((r, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = unread.flatMap(r => [r.id, student_id]);
      await db.query(
        `INSERT INTO notification_reads (notification_id, student_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        params
      );
    }

    res.json({ message: 'All marked as read', count: unread.length });
  } catch (err) {
    console.error('[notifications.markAllRead]', err);
    res.status(500).json({ message: 'Server error' });
  }
};
