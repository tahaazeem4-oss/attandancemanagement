import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, ScrollView,
  StyleSheet, Alert, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from './AppHeader';
import PickerField from './PickerField';
import EntityEmptyState from './EntityEmptyState';

const STATUS_COLOR = {
  pending: '#F59E0B', approved: '#10B981',
  rejected: '#EF4444', cancelled: '#94A3B8',
};
const STATUS_BG = {
  pending: '#FFFBEB', approved: '#ECFDF5',
  rejected: '#FEF2F2', cancelled: '#F1F5F9',
};

export default function LeaveRequestsManagerScreen({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';
  const isTeacher = mode === 'teacher';

  const [leaves, setLeaves] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [filterCampus, setFilterCampus] = useState('');
  const [acting, setActing] = useState(null);

  const leavesPath = isOrg ? '/org-admin/leaves' : isTeacher ? '/teachers/leaves' : '/admin/leaves';
  const statusPath = isOrg ? '/org-admin/leaves/group' : isTeacher ? '/teachers/leaves/group' : '/admin/leaves/group';
  const withdrawalPath = isTeacher ? '/teachers/leaves/group' : '/admin/leaves/group';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(leavesPath);
      setLeaves(Array.isArray(data) ? data : data || []);
    } catch {
      Alert.alert('Error', 'Could not load leave requests');
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [leavesPath]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (!isOrg) return;
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data || [])).catch(() => setCampuses([]));
  }, [isOrg]);

  const doLeaveAction = async (group_id, status) => {
    setActing(group_id);
    try {
      await api.put(`${statusPath}/${group_id}/status`, { status });
      await load();
      if (!isOrg) {
        Alert.alert(
          status === 'approved' ? 'Leave Approved' : 'Leave Rejected',
          status === 'approved'
            ? 'The leave has been approved and attendance updated.'
            : 'The leave request has been rejected.',
        );
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not update leave');
    } finally {
      setActing(null);
    }
  };

  const handleLeaveAction = (group_id, status, studentName, dateCount) => {
    const verb = status === 'approved' ? 'Approve' : 'Reject';
    const days = dateCount > 1 ? `${dateCount} days` : '1 day';
    const note = status === 'approved' && !isOrg
      ? '\n\nAttendance will be automatically marked as Leave for all selected days.'
      : '';

    Alert.alert(
      `${verb} Leave`,
      `${verb} ${days} leave for ${studentName}?${note}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: () => doLeaveAction(group_id, status),
        },
      ],
    );
  };

  const handleWithdrawal = async (group_id, action) => {
    const label = action === 'approve' ? 'Approve' : 'Reject';
    Alert.alert(
      `${label} Withdrawal`,
      action === 'approve'
        ? 'Approve this withdrawal? The leave will be cancelled and attendance unlocked.'
        : 'Reject this withdrawal? The leave will remain active.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          style: action === 'approve' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(group_id);
            try {
              await api.put(`${withdrawalPath}/${group_id}/withdrawal`, { action });
              await load();
              Alert.alert(
                action === 'approve' ? 'Withdrawal Approved' : 'Withdrawal Rejected',
                action === 'approve'
                  ? 'Leave has been cancelled and attendance unlocked.'
                  : 'Leave remains active as before.',
              );
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not process request');
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  };

  const pendingWithdrawals = isOrg ? [] : leaves.filter(l => l.withdrawal_status === 'pending');

  const filtered = (() => {
    let list = leaves;

    if (!isOrg) {
      if (filter === 'withdrawals') {
        list = pendingWithdrawals;
      } else if (filter === 'pending') {
        list = leaves.filter(l => l.status === 'pending' || l.withdrawal_status === 'pending');
      } else if (filter !== 'all') {
        list = leaves.filter(l => l.status === filter && !l.withdrawal_status);
      }
    } else if (filter !== 'all') {
      list = leaves.filter(l => l.status === filter);
    }

    if (isOrg && filterCampus) {
      list = list.filter(l => String(l.campus_id) === String(filterCampus));
    }

    return list;
  })();

  const counts = {
    all: leaves.length,
    pending: isOrg
      ? leaves.filter(l => l.status === 'pending').length
      : leaves.filter(l => l.status === 'pending' || l.withdrawal_status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved' && (isOrg || !l.withdrawal_status)).length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
    withdrawals: pendingWithdrawals.length,
  };

  const tabs = isOrg
    ? [
      { key: 'all', label: 'All' },
      { key: 'pending', label: 'Pending' },
      { key: 'approved', label: 'Approved' },
      { key: 'rejected', label: 'Rejected' },
    ]
    : [
      { key: 'all', label: 'All' },
      { key: 'pending', label: 'Pending' },
      { key: 'approved', label: 'Approved' },
      { key: 'rejected', label: 'Rejected' },
      { key: 'withdrawals', label: '↩ Withdrawals' },
    ];

  const formatDates = dates => {
    if (!dates || dates.length === 0) return '—';
    const sorted = [...dates].sort();
    if (sorted.length === 1) return sorted[0];
    if (isOrg) {
      const from = sorted[0]?.slice(0, 10) || '';
      const to = sorted[sorted.length - 1]?.slice(0, 10) || '';
      return from === to ? from : `${from}  →  ${to}`;
    }
    if (sorted.length <= 2) return sorted.join(', ');
    return `${sorted[0]}  +${sorted.length - 1} more`;
  };

  const getStudentName = item => item.student_name || `${item.first_name || ''} ${item.last_name || ''}`.trim();

  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];

  const renderItem = ({ item }) => {
    const isActing = acting === item.group_id;
    const studentName = getStudentName(item);
    const status = item.status || 'pending';
    const campusName = campuses.find(c => String(c.id) === String(item.campus_id))?.name;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{studentName}</Text>
            <Text style={styles.meta}>
              {item.class_name} · Section {item.section_name}
              {item.roll_no ? ` · Roll #${item.roll_no}` : ''}
              {isOrg && campusName ? ` · ${campusName}` : ''}
            </Text>
            <Text style={styles.date}>
              {formatDates(item.dates)}
              {!isOrg && item.dates?.length > 1 ? ` (${item.dates.length} days)` : ''}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: item.withdrawal_status === 'pending' ? '#FFFBEB' : STATUS_BG[status] || '#F1F5F9' }]}>
            <Text style={[styles.badgeTxt, { color: item.withdrawal_status === 'pending' ? '#F59E0B' : STATUS_COLOR[status] || '#64748B' }]}>
              {item.withdrawal_status === 'pending' ? '↩ PENDING' : status.toUpperCase()}
            </Text>
          </View>
        </View>

        {!!item.reason && <Text style={styles.reason}>"{item.reason}"</Text>}

        {!isOrg && item.withdrawal_status === 'pending' && (
          <View style={styles.withdrawBanner}>
            <Text style={styles.withdrawBannerTxt}>↩ Student requested withdrawal of this leave</Text>
            <View style={styles.actions}>
              <Pressable style={[styles.approveBtn, isActing && { opacity: 0.6 }]} disabled={isActing} onPress={() => handleWithdrawal(item.group_id, 'approve')}>
                {isActing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.approveTxt}>✓ Approve</Text>}
              </Pressable>
              <Pressable style={[styles.rejectBtn, isActing && { opacity: 0.6 }]} disabled={isActing} onPress={() => handleWithdrawal(item.group_id, 'reject')}>
                {isActing ? <ActivityIndicator color="#EF4444" size="small" /> : <Text style={styles.rejectTxt}>✗ Reject</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {status === 'pending' && !item.withdrawal_status && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.approveBtn, isActing && { opacity: 0.6 }]}
              disabled={isActing}
              onPress={() => handleLeaveAction(item.group_id, 'approved', studentName, item.dates?.length || 1)}
            >
              {isActing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.approveTxt}>✓ Approve</Text>}
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, isActing && { opacity: 0.6 }]}
              disabled={isActing}
              onPress={() => handleLeaveAction(item.group_id, 'rejected', studentName, item.dates?.length || 1)}
            >
              {isActing ? <ActivityIndicator color="#EF4444" size="small" /> : <Text style={styles.rejectTxt}>✗ Reject</Text>}
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Leave Requests" navigation={navigation} />

      {isOrg && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
          <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusItems} placeholder="Filter by campus" />
        </View>
      )}

      {!isOrg && pendingWithdrawals.length > 0 && (
        <View style={styles.withdrawAlert}>
          <Text style={styles.withdrawAlertTxt}>
            ↩ {pendingWithdrawals.length} withdrawal{pendingWithdrawals.length > 1 ? 's' : ''} pending review
          </Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[
              styles.tab,
              filter === tab.key && styles.tabActive,
              tab.key === 'withdrawals' && styles.tabWithdrawal,
              tab.key === 'withdrawals' && filter === tab.key && styles.tabWithdrawalActive,
            ]}
            onPress={() => setFilter(tab.key)}
          >
            <Text
              style={[
                styles.tabTxt,
                filter === tab.key && styles.tabTxtActive,
                tab.key === 'withdrawals' && { color: '#F59E0B' },
                tab.key === 'withdrawals' && filter === tab.key && { color: '#fff' },
              ]}
            >
              {tab.label}
              {counts[tab.key] > 0 ? `  ${counts[tab.key]}` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item, index) => String(item.group_id ?? item.id ?? index)}
          contentContainerStyle={[styles.list, { paddingTop: 10 }]}
          ListEmptyComponent={<EntityEmptyState icon="calendar-outline" title="No leave requests found" subtitle="Try another filter or check back later" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  withdrawAlert: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderColor: '#FDE68A' },
  withdrawAlertTxt: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  tabsScroll: { flexGrow: 0, borderBottomWidth: 1, borderColor: '#E2E8F0', minHeight: 56, backgroundColor: '#FFFFFF' },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 8, paddingRight: 18, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E2E8F0', marginRight: 8 },
  tabActive: { backgroundColor: C.primary },
  tabWithdrawal: { backgroundColor: '#FFFBEB' },
  tabWithdrawalActive: { backgroundColor: '#F59E0B' },
  tabTxt: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  tabTxtActive: { color: '#fff' },
  list: { padding: 14, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#94A3B8', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  studentName: { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 3 },
  meta: { fontSize: 12, color: C.textLight, marginBottom: 4 },
  date: { fontSize: 12, fontWeight: '600', color: '#0EA5E9' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeTxt: { fontSize: 10, fontWeight: '700' },
  reason: { fontSize: 12, color: '#64748B', fontStyle: 'italic', marginBottom: 10, lineHeight: 16 },
  withdrawBanner: { backgroundColor: '#FFFBEB', padding: 10, borderRadius: 8, marginBottom: 10 },
  withdrawBannerTxt: { fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 10 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  approveBtn: { width: '48%', backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  approveTxt: { color: '#fff', fontWeight: '600', fontSize: 12 },
  rejectBtn: { width: '48%', backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FCA5A5' },
  rejectTxt: { color: '#EF4444', fontWeight: '600', fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyTxt: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
});