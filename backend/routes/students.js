const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/studentController');
const protect  = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const staffAccess = [protect, requireRole('teacher', 'admin', 'super_admin', 'org_admin', 'orgadmin')];

router.get('/',        ...staffAccess, ctrl.getStudents);
router.post('/',       ...staffAccess, ctrl.addStudent);
router.put('/:id',     ...staffAccess, ctrl.updateStudent);
router.delete('/:id',  ...staffAccess, ctrl.deleteStudent);

module.exports = router;
