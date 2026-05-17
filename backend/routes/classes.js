const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/classController');
const protect  = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const staffAccess = [protect, requireRole('teacher', 'admin', 'super_admin', 'org_admin', 'orgadmin')];

router.get('/',                        ...staffAccess, ctrl.getAllClasses);
router.get('/:classId/sections',       ...staffAccess, ctrl.getSections);

module.exports = router;
