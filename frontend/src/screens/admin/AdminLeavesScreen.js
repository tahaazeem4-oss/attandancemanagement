import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';
import { exportFile } from '../../services/importExport';
import AppHeader from '../../components/AppHeader';

const STATUS_COLOR = { pending: '#D97706', approved: '#059669', rejected: '#DC2626', cancelled: '#64748B' };
const STATUS_BG    = { pending: '#FFFBEB', approved: '#ECFDF5', rejected: '#FEF2F2', cancelled: '#F1F5F9' };
const FILTERS      = ['all', 'pending', 'approved', 'rejected'];

export default function AdminLeavesScreen({ navigation }) {
  const [groups,  setGroups]  = useState([]);
  const [filter,  setFilter]  = useState('pending');
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(null); // group_id being acted on
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await api.get('/admin/leaves', { params });
      setGroups(data);
    } catch { Alert.alert('Error', 'Could not load leaves'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (group, status) => {
    setActing(group.group_id);
    try {
      await api.put(`/admin/leaves/group/${group.group_id}/status`, { status });
      load();
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setActing(null); }
  };

  const confirmUpdate = (group, status) => {
    const plural = group.dates.length > 1 ? `${group.dates.length} days` : '1 day';
    const verb   = status === 'approved' ? 'Approve' : 'Reject';
    const note   = status === 'approved'
      ? '\n\nAttendance will be automatically marked as LEAVE for all selected days.'
      : '';
    Alert.alert(
      `${verb} Leave`,
      `${verb} ${plural} leave for ${group.first_name} ${group.last_name}?${note}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: verb, style: status === 'rejected' ? 'destructive' : 'default',
          onPress: () => updateStatus(group, status) },
      ]
    );
  };

  const formatDates = (dates) => {
    if (!dates || dates.length === 0) return '—';
    if (dates.length <= 3) return dates.join('  •  ');
    return `${dates.slice(0, 2).join('  •  ')}  +${dates.length - 2} more`;
  };

  const handleExport = async () => {
    setExporting(true);
    const params = filter !== 'all' ? { status: filter } : {};
    await exportFile('/import-export/leaves/export', `leaves_${filter}.xlsx`, params);
    setExporting(false);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Leave Requests" navigation={navigation} />
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
        <Pressable
          style={{ backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>⬇ Export</Text>}
        </Pressable>
      </View>

      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={groups}
            keyExtractor={g => String(g.group_id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.empty}>No leave applications found.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
                    <Text style={styles.classInfo}>
                      {item.class_name} — Sec {item.section_name}{item.roll_no ? `  •  #${item.roll_no}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[item.status] || '#F1F5F9' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] || '#64748B' }]}>
                      {item.status?.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Dates */}
                <View style={styles.datesBox}>
                  <Text style={styles.datesLabel}>{item.dates?.length} day{item.dates?.length > 1 ? 's' : ''}</Text>
                  <Text style={styles.datesText}>{formatDates(item.dates)}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.appliedAt}>Applied: {new Date(item.applied_at).toLocaleDateString()}</Text>
                </View>

                <Text style={styles.reason}>"{item.reason}"</Text>

                {item.status === 'pending' && (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: '#ECFDF5' }]}
                      onPress={() => confirmUpdate(item, 'approved')}
                      disabled={acting === item.group_id}
                    >
                      {acting === item.group_id
                        ? <ActivityIndicator color="#059669" size="small" />
                        : <Text style={[styles.actionBtnText, { color: '#059669' }]}>✓ Approve</Text>}
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: '#FEF2F2' }]}
                      onPress={() => confirmUpdate(item, 'rejected')}
                      disabled={acting === item.group_id}
                    >
                      <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>✕ Reject</Text>
                    </Pressable>
                  </View>
                )}
                {item.status === 'approved' && (
                  <View style={styles.approvedNote}>
                    <Text style={styles.approvedNoteText}>🔒 Attendance auto-marked as LEAVE for all days</Text>
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
  container:       { flex: 1, backgroundColor: C.bg },
  header:          { paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14 },
  headerRow:       { flexDirection: 'row', alignItems: 'center' },
  headerTitle:     { color: '#E0E7FF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  headerSub:       { fontSize: 13, color: 'rgba(224,231,255,0.6)' },
  exportBtn:       { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  exportBtnTxt:    { color: '#fff', fontWeight: '700', fontSize: 12 },
  filterBar:       { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border, padding: 8, gap: 6 },
  filterBtn:       { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: C.bg },
  filterBtnActive: { backgroundColor: C.primary },
  filterText:      { fontSize: 12, fontWeight: '600', color: C.textMed },
  filterTextActive:{ color: '#fff' },
  card:            { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  studentName:     { fontSize: 15, fontWeight: '700', color: C.textDark },
  classInfo:       { fontSize: 12, color: C.textLight, marginTop: 2 },
  statusBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  statusText:      { fontSize: 11, fontWeight: '800' },
  datesBox:        { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 8 },
  datesLabel:      { fontSize: 12, fontWeight: '700', color: '#059669', marginBottom: 4 },
  datesText:       { fontSize: 12, color: '#065F46', lineHeight: 18 },
  metaRow:         { marginBottom: 6 },
  appliedAt:       { fontSize: 11, color: C.textLight },
  reason:          { fontSize: 13, color: C.textMed, fontStyle: 'italic', backgroundColor: C.bg, borderRadius: 8, padding: 10, marginBottom: 8 },
  actionRow:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn:       { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  actionBtnText:   { fontSize: 13, fontWeight: '700' },
  approvedNote:    { backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginTop: 4 },
  approvedNoteText:{ fontSize: 12, color: '#059669', fontWeight: '600' },
  empty:           { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
});
