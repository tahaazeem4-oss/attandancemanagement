import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';

const STATUS_COLOR = {
  pending: '#F59E0B', approved: '#10B981',
  rejected: '#EF4444', cancelled: '#94A3B8',
};
const STATUS_BG = {
  pending: '#FFFBEB', approved: '#ECFDF5',
  rejected: '#FEF2F2', cancelled: '#F1F5F9',
};

export default function AdminLeavesScreen({ navigation }) {
  const [leaves,  setLeaves]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [acting,  setActing]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/leaves');
      setLeaves(data);
    } catch {
      Alert.alert('Error', 'Could not load leave requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doLeaveAction = async (group_id, status) => {
    setActing(group_id);
    try {
      await api.put(`/admin/leaves/group/${group_id}/status`, { status });
      await load();
      Alert.alert(
        status === 'approved' ? 'Leave Approved ✓' : 'Leave Rejected',
        status === 'approved'
          ? 'The leave has been approved and attendance updated.'
          : 'The leave request has been rejected.',
      );
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not update leave');
    } finally { setActing(null); }
  };

  const handleLeaveAction = (group_id, status, studentName, dateCount) => {
    const verb = status === 'approved' ? 'Approve' : 'Reject';
    const days = dateCount > 1 ? `${dateCount} days` : '1 day';
    const note = status === 'approved'
      ? '\n\nAttendance will be automatically marked as Leave for all selected days.'
      : '';
    Alert.alert(
      `${verb} Leave`,
      `${verb} ${days} leave for ${studentName}?${note}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: verb, style: status === 'rejected' ? 'destructive' : 'default',
          onPress: () => doLeaveAction(group_id, status) },
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
        { text: label, style: action === 'approve' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(group_id);
            try {
              await api.put(`/admin/leaves/group/${group_id}/withdrawal`, { action });
              await load();
              Alert.alert(
                action === 'approve' ? 'Withdrawal Approved' : 'Withdrawal Rejected',
                action === 'approve'
                  ? 'Leave has been cancelled and attendance unlocked.'
                  : 'Leave remains active as before.'
              );
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not process request');
            } finally { setActing(null); }
          }
        },
      ]
    );
  };

  const pendingWithdrawals = leaves.filter(l => l.withdrawal_status === 'pending');

  const filtered = (() => {
    if (filter === 'withdrawals') return pendingWithdrawals;
    if (filter === 'all') return leaves;
    if (filter === 'pending') {
      return leaves.filter(l => l.status === 'pending' || l.withdrawal_status === 'pending');
    }
    return leaves.filter(l => l.status === filter && !l.withdrawal_status);
  })();

  const counts = {
    all:         leaves.length,
    pending:     leaves.filter(l => l.status === 'pending' || l.withdrawal_status === 'pending').length,
    approved:    leaves.filter(l => l.status === 'approved' && !l.withdrawal_status).length,
    rejected:    leaves.filter(l => l.status === 'rejected').length,
    withdrawals: pendingWithdrawals.length,
  };

  const TABS = [
    { key: 'all',         label: 'All' },
    { key: 'pending',     label: 'Pending' },
    { key: 'approved',    label: 'Approved' },
    { key: 'rejected',    label: 'Rejected' },
    { key: 'withdrawals', label: '↩ Withdrawals' },
  ];

  const formatDates = (dates) => {
    if (!dates || dates.length === 0) return '—';
    if (dates.length === 1) return dates[0];
    if (dates.length <= 2) return dates.join(', ');
    return `${dates[0]}  +${dates.length - 1} more`;
  };

  const getStudentName = (item) =>
    item.student_name || `${item.first_name || ''} ${item.last_name || ''}`.trim();

  const renderItem = ({ item }) => {
    const isActing = acting === item.group_id;
    const name = getStudentName(item);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{name}</Text>
            <Text style={styles.meta}>
              {item.class_name} · Section {item.section_name}
              {item.roll_no ? ` · Roll #${item.roll_no}` : ''}
            </Text>
            <Text style={styles.date}>
              {formatDates(item.dates)}
              {item.dates?.length > 1 ? ` (${item.dates.length} days)` : ''}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: item.withdrawal_status === 'pending' ? '#FFFBEB' : STATUS_BG[item.status] || '#F1F5F9' }]}>
            <Text style={[styles.badgeTxt, { color: item.withdrawal_status === 'pending' ? '#F59E0B' : STATUS_COLOR[item.status] || '#64748B' }]}>
              {item.withdrawal_status === 'pending' ? '↩ PENDING' : item.status?.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.reason}>"{item.reason}"</Text>

        {/* Withdrawal request banner */}
        {item.withdrawal_status === 'pending' && (
          <View style={styles.withdrawBanner}>
            <Text style={styles.withdrawBannerTxt}>↩ Student requested withdrawal of this leave</Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.approveBtn, isActing && { opacity: 0.6 }]}
                disabled={isActing}
                onPress={() => handleWithdrawal(item.group_id, 'approve')}
              >
                {isActing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.approveTxt}>✓ Approve</Text>}
              </Pressable>
              <Pressable
                style={[styles.rejectBtn, isActing && { opacity: 0.6 }]}
                disabled={isActing}
                onPress={() => handleWithdrawal(item.group_id, 'reject')}
              >
                {isActing
                  ? <ActivityIndicator color="#EF4444" size="small" />
                  : <Text style={styles.rejectTxt}>✗ Reject</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {/* Normal approve/reject for pending leaves */}
        {item.status === 'pending' && !item.withdrawal_status && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.approveBtn, isActing && { opacity: 0.6 }]}
              disabled={isActing}
              onPress={() => handleLeaveAction(item.group_id, 'approved', name, item.dates?.length)}
            >
              {isActing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.approveTxt}>✓ Approve</Text>}
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, isActing && { opacity: 0.6 }]}
              disabled={isActing}
              onPress={() => handleLeaveAction(item.group_id, 'rejected', name, item.dates?.length)}
            >
              {isActing
                ? <ActivityIndicator color="#EF4444" size="small" />
                : <Text style={styles.rejectTxt}>✗ Reject</Text>}
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Leave Requests" navigation={navigation} />

      {pendingWithdrawals.length > 0 && (
        <View style={styles.withdrawAlert}>
          <Text style={styles.withdrawAlertTxt}>
            ↩ {pendingWithdrawals.length} withdrawal{pendingWithdrawals.length > 1 ? 's' : ''} pending review
          </Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map(tab => (
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
            <Text style={[
              styles.tabTxt,
              filter === tab.key && styles.tabTxtActive,
              tab.key === 'withdrawals' && { color: '#F59E0B' },
              tab.key === 'withdrawals' && filter === tab.key && { color: '#fff' },
            ]}>
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>No leave requests found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  withdrawAlert: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderColor: '#FDE68A' },
  withdrawAlertTxt: { fontSize: 12, color: '#92400E', fontWeight: '600' },

  tabsScroll:   { flexGrow: 0, borderBottomWidth: 1, borderColor: '#E2E8F0', minHeight: 56, backgroundColor: '#FFFFFF' },
  tabsContent:  { paddingHorizontal: 12, paddingVertical: 8, paddingRight: 18, alignItems: 'center' },
  tab:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E2E8F0', marginRight: 8 },
  tabActive:    { backgroundColor: C.primary },
  tabWithdrawal:       { backgroundColor: '#FFFBEB' },
  tabWithdrawalActive: { backgroundColor: '#F59E0B' },
  tabTxt:       { fontSize: 12, fontWeight: '600', color: '#64748B' },
  tabTxtActive: { color: '#fff' },

  list: { padding: 14, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#94A3B8', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  studentName: { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 3 },
  meta:        { fontSize: 12, color: C.textLight, marginBottom: 4 },
  date:        { fontSize: 12, fontWeight: '600', color: '#0EA5E9' },
  badge:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeTxt:    { fontSize: 10, fontWeight: '700' },
  reason:      { fontSize: 12, color: '#64748B', fontStyle: 'italic', marginBottom: 10, lineHeight: 16 },

  withdrawBanner:    { backgroundColor: '#FFFBEB', padding: 10, borderRadius: 8, marginBottom: 10 },
  withdrawBannerTxt: { fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 10 },

  actions:    { flexDirection: 'row', justifyContent: 'space-between' },
  approveBtn: { width: '48%', backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  approveTxt: { color: '#fff', fontWeight: '600', fontSize: 12 },
  rejectBtn:  { width: '48%', backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FCA5A5' },
  rejectTxt:  { color: '#EF4444', fontWeight: '600', fontSize: 12 },

  empty:    { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyTxt: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
});


