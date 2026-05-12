import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RoleDashboardScreen from '../../components/RoleDashboardScreen';

const CARDS = [
  { key: 'OrgAdminCampuses',      icon: 'business-outline',      label: 'Campuses',      tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'OrgAdminAdmins',        icon: 'person-circle-outline', label: 'Admins',        tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'OrgAdminTeachers',      icon: 'people-outline',        label: 'Teachers',      tint: '#0EA5E9', bg: '#F0F9FF' },
  { key: 'OrgAdminStudents',      icon: 'school-outline',        label: 'Students',      tint: '#10B981', bg: '#ECFDF5' },
  { key: 'OrgAdminClasses',       icon: 'library-outline',       label: 'Classes',       tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'OrgAdminSubjects',      icon: 'book-outline',          label: 'Subjects',      tint: '#EC4899', bg: '#FDF2F8' },
  { key: 'OrgAdminParents',       icon: 'people-circle-outline', label: 'Parents',       tint: '#06B6D4', bg: '#ECFEFF' },
  { key: 'OrgAdminLeaves',        icon: 'mail-open-outline',     label: 'Leaves',        tint: '#EF4444', bg: '#FEF2F2' },
  { key: 'OrgAdminNotifications', icon: 'notifications-outline', label: 'Notifications', tint: '#8B5CF6', bg: '#F5F3FF' },
];

export default function OrgAdminHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      cards={CARDS}
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
    />
  );
}
