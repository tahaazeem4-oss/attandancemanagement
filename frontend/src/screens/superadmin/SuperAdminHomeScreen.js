import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RoleDashboardScreen from '../../components/RoleDashboardScreen';

const ACTIONS = [
  { key: 'SuperAdminOrganizations', icon: 'layers-outline',   label: 'Organizations', sub: 'Manage organizations · assign org admins',              tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'SuperAdminSchools',       icon: 'business-outline', label: 'Schools',       sub: 'Add, edit campuses · assign campus admins',              tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'SuperAdminTeachers',      icon: 'people-outline',   label: 'Teachers',      sub: 'Add, edit, delete teachers · reset passwords',           tint: '#10B981', bg: '#ECFDF5' },
  { key: 'SuperAdminStudents',      icon: 'school-outline',   label: 'Students',      sub: 'Add, edit, delete students · reset portal passwords',    tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'SuperAdminClasses',       icon: 'library-outline',  label: 'Classes',       sub: 'Manage classes and sections across campuses',            tint: '#06B6D4', bg: '#ECFEFF' },
  { key: 'SuperAdminSubjects',      icon: 'book-outline',     label: 'Subjects',      sub: 'Manage subjects across campuses',                        tint: '#8B5CF6', bg: '#F5F3FF' },
  { key: 'SuperAdminParents',       icon: 'people-circle-outline', label: 'Parents',  sub: 'Manage parent accounts by campus',                       tint: '#EC4899', bg: '#FCE7F3' },
  { key: 'AdminAiPolicy',           icon: 'shield-checkmark-outline', label: 'AI Policy',     tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'AdminAiAnalytics',        icon: 'analytics-outline',     label: 'AI Analytics',  tint: '#F97316', bg: '#FFF7ED' },
];

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
    />
  );
}
