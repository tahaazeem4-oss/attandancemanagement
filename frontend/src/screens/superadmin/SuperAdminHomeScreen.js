import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RoleDashboardScreen from '../../components/RoleDashboardScreen';
import { buildDashboardCards } from '../../config/dashboardCards';

const ACTIONS = buildDashboardCards([
  { type: 'organizations', key: 'SuperAdminOrganizations' },
  { type: 'campuses', key: 'SuperAdminSchools' },
  { type: 'teachers', key: 'SuperAdminTeachers' },
  { type: 'students', key: 'SuperAdminStudents' },
  { type: 'classes', key: 'SuperAdminClasses' },
  { type: 'subjects', key: 'SuperAdminSubjects' },
  { type: 'parents', key: 'SuperAdminParents' },
  { type: 'aiPolicy', key: 'AdminAiPolicy' },
  { type: 'aiAnalytics', key: 'AdminAiAnalytics' },
]);

export default function SuperAdminHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(() => {
    api.get('/super-admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
  }, []);

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
      logout={logout}
      loading={loading}
      cards={ACTIONS}
      stats={[
        { label: 'Orgs', value: stats?.organizations ?? stats?.schools, color: '#C4B5FD' },
        { label: 'Schools', value: stats?.schools, color: '#93C5FD' },
        { label: 'Teachers', value: stats?.teachers, color: '#6EE7B7' },
        { label: 'Students', value: stats?.students, color: '#FDE68A' },
      ]}
      sectionTitle="Platform Management"
      superBadgeText="SUPER ADMIN"
      subtitle={user?.email}
      navigation={navigation}
      refreshing={refreshing}
      onRefresh={onRefresh}
      preferenceKey={`dashboard:super-admin:${user?.id || user?.email || 'anon'}`}
    />
  );
}
