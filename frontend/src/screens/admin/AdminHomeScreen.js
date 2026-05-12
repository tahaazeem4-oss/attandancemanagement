import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RoleDashboardScreen from '../../components/RoleDashboardScreen';

// Each card: Ionicons icon + subtle tinted icon box + label
const CARDS = [
  { key: 'AdminTeachers',    icon: 'people-outline',        label: 'Teachers',       tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'AdminStudents',    icon: 'school-outline',        label: 'Students',       tint: '#0EA5E9', bg: '#F0F9FF' },
  { key: 'AdminClasses',     icon: 'library-outline',       label: 'Classes',        tint: '#10B981', bg: '#ECFDF5' },
  { key: 'AdminAssignments', icon: 'clipboard-outline',     label: 'Assignments',    tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'AdminLeaves',      icon: 'mail-open-outline',     label: 'Leaves',         tint: '#EF4444', bg: '#FEF2F2' },
  { key: 'SendNotification', icon: 'notifications-outline', label: 'Notifications',  tint: '#8B5CF6', bg: '#F5F3FF' },
  { key: 'UploadLecture',      icon: 'cloud-upload-outline',  label: 'Upload',         tint: '#0891B2', bg: '#F0F9FF' },
  { key: 'LectureList',        icon: 'videocam-outline',      label: 'Lectures',       tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'AdminSubjects',           icon: 'book-outline',          label: 'Subjects',         tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'AdminParents',            icon: 'heart-outline',         label: 'Parents',          tint: '#EC4899', bg: '#FCE7F3' },
  { key: 'AdminTeacherAttendance',  icon: 'calendar-outline',      label: 'Teacher Report',   tint: '#10B981', bg: '#ECFDF5' },
];

export default function AdminHomeScreen({ navigation }) {
  const { user, school, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Re-fetch unread count and stats when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      api.get('/admin/stats')
        .then(({ data }) => setStats(data))
        .catch(() => {});
    }, [])
  );

  return (
    <RoleDashboardScreen
      user={user}
      school={school}
      logout={logout}
      loading={loading}
      cards={CARDS}
      stats={[
        { label: 'Teachers', value: stats?.teachers, color: '#93C5FD' },
        { label: 'Students', value: stats?.students, color: '#6EE7B7' },
        { label: 'Classes', value: stats?.classes, color: '#FDE68A' },
        { label: 'Pending', value: stats?.pending_leaves, color: '#FCA5A5' },
      ]}
      sectionTitle="Management"
      headerLabel="Admin Panel"
      badgeByKey={{ AdminLeaves: stats?.pending_leaves ?? 0 }}
      navigation={navigation}
    />
  );
}
