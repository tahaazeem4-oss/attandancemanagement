import React from 'react';
import AdminTimetableEditor from './AdminTimetableEditor';
import TeacherTimetableScreen from './TeacherTimetableScreen';

export function AdminTimetableScreen(props) {
  return <AdminTimetableEditor {...props} mode="admin" />;
}

export function OrgAdminTimetableScreen(props) {
  return <AdminTimetableEditor {...props} mode="orgadmin" />;
}

export { TeacherTimetableScreen };
