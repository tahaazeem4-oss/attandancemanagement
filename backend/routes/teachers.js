const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/teacherController');
const protect  = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const teacherAccess = [protect, requireRole('teacher', 'admin')];

router.post('/attendance',                            ...teacherAccess, ctrl.markAttendance);
router.get('/attendance/today',                       ...teacherAccess, ctrl.getTodayAttendance);
router.get('/classes',                                ...teacherAccess, ctrl.getAssignedClasses);
router.get('/leaves',                                 ...teacherAccess, ctrl.getClassLeaves);
router.put('/leaves/group/:group_id/status',          ...teacherAccess, ctrl.updateLeaveGroupStatus);
router.put('/leaves/group/:group_id/withdrawal',      ...teacherAccess, ctrl.handleWithdrawalRequest);
router.put('/leaves/:id',                             ...teacherAccess, ctrl.updateLeaveStatus);

module.exports = router;
