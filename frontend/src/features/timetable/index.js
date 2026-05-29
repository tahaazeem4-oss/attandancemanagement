import React from 'react';
import TimetableManagerScreen from './TimetableManagerScreen';
import TimetableSummaryCard from './TimetableSummaryCard';

export function AdminTimetableScreen(props) {
  return <TimetableManagerScreen {...props} mode="admin" />;
}

export function OrgAdminTimetableScreen(props) {
  return <TimetableManagerScreen {...props} mode="orgadmin" />;
}

export function TeacherTimetableScreen(props) {
  return <TimetableManagerScreen {...props} mode="teacher" />;
}

export { TimetableSummaryCard };