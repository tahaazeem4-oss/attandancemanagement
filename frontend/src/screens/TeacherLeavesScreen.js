import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from '../components/AppHeader';

const STATUS_COLOR = {
  pending:  '#F59E0B', approved: '#10B981',
  rejected: '#EF4444', cancelled: '#94A3B8',
};
const STATUS_BG = {
  pending:  '#FFFBEB', approved: '#ECFDF5',
  rejected: '#FEF2F2', cancelled: '#F1F5F9',
};

export default function TeacherLeavesScreen({ navigation }) {
  const [leaves,  setLeaves]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [acting,  setActing]  = useState(null); // group_id being acted on

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/teachers/leaves');
      setLeaves(data);
    } catch {
      Alert.alert('Error', 'Could not load leave requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  // ── Actions ───────────────────────────────────────────────
  const doLeaveAction = async (group_id, status) => {
    setActing(group_id);
    try {
      console.log('[LeaveAction] PUT /teachers/leaves/group/' + group_id + '/status  body:', { status });
      const res = await api.put(`/teachers/leaves/group/${group_id}/status`, { status });
      console.log('[LeaveAction] success:', res.data);
      await load();
      Alert.alert(
        status === 'approved' ? 'Leave Approved ✓' : 'Leave Rejected',
        status === 'approved'
          ? 'The leave has been approved and attendance updated.'
          : 'The leave request has been rejected.',
      );
    } catch (e) {
      const code = e?.response?.status;
      const msg  = e?.response?.data?.message || e?.message || 'Could not update leave';
      console.error('[LeaveAction] error', code, msg, e?.response?.data);
      Alert.alert('Error' + (code ? ` (${code})` : ''), msg);
    } finally { setActing(null); }
  };

  const handleLeaveAction = (group_id, status, studentName, dateCount) => {
    const verb  = status === 'approved' ? 'Approve' : 'Reject';
    const days  = dateCount > 1 ? `${dateCount} days` : '1 day';
    const note  = status === 'approved'
      ? '\n\nAttendance will be automatically marked as Leave for all selected days.'
      : '';
    Alert.alert(
      `${verb} Leave`,
      `${verb} ${days} leave for ${studentName}?${note}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: verb,
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: () => doLeaveAction(group_id, status) },
      ],
    );
  };

  const handleWithdrawal = async (group_id, action) => {
    const label = action === 'approve' ? 'Approve' : 'Reject';
    Alert.alert(
      `${label} Withdrawal`,
      action === 'approve'
        ? 'Approve this withdrawal? The leave will be fully cancelled and attendance unlocked.'
        : 'Reject this withdrawal? The leave will remain active.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: action === 'approve' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(group_id);
            try {
              await api.put(`/teachers/leaves/group/${group_id}/withdrawal`, { action });
              await load();
              Alert.alert(
                action === 'approve' ? 'Withdrawal Approved' : 'Withdrawal Rejected',
                action === 'approve'
                  ? 'Leave has been cancelled successfully.'
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

  // ── Filtering ─────────────────────────────────────────────
  const pendingWithdrawals = leaves.filter(l => l.withdrawal_status === 'pending');

  const filtered = (() => {
    if (filter === 'withdrawals') return pendingWithdrawals;
    if (filter === 'all')         return leaves;
    return leaves.filter(l => l.status === filter && !l.withdrawal_status);
  })();

  const counts = {
    all:         leaves.length,
    pending:     leaves.filter(l => l.status === 'pending' && !l.withdrawal_status).length,
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

  // ── Card render ───────────────────────────────────────────
  const formatDates = (dates) => {
    if (!dates || dates.length === 0) return '—';
    if (dates.length === 1) return dates[0];
    if (dates.length <= 2) return dates.join(', ');
    return `${dates[0]}  +${dates.length - 1} more`;
  };

  const renderItem = ({ item }) => {
    const isActing = acting === item.group_id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
            <Text style={styles.meta}>
              {item.class_name} · Section {item.section_name}
              {item.roll_no ? ` · Roll #${item.roll_no}` : ''}
            </Text>
            <Text style={styles.date}>
              {formatDates(item.dates)}
              {item.dates?.length > 1 ? ` (${item.dates.length} days)` : ''}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: STATUS_BG[item.status] || '#F1F5F9' }]}>
            <Text style={[styles.badgeTxt, { color: STATUS_COLOR[item.status] || '#64748B' }]}>
              {item.status?.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.reason}>"{item.reason}"</Text>

        {/* Withdrawal request banner */}
        {item.withdrawal_status === 'pending' && (
          <View style={styles.withdrawBanner}>
            <Text style={styles.withdrawBannerTxt}>
              ↩ Student has requested withdrawal of this leave
            </Text>
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
              onPress={() => handleLeaveAction(item.group_id, 'approved', `${item.first_name} ${item.last_name}`, item.dates?.length)}
            >
              {isActing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.approveTxt}>✓ Approve</Text>}
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, isActing && { opacity: 0.6 }]}
              disabled={isActing}
              onPress={() => handleLeaveAction(item.group_id, 'rejected', `${item.first_name} ${item.last_name}`, item.dates?.length)}
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
        <View style={{ paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderColor: '#FDE68A' }}>
          <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600' }}>
            ↩ {pendingWithdrawals.length} withdrawal{pendingWithdrawals.length > 1 ? 's' : ''} pending
          </Text>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={[styles.tab, filter === tab.key && styles.tabActive,
              tab.key === 'withdrawals' && styles.tabWithdrawal,
              tab.key === 'withdrawals' && filter === tab.key && styles.tabWithdrawalActive,
            ]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[
              styles.tabTxt,
              filter === tab.key && styles.tabTxtActive,
              tab.key === 'withdrawals' && styles.tabWithdrawalTxt,
              tab.key === 'withdrawals' && filter === tab.key && styles.tabWithdrawalTxtActive,
            ]}>
              {tab.label}
              {counts[tab.key] > 0 ? ` (${counts[tab.key]})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
            data={filtered}
            keyExtractor={item => String(item.group_id)}
            extraData={leaves}
            contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
            onRefresh={load}
            refreshing={loading}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>
                  {filter === 'withdrawals' ? '✅' : '📭'}
                </Text>
                <Text style={styles.emptyTitle}>
                  {filter === 'withdrawals' ? 'No withdrawal requests' : 'No leave requests'}
                </Text>
                <Text style={styles.emptyTxt}>
                  {filter === 'withdrawals'
                    ? 'No students have requested withdrawal'
                    : filter === 'all'
                    ? 'No students have submitted leaves yet'
                    : `No ${filter} requests`}
                </Text>
              </View>
            }
            renderItem={renderItem}
          />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 24, paddingTop: 50, paddingBottom: 24, overflow: 'hidden' },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: '#E0E7FF', marginBottom: 4 },
  headerSub:    { fontSize: 13, color: 'rgba(224,231,255,0.6)' },

  tabs:                  { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  tab:                   { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabActive:             { borderBottomWidth: 2, borderColor: C.primary },
  tabTxt:                { fontSize: 11, fontWeight: '600', color: C.textMed },
  tabTxtActive:          { color: C.primary },
  tabWithdrawal:         { backgroundColor: '#FFFBEB' },
  tabWithdrawalActive:   { borderBottomWidth: 2, borderColor: '#D97706', backgroundColor: '#FFFBEB' },
  tabWithdrawalTxt:      { color: '#92400E' },
  tabWithdrawalTxtActive:{ color: '#B45309', fontWeight: '800' },

  card:         {
    backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10,
    elevation: 2, shadowColor: C.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  studentName:  { fontSize: 15, fontWeight: '700', color: C.textDark },
  meta:         { fontSize: 12, color: C.textMed, marginTop: 2 },
  date:         { fontSize: 12, color: C.textMed, marginTop: 2 },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  badgeTxt:     { fontSize: 12, fontWeight: '700' },
  reason:       { fontSize: 13, color: C.textMed, fontStyle: 'italic', marginBottom: 12, lineHeight: 18 },

  withdrawBanner:    { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginBottom: 10,
                        borderWidth: 1, borderColor: '#FDE68A' },
  withdrawBannerTxt: { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 8 },

  actions:      { flexDirection: 'row', gap: 10 },
  approveBtn:   { flex: 1, backgroundColor: C.present, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn:    { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  rejectTxt:    { color: '#EF4444', fontWeight: '700', fontSize: 13 },

  empty:        { alignItems: 'center', marginTop: 60 },
  emptyIcon:    { fontSize: 44, marginBottom: 12 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  emptyTxt:     { fontSize: 14, color: C.textMed, textAlign: 'center' },
});
