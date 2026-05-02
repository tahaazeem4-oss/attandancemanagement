import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C } from '../config/theme';
import { exportFile } from '../services/importExport';
import AppHeader from '../components/AppHeader';
import AttendanceExportModal from '../components/AttendanceExportModal';

const STATUS_COLOR = { present: C.present, absent: C.absent, leave: C.leave, not_marked: C.textLight };
const STATUS_BG    = { present: C.presentBg, absent: C.absentBg, leave: C.leaveBg, not_marked: '#F1F5F9' };
const STATUS_LABEL = { present: 'Present', absent: 'Absent', leave: 'On Leave', not_marked: 'Not Marked' };

export default function ReportScreen({ route, navigation }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const today = new Date().toISOString().slice(0, 10);

  const [records,  setRecords]  = useState([]);
  const [date,     setDate]     = useState(today);
  const [loading,  setLoading]  = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [exportModal,  setExportModal]  = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/report', {
        params: { class_id, section_id, date }
      });
      setRecords(data.records || []);
    } catch {
      Alert.alert('Error', 'Could not load report');
    } finally {
      setLoading(false);
    }
  };

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    const next = d.toISOString().slice(0, 10);
    if (next <= today) setDate(next);
  };

  const handleExport = async (from, to) => {
    setExporting(true);
    await exportFile(
      '/import-export/attendance/export',
      `attendance_${class_name}_${section_name}_${from}_to_${to}.xlsx`,
      { class_id, section_id, from, to }
    );
    setExporting(false);
  };

  useEffect(() => { fetchReport(); }, [date]);

  const counts = {
    present: records.filter(r => r.status === 'present').length,
    absent:  records.filter(r => r.status === 'absent').length,
    leave:   records.filter(r => r.status === 'leave').length,
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Attendance Report" navigation={navigation} />

      {/* Class info + export */}
      <View style={styles.infoBar}>
        <Text style={styles.headerTitle}>{class_name} — Section {section_name}</Text>
        <Pressable onPress={() => setExportModal(true)} disabled={exporting} style={styles.exportBtn}>
          {exporting
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Text style={styles.exportBtnTxt}>⬇ Export</Text>}
        </Pressable>
      </View>

      {/* Date navigator */}
      <View style={styles.dateRow}>
        <Pressable onPress={() => changeDate(-1)} style={styles.dateArrow}>
          <Text style={styles.dateArrowText}>‹</Text>
        </Pressable>
        <Text style={styles.headerDate}>{date}</Text>
        <Pressable
          onPress={() => changeDate(1)}
          disabled={date >= today}
          style={[styles.dateArrow, date >= today && styles.dateArrowDisabled]}
        >
          <Text style={[styles.dateArrowText, date >= today && { opacity: 0.3 }]}>›</Text>
        </Pressable>
      </View>

      {/* Summary count pills */}
      <View style={styles.summary}>
        <View style={[styles.summaryCard, { backgroundColor: '#D1FAE5' }]}>
          <Text style={[styles.summaryNum, { color: C.present }]}>{counts.present}</Text>
          <Text style={[styles.summaryLabel, { color: C.present }]}>PRESENT</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
          <Text style={[styles.summaryNum, { color: C.absent }]}>{counts.absent}</Text>
          <Text style={[styles.summaryLabel, { color: C.absent }]}>ABSENT</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={[styles.summaryNum, { color: C.leave }]}>{counts.leave}</Text>
          <Text style={[styles.summaryLabel, { color: C.leave }]}>ON LEAVE</Text>
        </View>
      </View>

      {/* Student records */}
      {loading
        ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={C.primary} size="large" />
          </View>
        )
        : (
          <FlatList
            data={records}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, paddingTop: 8 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <LinearGradient
                  colors={['#EEF2FF', '#E0E7FF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.first_name} {item.last_name}</Text>
                  {item.roll_no && <Text style={styles.rowRoll}>#{item.roll_no}</Text>}
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_BG[item.status] }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status] || item.status}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      <AttendanceExportModal
        visible={exportModal}
        onClose={() => setExportModal(false)}
        onExport={handleExport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },

  infoBar:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border,
  },
  headerTitle:  { color: C.textDark, fontSize: 15, fontWeight: '800', flex: 1 },
  exportBtn:    { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  exportBtnTxt: { color: C.primary, fontWeight: '700', fontSize: 12 },
  headerDate:   { color: C.textDark, fontSize: 14, fontWeight: '700' },

  dateRow:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border,
    paddingVertical: 8,
  },
  dateArrow:    { paddingHorizontal: 20, paddingVertical: 4 },
  dateArrowDisabled: { opacity: 0.4 },
  dateArrowText:{ color: C.primary, fontSize: 26, fontWeight: '300', lineHeight: 30 },

  summary:      {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderBottomWidth: 1, borderColor: C.border,
    paddingVertical: 12, paddingHorizontal: 12,
    gap: 10,
  },
  summaryCard:  {
    flex: 1, alignItems: 'center', borderRadius: 14,
    paddingVertical: 14,
  },
  summaryNum:   { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '700', marginTop: 3, letterSpacing: 0.5 },

  row:          {
    backgroundColor: C.card, borderRadius: 14, marginVertical: 4,
    paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: C.shadow, shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar:       {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText:   { color: C.primary, fontWeight: '800', fontSize: 12 },
  rowName:      { fontSize: 14, fontWeight: '700', color: C.textDark },
  rowRoll:      { fontSize: 11, color: C.textLight, marginTop: 1 },
  statusPill:   { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:   { fontSize: 11, fontWeight: '700' },
});
