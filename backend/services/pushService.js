const { Expo } = require('expo-server-sdk');
const db       = require('../config/db');

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

// ─────────────────────────────────────────────────────────────
//  Token lookup helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get valid Expo push tokens for an array of students.id values.
 */
async function tokensForStudents(studentIds) {
  if (!studentIds || !studentIds.length) return [];
  try {
    const [rows] = await db.query(
      `SELECT token FROM push_tokens WHERE user_role='student' AND user_id = ANY($1)`,
      [studentIds]
    );
    return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
  } catch { return []; }
}

/**
 * Get valid Expo push tokens for teachers/admins by their table id.
 */
async function tokensForUsers(role, userIds) {
  if (!userIds || !userIds.length) return [];
  try {
    const [rows] = await db.query(
      `SELECT token FROM push_tokens WHERE user_role=$1 AND user_id = ANY($2)`,
      [role, userIds]
    );
    return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
  } catch { return []; }
}

/**
 * Get valid push tokens for ALL admins of a given school_id.
 */
async function tokensForSchoolAdmins(school_id) {
  try {
    const [rows] = await db.query(
      `SELECT pt.token FROM push_tokens pt
       JOIN admins a ON a.id = pt.user_id
       WHERE pt.user_role='admin' AND a.school_id = $1`,
      [school_id]
    );
    return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
  } catch { return []; }
}

/**
 * Get push tokens for all class teachers of a given class_id + section_id.
 */
async function tokensForClassTeachers(class_id, section_id) {
  try {
    const [rows] = await db.query(
      `SELECT pt.token FROM push_tokens pt
       JOIN teacher_classes tc ON tc.teacher_id = pt.user_id
       WHERE pt.user_role='teacher' AND tc.class_id = $1 AND tc.section_id = $2`,
      [class_id, section_id]
    );
    return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
  } catch { return []; }
}

/**
 * Get push tokens for all students in a class (optionally filtered by section).
 */
async function tokensForClassStudents(school_id, class_id, section_id) {
  try {
    let q = `SELECT pt.token FROM push_tokens pt
             JOIN students s ON s.id = pt.user_id
             WHERE pt.user_role='student' AND s.school_id = $1 AND s.class_id = $2`;
    const params = [school_id, class_id];
    if (section_id) { q += ` AND s.section_id = $3`; params.push(section_id); }
    const [rows] = await db.query(q, params);
    return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
  } catch { return []; }
}

/**
 * Get push tokens for all students in an entire school.
 */
async function tokensForSchoolStudents(school_id) {
  try {
    const [rows] = await db.query(
      `SELECT pt.token FROM push_tokens pt
       JOIN students s ON s.id = pt.user_id
       WHERE pt.user_role='student' AND s.school_id = $1`,
      [school_id]
    );
    return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────
//  Core send helper
// ─────────────────────────────────────────────────────────────

/**
 * Send push notifications to a list of Expo tokens.
 * Silently swallows errors so notification failures never break the API response.
 */
async function send(tokens, title, body, data = {}) {
  if (!tokens || !tokens.length) return;

  const messages = tokens.map(to => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      // Fire and forget — don't await to avoid holding up the API response
      expo.sendPushNotificationsAsync(chunk).catch(e =>
        console.warn('[pushService] chunk send error:', e.message)
      );
    }
  } catch (err) {
    console.warn('[pushService] send error:', err.message);
  }
}

module.exports = {
  send,
  tokensForStudents,
  tokensForUsers,
  tokensForSchoolAdmins,
  tokensForClassTeachers,
  tokensForClassStudents,
  tokensForSchoolStudents,
};
