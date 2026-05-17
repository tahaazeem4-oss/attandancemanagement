const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/attendanceController');
const protect  = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const staffAccess = [protect, requireRole('teacher', 'admin', 'super_admin', 'org_admin', 'orgadmin')];

router.post('/mark',           ...staffAccess, ctrl.markAttendance);
router.get('/report',          ...staffAccess, ctrl.getReport);
router.post('/send-whatsapp',  ...staffAccess, ctrl.sendWhatsApp);

module.exports = router;
