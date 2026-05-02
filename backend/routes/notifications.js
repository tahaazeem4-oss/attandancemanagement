const express      = require('express');
const protect      = require('../middleware/auth');
const requireRole  = protect.requireRole;
const ctrl         = require('../controllers/notificationController');

const router = express.Router();

const canSend   = [protect, requireRole('teacher', 'admin')];
const staffOnly = [protect, requireRole('teacher', 'admin')];
const studentOnly = [protect, requireRole('student')];

// ── Sender endpoints (teacher + admin) ───────────────────────
router.post('/',            ...canSend, ctrl.send);
router.get('/sent',         ...canSend, ctrl.getSent);
router.delete('/:id',       ...canSend, ctrl.deleteNotification);
router.get('/students',     ...canSend, ctrl.getStudentsForPicker);

// ── Staff inbox (teacher + admin see their own notifications) ─
router.get('/inbox',              ...staffOnly, ctrl.getStaffInbox);
router.get('/inbox/unread-count', ...staffOnly, ctrl.getStaffUnreadCount);
router.post('/inbox/read-all',    ...staffOnly, ctrl.markStaffAllRead);
router.post('/inbox/:id/read',    ...staffOnly, ctrl.markStaffRead);

// ── Student endpoints ────────────────────────────────────────
router.get('/me',              ...studentOnly, ctrl.getMyNotifications);
router.get('/me/unread-count', ...studentOnly, ctrl.getUnreadCount);
router.post('/read-all',       ...studentOnly, ctrl.markAllRead);
router.post('/:id/read',       ...studentOnly, ctrl.markRead);

module.exports = router;
