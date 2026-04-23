const express              = require('express');
const router               = express.Router();
const ctrl                 = require('../controllers/adminController');
const protect              = require('../middleware/auth');
const { requireRole }      = require('../middleware/auth');

const adminOnly = [protect, requireRole('admin')];

// Stats
router.get('/stats',                        ...adminOnly, ctrl.getStats);

// Teachers
router.get('/teachers',                     ...adminOnly, ctrl.listTeachers);
router.post('/teachers',                    ...adminOnly, ctrl.addTeacher);
router.put('/teachers/:id',                 ...adminOnly, ctrl.updateTeacher);
router.delete('/teachers/:id',              ...adminOnly, ctrl.deleteTeacher);
router.post('/teachers/:id/reset-password', ...adminOnly, ctrl.resetTeacherPassword);

// Students
router.get('/students',                     ...adminOnly, ctrl.listStudents);
router.post('/students',                    ...adminOnly, ctrl.addStudent);
router.put('/students/:id',                 ...adminOnly, ctrl.updateStudent);
router.delete('/students/:id',              ...adminOnly, ctrl.deleteStudent);
router.post('/students/:id/reset-password', ...adminOnly, ctrl.resetStudentPassword);

// Classes & Sections
router.get('/classes',                      ...adminOnly, ctrl.listClasses);
router.post('/classes',                     ...adminOnly, ctrl.addClass);
router.put('/classes/:id',                  ...adminOnly, ctrl.updateClass);
router.delete('/classes/:id',               ...adminOnly, ctrl.deleteClass);
router.post('/classes/:classId/sections',   ...adminOnly, ctrl.addSection);
router.delete('/sections/:id',              ...adminOnly, ctrl.deleteSection);

// Teacher-Class Assignments
router.get('/assignments',                  ...adminOnly, ctrl.listAssignments);
router.post('/assignments',                 ...adminOnly, ctrl.addAssignment);
router.delete('/assignments/:id',           ...adminOnly, ctrl.deleteAssignment);

// Leave Applications
router.get('/leaves',                       ...adminOnly, ctrl.listLeaves);
router.put('/leaves/:id/status',            ...adminOnly, ctrl.updateLeaveStatus);

module.exports = router;
