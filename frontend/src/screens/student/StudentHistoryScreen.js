import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, ActivityIndicator, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { C } from '../../config/theme';

const STATUS_COLOR = { present: '#059669', absent: '#DC2626', leave: '#D97706' };
const STATUS_BG    = { present: '#ECFDF5', absent: '#FEF2F2', leave: '#FFFBEB' };
const STATUS_ICON  = { present: '✓', absent: '✗', leave: '~' };
const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function StudentHistoryScreen() {
  const now     = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [records, setRecords] = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/student-portal/attendance', { params: { month, year } });
      setRecords(data.records || []); setStats(data.stats || null);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }
    setMonth(m); setYear(y);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#064E3B" />

      <LinearGradient colors={['#064E3B', '#065F46', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        {/* Month navigator */}
        <View style={styles.navRow}>
          <Pressable style={styles.navBtn} onPress={() => changeMonth(-1)}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{MONTHS[month - 1]} {year}</Text>
          <Pressable style={[styles.navBtn, isCurrentMonth && styles.navBtnDisabled]} onPress={() => !isCurrentMonth && changeMonth(1)}>
            <Text style={[styles.navArrow, isCurrentMonth && { opacity: 0.3 }]}>›</Text>
          </Pressable>
        </View>

        {/* Stats row */}
        {stats && (
          <View style={styles.statsRow}>
            {[['P', stats.present, '#4ADE80'], ['A', stats.absent, '#F87171'], ['L', stats.leave, '#FCD34D']].map(([label, val, color]) => (
              <View key={label} style={styles.statPill}>
                <Text style={[styles.statNum, { color }]}>{val}</Text>
                <Text style={styles.statLabel}>{label === 'P' ? 'Present' : label === 'A' ? 'Absent' : 'Leave'}</Text>
              </View>
            ))}
          </View>
        )}
      </LinearGradient>

      {loading
        ? <ActivityIndicator color="#059669" style={{ flex: 1 }} />
        : (
          <FlatList
            data={records}
            keyExtractor={r => r.date}
            contentContainerStyle={{ padding: 14 }}
            ListEmptyComponent={<Text style={styles.empty}>No records for {MONTHS[month - 1]} {year}.</Text>}
            renderItem={({ item }) => {
              const d = new Date(item.date);
              const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
              const dayNum  = d.getDate();
              return (
                <View style={styles.row}>
                  <View style={styles.dateBubble}>
                    <Text style={styles.dayNum}>{dayNum}</Text>
                    <Text style={styles.dayName}>{dayName}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[item.status] }]}>
                    <Text style={[styles.statusIcon, { color: STATUS_COLOR[item.status] }]}>{STATUS_ICON[item.status]}</Text>
                    <Text style={[styles.statusLabel, { color: STATUS_COLOR[item.status] }]}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  header:      { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 20 },
  navRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 16 },
  navBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  navBtnDisabled: { opacity: 0.3 },
  navArrow:    { color: '#fff', fontSize: 22, fontWeight: '700' },
  monthTitle:  { color: '#fff', fontSize: 22, fontWeight: '800', minWidth: 140, textAlign: 'center' },
  statsRow:    { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  statPill:    { alignItems: 'center' },
  statNum:     { fontSize: 24, fontWeight: '800' },
  statLabel:   { color: '#A7F3D0', fontSize: 11, fontWeight: '600', marginTop: 2 },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, marginBottom: 8, padding: 14, gap: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  dateBubble:  { width: 48, alignItems: 'center' },
  dayNum:      { fontSize: 22, fontWeight: '800', color: C.textDark },
  dayName:     { fontSize: 11, color: C.textLight, fontWeight: '600' },
  divider:     { width: 1, height: 36, backgroundColor: C.border },
  statusBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  statusIcon:  { fontSize: 16, fontWeight: '800' },
  statusLabel: { fontSize: 13, fontWeight: '700' },
  empty:       { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
});
