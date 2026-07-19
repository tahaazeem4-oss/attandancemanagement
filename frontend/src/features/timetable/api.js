// frontend/src/features/timetable/api.js
// Thin wrapper around every /timetable/* call, so screens stay declarative.
import api from '../../services/api';

// ── Admin editor ──────────────────────────────────────────────────────
export function getClassTimetable({ classId, sectionId, schoolId }) {
  return api.get('/timetable/class', { params: { class_id: classId, section_id: sectionId, school_id: schoolId } });
}

export function saveDayPeriods({ schoolId, classId, sectionId, dayKey, scheduleType, periods }) {
  return api.put('/timetable/class/day', {
    school_id: schoolId,
    class_id: classId,
    section_id: sectionId,
    day_key: dayKey,
    schedule_type: scheduleType,
    periods,
  });
}

export function clearDay({ schoolId, classId, sectionId, dayKey, scheduleType }) {
  return api.delete('/timetable/class/day', {
    params: { school_id: schoolId, class_id: classId, section_id: sectionId, day_key: dayKey, schedule_type: scheduleType },
  });
}

export function deleteClassTimetable({ schoolId, classId, sectionId }) {
  return api.delete('/timetable/class', { params: { school_id: schoolId, class_id: classId, section_id: sectionId } });
}

export function copyTimetable({ schoolId, fromClassId, fromSectionId, toClassId, toSectionId, includeFriday }) {
  return api.post('/timetable/copy', {
    school_id: schoolId,
    from_class_id: fromClassId,
    from_section_id: fromSectionId,
    to_class_id: toClassId,
    to_section_id: toSectionId,
    include_friday: includeFriday,
  });
}

export function getTeacherBusy({ schoolId, dayKey, excludeClassId, excludeSectionId }) {
  return api.get('/timetable/teacher-busy', {
    params: { school_id: schoolId, day_key: dayKey, exclude_class_id: excludeClassId, exclude_section_id: excludeSectionId },
  });
}

// ── Read views ────────────────────────────────────────────────────────
export function getTeacherTimetable(range) {
  return api.get('/timetable/teacher', { params: { range } });
}

export function getStudentTimetable(range) {
  return api.get('/timetable/student', { params: { range } });
}

export function getParentTimetable(studentId, range) {
  return api.get(`/timetable/parent/${studentId}`, { params: { range } });
}

// ── Teacher-subject assignments (used by the Teachers manager screen) ──
export function getTeacherSubjects(teacherId) {
  return api.get(`/timetable/teacher-subjects/${teacherId}`);
}

export function setTeacherSubjects({ teacherId, subjectIds, schoolId }) {
  return api.put('/timetable/teacher-subjects', { teacher_id: teacherId, subject_ids: subjectIds, school_id: schoolId });
}
