import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RoleDashboardScreen from '../../components/RoleDashboardScreen';
import { buildDashboardCards } from '../../config/dashboardCards';
import useAiTutorConfig from '../../features/aiTutor/hooks/useAiTutorConfig';

const CARDS = buildDashboardCards([
  { type: 'teachers', key: 'AdminTeachers' },
  { type: 'students', key: 'AdminStudents' },
  { type: 'classes', key: 'AdminClasses' },
  { type: 'timetable', key: 'AdminTimetable' },
  { type: 'leaves', key: 'AdminLeaves' },
  { type: 'notifications', key: 'SendNotification' },
  { type: 'circulars', key: 'StaffNotifications' },
  { type: 'upload', key: 'UploadLecture' },
  { type: 'lectures', key: 'LectureList' },
  { type: 'subjects', key: 'AdminSubjects' },
  { type: 'parents', key: 'AdminParents' },
  { type: 'teacherAttendanceReport', key: 'AdminTeacherAttendance' },
  { type: 'aiMaterials', key: 'TeacherAiMaterials' },
  { type: 'aiPolicy', key: 'AdminAiPolicy' },
  { type: 'aiAnalytics', key: 'AdminAiAnalytics' },
]);

export default function AdminHomeScreen({ navigation }) {
  const { user, school, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { enabled: aiEnabled } = useAiTutorConfig();

  const cards = aiEnabled
    ? CARDS
    : CARDS.filter((c) => !['TeacherAiMaterials', 'AdminAiPolicy', 'AdminAiAnalytics'].includes(c.key));

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch {
      // keep current stats on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Re-fetch unread count and stats when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStats();
    } finally {
      setRefreshing(false);
    }
  }, [fetchStats]);

  return (
    <RoleDashboardScreen
      user={user}
      school={school}
      logout={logout}
      loading={loading}
      cards={cards}
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
      refreshing={refreshing}
      onRefresh={onRefresh}
      preferenceKey={`dashboard:admin:${user?.id || user?.email || 'anon'}`}
    />
  );
}
