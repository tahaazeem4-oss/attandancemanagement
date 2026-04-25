import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C } from '../config/theme';
import { HeaderBlobs } from '../components/Deco';

const STATUS_COLOR = { pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444' };
const STATUS_BG    = { pending: '#FFFBEB', approved: '#ECFDF5', rejected: '#FEF2F2' };
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export default function TeacherLeavesScreen() {
  const [leaves,  setLeaves]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [acting,  setActing]  = useState(null);  // id of leave being updated

  const load = useCallback(() => {
    setLoading(true);
    api.get('/teachers/leaves')
      .then(({ data }) => setLeaves(data))
      .catch(() => Alert.alert('Error', 'Could not load leave requests'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  const handleAction = async (id, status) => {
    setActing(id);
    try {
      await api.put(`/teachers/leaves/${id}`, { status });
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not update leave');
    } finally {
      setActing(null);
    }
  };

  const filtered = filter === 'all' ? leaves : leaves.filter(l => l.status === filter);

  const counts = {
    all:      leaves.length,
    pending:  leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
          <Text style={styles.meta}>{item.class_name} · Section {item.section_name}{item.roll_no ? ` · Roll #${item.roll_no}` : ''}</Text>
          <Text style={styles.date}>📅 {item.date}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_BG[item.status] }]}>
          <Text style={[styles.badgeTxt, { color: STATUS_COLOR[item.status] }]}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>
      </View>
      <Text style={styles.reason}>"{item.reason}"</Text>
      {item.status === 'pending' && (
        <View style={styles.actions}>
          <Pressable
            style={[styles.approveBtn, acting === item.id && { opacity: 0.6 }]}
            disabled={acting === item.id}
            onPress={() => handleAction(item.id, 'approved')}
          >
            {acting === item.id
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.approveTxt}>✓ Approve</Text>}
          </Pressable>
          <Pressable
            style={[styles.rejectBtn, acting === item.id && { opacity: 0.6 }]}
            disabled={acting === item.id}
            onPress={() => handleAction(item.id, 'rejected')}
          >
            {acting === item.id
              ? <ActivityIndicator color="#EF4444" size="small" />
              : <Text style={styles.rejectTxt}>✗ Reject</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* Header */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <Text style={styles.headerTitle}>📝  Leave Requests</Text>
        <Text style={styles.headerSub}>Students from your assigned class</Text>
      </LinearGradient>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {['all', 'pending', 'approved', 'rejected'].map(tab => (
          <Pressable
            key={tab}
            style={[styles.tab, filter === tab && styles.tabActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.tabTxt, filter === tab && styles.tabTxtActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {counts[tab] > 0 ? ` (${counts[tab]})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading
        ? <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={filtered}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
            onRefresh={load}
            refreshing={loading}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyTitle}>No leave requests</Text>
                <Text style={styles.emptyTxt}>
                  {filter === 'all' ? 'No students have submitted leaves yet' : `No ${filter} requests`}
                </Text>
              </View>
            }
            renderItem={renderItem}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 24, paddingTop: 50, paddingBottom: 24, overflow: 'hidden' },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: '#E0E7FF', marginBottom: 4 },
  headerSub:    { fontSize: 13, color: 'rgba(224,231,255,0.6)' },

  tabs:         { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 2, borderColor: C.primary },
  tabTxt:       { fontSize: 12, fontWeight: '600', color: C.textMed },
  tabTxtActive: { color: C.primary },

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
