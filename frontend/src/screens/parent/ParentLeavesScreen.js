// frontend/src/screens/parent/ParentLeavesScreen.js
// "Leave Actions" landing for a parent — aggregates leave applications across
// every linked child via GET /parent/leaves, opened directly without picking
// a child first.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';

const STATUS_COLOR = { pending: '#D97706', approved: '#059669', rejected: '#DC2626', cancelled: '#64748B' };
const STATUS_BG    = { pending: '#FFFBEB', approved: '#ECFDF5', rejected: '#FEF2F2', cancelled: '#F1F5F9' };

function formatDates(dates) {
  if (!dates || !dates.length) return '—';
  if (dates.length === 1) return dates[0];
  if (dates.length <= 3) return dates.join(', ');
  return `${dates[0]}  +${dates.length - 1} more`;
}

export default function ParentLeavesScreen({ navigation }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/parent/leaves');
      setLeaves(data?.leaves || []);
    } catch {
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  return (
    <View style={styles.root}>
      <AppHeader title="Leave Actions" eyebrow="All Children" navigation={navigation} />
      {loading ? (
        <ActivityIndicator color={C.primary} size="large" style={{ flex: 1, marginTop: 40 }} />
      ) : (
        <FlatList
          data={leaves}
          keyExtractor={(g) => `${g.student_id}:${g.group_id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>No leave applications yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.top}>
                <View style={{ flex: 1 }}>
                  {item.student_name ? <Text style={styles.childName}>{item.student_name}</Text> : null}
                  <Text style={styles.dates}>{formatDates(item.dates)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[item.status] || '#F1F5F9' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] || '#64748B' }]}>
                    {item.status?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.reason}>"{item.reason}"</Text>
              {item.withdrawal_status === 'pending' && (
                <Text style={styles.withdrawalNote}>⏳ Withdrawal requested — awaiting teacher approval</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  empty: { textAlign: 'center', marginTop: 40, color: C.textMed },
  card: {
    backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  childName: { fontSize: 12, color: C.primary, fontWeight: '800', marginBottom: 2 },
  dates: { fontSize: 15, fontWeight: '800', color: C.textDark },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  reason: { fontSize: 13, color: C.textMed, fontStyle: 'italic', marginTop: 8 },
  withdrawalNote: { fontSize: 12, color: '#D97706', fontWeight: '700', marginTop: 8 },
});
