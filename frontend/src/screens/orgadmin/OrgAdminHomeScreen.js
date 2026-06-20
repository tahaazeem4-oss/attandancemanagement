import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RoleDashboardScreen from '../../components/RoleDashboardScreen';
import { buildDashboardCards } from '../../config/dashboardCards';
import useAiTutorConfig from '../../features/aiTutor/hooks/useAiTutorConfig';

const CARDS = buildDashboardCards([
  { type: 'campuses', key: 'OrgAdminCampuses' },
  { type: 'admins', key: 'OrgAdminAdmins' },
  { type: 'teachers', key: 'OrgAdminTeachers' },
  { type: 'students', key: 'OrgAdminStudents' },
  { type: 'classes', key: 'OrgAdminClasses' },
  { type: 'timetable', key: 'OrgAdminTimetable' },
  { type: 'subjects', key: 'OrgAdminSubjects' },
  { type: 'parents', key: 'OrgAdminParents' },
  { type: 'leaves', key: 'OrgAdminLeaves' },
  { type: 'notifications', key: 'OrgAdminNotifications' },
  { type: 'circulars', key: 'StaffNotifications' },
  { type: 'aiPolicy', key: 'AdminAiPolicy' },
  { type: 'aiAnalytics', key: 'AdminAiAnalytics' },
]);

export default function OrgAdminHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { enabled: aiEnabled } = useAiTutorConfig();

  const cards = aiEnabled
    ? CARDS
    : CARDS.filter((c) => !['AdminAiPolicy', 'AdminAiAnalytics'].includes(c.key));

  const fetchStats = useCallback(() => {
    api.get('/org-admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
  }, []);

  useFocusEffect(
    useCallback(() => { fetchStats(); }, [fetchStats])
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
      logout={logout}
      loading={loading}
      cards={cards}
      stats={[
        { label: 'Campuses', value: stats?.campuses, color: '#93C5FD' },
        { label: 'Teachers', value: stats?.teachers, color: '#6EE7B7' },
        { label: 'Students', value: stats?.students, color: '#FDE68A' },
        { label: 'Pending', value: stats?.pending_leaves, color: '#FCA5A5' },
      ]}
      sectionTitle="Management"
      headerLabel="Organization Admin Panel"
      badgeByKey={{ OrgAdminLeaves: stats?.pending_leaves ?? 0 }}
      navigation={navigation}
      refreshing={refreshing}
      onRefresh={onRefresh}
      preferenceKey={`dashboard:org-admin:${user?.id || user?.email || 'anon'}`}
    />
  );
}
