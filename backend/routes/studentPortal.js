const express         = require('express');
const router          = express.Router();
const ctrl            = require('../controllers/studentPortalController');
const protect         = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const studentOnly = [protect, requireRole('student')];

router.get('/profile',       ...studentOnly, ctrl.getProfile);
router.get('/attendance',    ...studentOnly, ctrl.getAttendance);
router.get('/leaves',                             ...studentOnly, ctrl.getLeaves);
router.post('/leaves',                            ...studentOnly, ctrl.applyLeave);
router.put('/leaves/group/:group_id/withdraw',    ...studentOnly, ctrl.requestWithdrawal);
router.delete('/leaves/group/:group_id',          ...studentOnly, ctrl.cancelLeaveGroup);
router.delete('/leaves/:id',                      ...studentOnly, ctrl.cancelLeave);

module.exports = router;
