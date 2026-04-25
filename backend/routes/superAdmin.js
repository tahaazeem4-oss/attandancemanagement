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

// School teachers
router.get('/schools/:schoolId/teachers',                                    ...superAdminOnly, ctrl.listSchoolTeachers);
router.post('/schools/:schoolId/teachers',                                   ...superAdminOnly, ctrl.addSchoolTeacher);
router.put('/schools/:schoolId/teachers/:teacherId',                         ...superAdminOnly, ctrl.updateSchoolTeacher);
router.delete('/schools/:schoolId/teachers/:teacherId',                      ...superAdminOnly, ctrl.removeSchoolTeacher);
router.post('/schools/:schoolId/teachers/:teacherId/reset-password',         ...superAdminOnly, ctrl.resetTeacherPassword);

// School classes (for dropdowns)
router.get('/schools/:schoolId/classes',                                     ...superAdminOnly, ctrl.listSchoolClasses);

// School students
router.get('/schools/:schoolId/students',                                    ...superAdminOnly, ctrl.listSchoolStudents);
router.post('/schools/:schoolId/students',                                   ...superAdminOnly, ctrl.addSchoolStudent);
router.put('/schools/:schoolId/students/:studentId',                         ...superAdminOnly, ctrl.updateSchoolStudent);
router.delete('/schools/:schoolId/students/:studentId',                      ...superAdminOnly, ctrl.removeSchoolStudent);
router.post('/schools/:schoolId/students/:studentId/reset-password',         ...superAdminOnly, ctrl.resetStudentPassword);

module.exports = router;
