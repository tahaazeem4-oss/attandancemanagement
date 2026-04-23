import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';

const STATUS_COLOR = { pending: '#D97706', approved: '#059669', rejected: '#DC2626' };
const STATUS_BG    = { pending: '#FFFBEB', approved: '#ECFDF5', rejected: '#FEF2F2' };
const FILTERS      = ['all', 'pending', 'approved', 'rejected'];

export default function AdminLeavesScreen() {
  const [leaves,  setLeaves]  = useState([]);
  const [filter,  setFilter]  = useState('pending');
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(null); // leave id being approved/rejected

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await api.get('/admin/leaves', { params });
      setLeaves(data);
    } catch { Alert.alert('Error', 'Could not load leaves'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    setActing(id);
    try {
      await api.put(`/admin/leaves/${id}/status`, { status });
      load();
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setActing(null); }
  };

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        {FILTERS.map(f => (
          <Pressable
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={leaves}
            keyExtractor={l => String(l.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.empty}>No leave applications found.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
                    <Text style={styles.classInfo}>{item.class_name} — Sec {item.section_name}{item.roll_no ? `  •  #${item.roll_no}` : ''}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[item.status] }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.dateText}>📅 {item.date}</Text>
                  <Text style={styles.appliedAt}>Applied: {new Date(item.applied_at).toLocaleDateString()}</Text>
                </View>

                <Text style={styles.reason}>"{item.reason}"</Text>

                {item.status === 'pending' && (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: '#ECFDF5' }]}
                      onPress={() => updateStatus(item.id, 'approved')}
                      disabled={acting === item.id}
                    >
                      {acting === item.id
                        ? <ActivityIndicator color="#059669" size="small" />
                        : <Text style={[styles.actionBtnText, { color: '#059669' }]}>✓ Approve</Text>}
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: '#FEF2F2' }]}
                      onPress={() => updateStatus(item.id, 'rejected')}
                      disabled={acting === item.id}
                    >
                      <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>✕ Reject</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  filterBar:      { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border, padding: 8, gap: 6 },
  filterBtn:      { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: C.bg },
  filterBtnActive:{ backgroundColor: C.primary },
  filterText:     { fontSize: 12, fontWeight: '600', color: C.textMed },
  filterTextActive:{ color: '#fff' },
  card:           { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardTop:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  studentName:    { fontSize: 15, fontWeight: '700', color: C.textDark },
  classInfo:      { fontSize: 12, color: C.textLight, marginTop: 2 },
  statusBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  statusText:     { fontSize: 11, fontWeight: '800' },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dateText:       { fontSize: 13, fontWeight: '600', color: C.textMed },
  appliedAt:      { fontSize: 11, color: C.textLight },
  reason:         { fontSize: 13, color: C.textMed, fontStyle: 'italic', backgroundColor: C.bg, borderRadius: 8, padding: 10, marginBottom: 8 },
  actionRow:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn:      { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  actionBtnText:  { fontSize: 13, fontWeight: '700' },
  empty:          { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
});
