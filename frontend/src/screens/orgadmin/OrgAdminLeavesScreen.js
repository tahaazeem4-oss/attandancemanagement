import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import PickerField from '../../components/PickerField';

const STATUS_COLOR = {
  pending: '#F59E0B', approved: '#10B981',
  rejected: '#EF4444', cancelled: '#94A3B8',
};
const STATUS_BG = {
  pending: '#FFFBEB', approved: '#ECFDF5',
  rejected: '#FEF2F2', cancelled: '#F1F5F9',
};

export default function OrgAdminLeavesScreen({ navigation }) {
  const [leaves, setLeaves] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [filterCampus, setFilterCampus] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/org-admin/leaves')
      .then(({ data }) => setLeaves(Array.isArray(data) ? data : []))
      .catch(() => setLeaves([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data)).catch(() => {});
  }, []);

  const TABS = ['all', 'pending', 'approved', 'rejected'];
  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];

  const filtered = leaves.filter(l => {
    const matchStatus = filter === 'all' || l.status === filter;
    const matchCampus = !filterCampus || String(l.campus_id) === String(filterCampus);
    return matchStatus && matchCampus;
  });

  const handleAction = (item, action) => {
    Alert.alert(
      action === 'approved' ? 'Approve Leave' : 'Reject Leave',
      `${action === 'approved' ? 'Approve' : 'Reject'} leave for ${item.student_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approved' ? 'Approve' : 'Reject',
          style: action === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await api.put(`/org-admin/leaves/group/${item.group_id}/status`, { status: action });
              load();
            } catch (err) {
              Alert.alert('Error', err?.response?.data?.message || 'Could not update status');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => {
    const status = item.status || 'pending';
    const dates = Array.isArray(item.dates) ? item.dates.sort() : [];
    const from = dates[0]?.slice(0, 10) || '';
    const to   = dates[dates.length - 1]?.slice(0, 10) || '';
    const campusName = campuses.find(c => String(c.id) === String(item.campus_id))?.name;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.studentName}>{item.student_name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[status] || STATUS_BG.cancelled }]}>
            <Text style={[styles.statusTxt, { color: STATUS_COLOR[status] || STATUS_COLOR.cancelled }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {item.class_name}  ·  Sec {item.section_name}
          {campusName ? `  ·  ${campusName}` : ''}
        </Text>
        <Text style={styles.dates}>{from === to ? from : `${from}  →  ${to}`}</Text>
        {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
        {status === 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => handleAction(item, 'approved')}>
              <Text style={styles.approveTxt}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleAction(item, 'rejected')}>
              <Text style={styles.rejectTxt}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Leave Requests" navigation={navigation} />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
        <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusItems} placeholder="Filter by campus" />
      </View>
      <View style={styles.tabs}>
        {TABS.map(t => (
          <Text key={t} style={[styles.tab, filter === t && styles.tabActive]} onPress={() => setFilter(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Text>
        ))}
      </View>
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
        : <FlatList data={filtered} keyExtractor={i => String(i.group_id)} renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
            ListEmptyComponent={<Text style={styles.empty}>No leave requests found.</Text>} />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9', color: '#64748B', fontSize: 12, fontWeight: '600' },
  tabActive: { backgroundColor: '#2563EB', color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  studentName: { fontSize: 14, fontWeight: '700', color: C.textDark },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, color: '#64748B', marginBottom: 3 },
  dates: { fontSize: 12, fontWeight: '600', color: '#475569' },
  reason: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: '#ECFDF5', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  approveTxt: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  rejectBtn: { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  rejectTxt: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
});

