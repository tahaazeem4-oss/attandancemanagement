const express         = require('express');
const router          = express.Router();
const ctrl            = require('../controllers/superAdminController');
const protect         = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const superAdminOnly = [protect, requireRole('super_admin')];

// Platform stats
router.get('/stats', ...superAdminOnly, ctrl.getPlatformStats);

// Schools CRUD
router.get('/schools',      ...superAdminOnly, ctrl.listSchools);
router.post('/schools',     ...superAdminOnly, ctrl.addSchool);
router.put('/schools/:id',  ...superAdminOnly, ctrl.updateSchool);
router.delete('/schools/:id', ...superAdminOnly, ctrl.deleteSchool);

// School stats
router.get('/schools/:id/stats', ...superAdminOnly, ctrl.getSchoolStats);

// School admins
router.get('/schools/:id/admins',                                    ...superAdminOnly, ctrl.listSchoolAdmins);
router.post('/schools/:id/admins',                                   ...superAdminOnly, ctrl.addSchoolAdmin);
router.put('/schools/:schoolId/admins/:adminId',                     ...superAdminOnly, ctrl.updateSchoolAdmin);
router.delete('/schools/:schoolId/admins/:adminId',                  ...superAdminOnly, ctrl.removeSchoolAdmin);
router.post('/schools/:schoolId/admins/:adminId/reset-password',     ...superAdminOnly, ctrl.resetAdminPassword);

module.exports = router;
