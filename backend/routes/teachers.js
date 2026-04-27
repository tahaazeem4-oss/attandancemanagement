const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/teacherController');
const protect  = require('../middleware/auth');

router.post('/attendance',                            protect, ctrl.markAttendance);
router.get('/attendance/today',                       protect, ctrl.getTodayAttendance);
router.get('/classes',                                protect, ctrl.getAssignedClasses);
router.get('/leaves',                                 protect, ctrl.getClassLeaves);
router.put('/leaves/group/:group_id/status',          protect, ctrl.updateLeaveGroupStatus);
router.put('/leaves/group/:group_id/withdrawal',      protect, ctrl.handleWithdrawalRequest);
router.put('/leaves/:id',                             protect, ctrl.updateLeaveStatus);

module.exports = router;
