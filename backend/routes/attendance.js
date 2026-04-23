const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/attendanceController');
const protect  = require('../middleware/auth');

router.post('/mark',           protect, ctrl.markAttendance);
router.get('/report',          protect, ctrl.getReport);
router.post('/send-whatsapp',  protect, ctrl.sendWhatsApp);

module.exports = router;
