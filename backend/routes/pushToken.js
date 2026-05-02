const express    = require('express');
const protect    = require('../middleware/auth');
const requireRole = protect.requireRole;
const db         = require('../config/db');
const { Expo }   = require('expo-server-sdk');

const router = express.Router();

// ── POST /api/push-token ──────────────────────────────────────
// Saves (or updates) the Expo push token for the authenticated user.
// Any role can call this after login.
// Body: { token: "ExponentPushToken[...]" }
router.post('/', protect, async (req, res) => {
  const { token } = req.body;

  if (!token || !Expo.isExpoPushToken(token)) {
    return res.status(400).json({ message: 'Invalid or missing Expo push token' });
  }

  const { role, id, student_id } = req.user;

  // For students the meaningful identifier is students.id (student_id),
  // because controllers look up push tokens by students.id when sending.
  const userId = role === 'student' ? student_id : id;

  if (!userId) {
    return res.status(400).json({ message: 'Cannot resolve user id' });
  }

  try {
    await db.query(
      `INSERT INTO push_tokens (user_role, user_id, token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_role, user_id) DO UPDATE SET token = EXCLUDED.token, updated_at = NOW()`,
      [role, userId, token]
    );
    res.json({ message: 'Push token saved' });
  } catch (err) {
    console.error('[pushToken] save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/push-token ─────────────────────────────────────
// Remove push token on logout (optional — call from frontend on logout).
router.delete('/', protect, async (req, res) => {
  const { role, id, student_id } = req.user;
  const userId = role === 'student' ? student_id : id;
  try {
    await db.query(
      `DELETE FROM push_tokens WHERE user_role=$1 AND user_id=$2`,
      [role, userId]
    );
    res.json({ message: 'Push token removed' });
  } catch (err) {
    console.error('[pushToken] delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
