import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, FlatList,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';
import { C, S } from '../../config/theme';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── helpers ───────────────────────────────────────────────────
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function statusColor(s) {
  if (s === 'present') return { bg: C.presentBg, text: C.present };
  if (s === 'absent')  return { bg: C.absentBg,  text: C.absent  };
  if (s === 'leave')   return { bg: C.leaveBg,   text: C.leave   };
  return { bg: '#F1F5F9', text: '#94A3B8' };
}

function statusLabel(s) {
  if (s === 'present') return 'P';
  if (s === 'absent')  return 'A';
  if (s === 'leave')   return 'L';
  return '';
}

// ── MonthPicker ───────────────────────────────────────────────
function MonthPicker({ year, month, onChange }) {
  const [open, setOpen] = useState(false);
  const [tempYear, setTempYear] = useState(year);

  const confirm = (m) => { onChange(tempYear, m); setOpen(false); };

  return (
    <>
      <Pressable style={st.monthBtn} onPress={() => { setTempYear(year); setOpen(true); }}>
        <Ionicons name="calendar-outline" size={16} color={C.primary} />
        <Text style={st.monthBtnText}>{MONTHS[month - 1]} {year}</Text>
        <Ionicons name="chevron-down" size={14} color={C.primary} />
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={st.pickerOverlay} onPress={() => setOpen(false)}>
          <Pressable style={st.pickerBox} onPress={() => {}}>
            {/* Year row */}
            <View style={st.yearRow}>
              <Pressable onPress={() => setTempYear(y => y - 1)} style={st.yearBtn}>
                <Ionicons name="chevron-back" size={20} color={C.primary} />
              </Pressable>
              <Text style={st.yearText}>{tempYear}</Text>
              <Pressable onPress={() => setTempYear(y => y + 1)} style={st.yearBtn}>
                <Ionicons name="chevron-forward" size={20} color={C.primary} />
              </Pressable>
            </View>
            {/* Month grid */}
            <View style={st.monthGrid}>
              {MONTHS.map((m, i) => {
                const active = tempYear === year && (i + 1) === month;
                return (
                  <Pressable key={m} style={[st.monthCell, active && st.monthCellActive]} onPress={() => confirm(i + 1)}>
                    <Text style={[st.monthCellText, active && st.monthCellTextActive]}>{m.slice(0, 3)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── TeacherPicker ─────────────────────────────────────────────
function TeacherPicker({ teachers, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const label = selected ? `${selected.first_name} ${selected.last_name}` : 'All Teachers';

  return (
    <>
      <Pressable style={st.teacherBtn} onPress={() => setOpen(true)}>
        <Ionicons name="person-outline" size={16} color={C.textMed} />
        <Text style={st.teacherBtnText} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color={C.textMed} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={st.pickerOverlay}>
          <View style={[st.pickerBox, { maxHeight: '75%' }]}>
            <Text style={st.pickerTitle}>Select Teacher</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* All option */}
              <Pressable
                style={[st.teacherRow, !selected && st.teacherRowActive]}
                onPress={() => { onSelect(null); setOpen(false); }}
              >
                <Text style={[st.teacherRowText, !selected && { color: C.primary, fontWeight: '700' }]}>All Teachers</Text>
              </Pressable>
              {teachers.map(t => {
                const active = selected?.id === t.id;
                return (
                  <Pressable
                    key={t.id}
                    style={[st.teacherRow, active && st.teacherRowActive]}
                    onPress={() => { onSelect(t); setOpen(false); }}
                  >
                    <View style={st.teacherAvatar}>
                      <Text style={st.teacherAvatarText}>{t.first_name[0]}{t.last_name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.teacherRowText, active && { color: C.primary, fontWeight: '700' }]}>
                        {t.first_name} {t.last_name}
                      </Text>
                      <Text style={st.teacherRowEmail}>{t.email}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={st.closePickerBtn} onPress={() => setOpen(false)}>
              <Text style={st.closePickerText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── SummaryBar ────────────────────────────────────────────────
function SummaryBar({ data }) {
  const totals = data.reduce(
    (acc, t) => ({
      present: acc.present + t.summary.present,
      absent:  acc.absent  + t.summary.absent,
      leave:   acc.leave   + t.summary.leave,
    }),
    { present: 0, absent: 0, leave: 0 },
  );

  return (
    <View style={st.summaryBar}>
      {[
        { label: 'Present', value: totals.present, color: C.present, bg: C.presentBg },
        { label: 'Absent',  value: totals.absent,  color: C.absent,  bg: C.absentBg  },
        { label: 'Leave',   value: totals.leave,   color: C.leave,   bg: C.leaveBg   },
      ].map(s => (
        <View key={s.label} style={[st.summaryItem, { backgroundColor: s.bg }]}>
          <Text style={[st.summaryValue, { color: s.color }]}>{s.value}</Text>
          <Text style={[st.summaryLabel, { color: s.color }]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── TeacherAttendanceCard ─────────────────────────────────────
function TeacherAttendanceCard({ teacher, year, month }) {
  const numDays = daysInMonth(year, month);
  const dayMap = {};
  (teacher.days || []).forEach(d => {
    const day = parseInt(d.date.split('-')[2]);
    dayMap[day] = d.status;
  });

  return (
    <View style={st.teacherCard}>
      {/* Header */}
      <View style={st.cardHeader}>
        <View style={st.cardAvatar}>
          <Text style={st.cardAvatarText}>{teacher.first_name[0]}{teacher.last_name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.cardName}>{teacher.first_name} {teacher.last_name}</Text>
          <Text style={st.cardEmail}>{teacher.email}</Text>
        </View>
        {/* Mini summary */}
        <View style={st.miniSummary}>
          <Text style={[st.miniCount, { color: C.present }]}>{teacher.summary.present}P</Text>
          <Text style={[st.miniCount, { color: C.absent  }]}>{teacher.summary.absent}A</Text>
          <Text style={[st.miniCount, { color: C.leave   }]}>{teacher.summary.leave}L</Text>
        </View>
      </View>

      {/* Day grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.dayScrollView}>
        <View style={st.dayRow}>
          {Array.from({ length: numDays }, (_, i) => i + 1).map(day => {
            const status = dayMap[day];
            const c = statusColor(status);
            return (
              <View key={day} style={[st.dayCell, { backgroundColor: c.bg }]}>
                <Text style={[st.dayCellDay, { color: c.text }]}>{day}</Text>
                <Text style={[st.dayCellStatus, { color: c.text }]}>{statusLabel(status)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Export CSV ────────────────────────────────────────────────
async function exportCSV(data, year, month) {
  if (!data.length) { Alert.alert('No data', 'No attendance records to export.'); return; }

  const numDays = daysInMonth(year, month);
  const monthName = MONTHS[month - 1];

  // Header row: Name, Email, day1..dayN, Present, Absent, Leave
  const dayHeaders = Array.from({ length: numDays }, (_, i) => `${i + 1} ${monthName.slice(0,3)}`).join(',');
  const header = `Name,Email,${dayHeaders},Present,Absent,Leave\n`;

  const rows = data.map(teacher => {
    const dayMap = {};
    (teacher.days || []).forEach(d => {
      const day = parseInt(d.date.split('-')[2]);
      dayMap[day] = d.status === 'present' ? 'P' : d.status === 'absent' ? 'A' : d.status === 'leave' ? 'L' : '';
    });
    const dayCols = Array.from({ length: numDays }, (_, i) => dayMap[i + 1] || '').join(',');
    const name = `"${teacher.first_name} ${teacher.last_name}"`;
    return `${name},${teacher.email},${dayCols},${teacher.summary.present},${teacher.summary.absent},${teacher.summary.leave}`;
  });

  const csv = header + rows.join('\n');
  const fileName = `teacher_attendance_${year}_${String(month).padStart(2, '0')}.csv`;

  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } else {
      const path = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Attendance Report' });
      } else {
        Alert.alert('Saved', `File saved to: ${path}`);
      }
    }
  } catch (e) {
    Alert.alert('Export failed', e?.message || 'Could not export file.');
  }
}

// ── Main Screen ───────────────────────────────────────────────
export default function AdminTeacherAttendanceScreen() {
  const now = new Date();
  const [year,            setYear]            = useState(now.getFullYear());
  const [month,           setMonth]           = useState(now.getMonth() + 1);
  const [allTeachers,     setAllTeachers]     = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [data,            setData]            = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [exporting,       setExporting]       = useState(false);

  // Load teacher list once
  useEffect(() => {
    api.get('/admin/teachers')
      .then(({ data: d }) => setAllTeachers(d || []))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = { year, month };
    if (selectedTeacher) params.teacher_id = selectedTeacher.id;
    api.get('/admin/teacher-attendance', { params })
      .then(({ data: d }) => setData(d || []))
      .catch(() => Alert.alert('Error', 'Could not load attendance data.'))
      .finally(() => setLoading(false));
  }, [year, month, selectedTeacher]);

  // Auto-load when filters change
  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try { await exportCSV(data, year, month); }
    finally { setExporting(false); }
  };

  return (
    <View style={st.container}>
      {/* ── Header ────────────────────────────────────────────── */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Teacher Attendance</Text>
        <Text style={st.headerSub}>{MONTHS[month - 1]} {year}</Text>
      </View>

      {/* ── Filters ───────────────────────────────────────────── */}
      <View style={st.filtersRow}>
        <MonthPicker
          year={year} month={month}
          onChange={(y, m) => { setYear(y); setMonth(m); }}
        />
        <TeacherPicker
          teachers={allTeachers}
          selected={selectedTeacher}
          onSelect={setSelectedTeacher}
        />
      </View>

      {/* ── Export button ─────────────────────────────────────── */}
      <View style={st.exportRow}>
        <Text style={st.resultCount}>{data.length} teacher{data.length !== 1 ? 's' : ''}</Text>
        <Pressable style={st.exportBtn} onPress={handleExport} disabled={exporting || loading}>
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <Ionicons name="download-outline" size={15} color="#fff" />
                <Text style={st.exportBtnText}>Export CSV</Text>
              </>
          }
        </Pressable>
      </View>

      {/* ── Summary totals ────────────────────────────────────── */}
      {!loading && data.length > 0 && <SummaryBar data={data} />}

      {/* ── Content ───────────────────────────────────────────── */}
      {loading
        ? <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        : data.length === 0
          ? (
            <View style={st.empty}>
              <Ionicons name="calendar-outline" size={48} color={C.textLight} />
              <Text style={st.emptyText}>No attendance records for {MONTHS[month - 1]} {year}</Text>
              <Text style={st.emptySubText}>Records appear when teachers check in via the teacher app.</Text>
            </View>
          )
          : (
            <FlatList
              data={data}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <TeacherAttendanceCard teacher={item} year={year} month={month} />
              )}
              contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
            />
          )
      }
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },

  header:      { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 18 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },

  filtersRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },

  monthBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#BFDBFE' },
  monthBtnText: { flex: 1, color: C.primary, fontWeight: '700', fontSize: 13 },

  teacherBtn:     { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: C.border },
  teacherBtnText: { flex: 1, color: C.textMed, fontWeight: '600', fontSize: 13 },

  exportRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  resultCount:   { fontSize: 13, color: C.textLight, fontWeight: '600' },
  exportBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  summaryBar:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 4 },
  summaryItem:   { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  summaryValue:  { fontSize: 20, fontWeight: '800' },
  summaryLabel:  { fontSize: 11, fontWeight: '600', marginTop: 1 },

  teacherCard:  { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: C.shadow, shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  cardAvatar:   { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  cardAvatarText: { color: C.primary, fontSize: 15, fontWeight: '800' },
  cardName:     { fontSize: 14, fontWeight: '700', color: C.textDark },
  cardEmail:    { fontSize: 11, color: C.textLight, marginTop: 1 },

  miniSummary:  { alignItems: 'flex-end', gap: 2 },
  miniCount:    { fontSize: 11, fontWeight: '700' },

  dayScrollView: { borderTopWidth: 1, borderTopColor: C.border },
  dayRow:        { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  dayCell:       { width: 32, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dayCellDay:    { fontSize: 10, fontWeight: '600' },
  dayCellStatus: { fontSize: 12, fontWeight: '800', marginTop: 1 },

  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:     { fontSize: 16, fontWeight: '700', color: C.textMed, textAlign: 'center', marginTop: 12 },
  emptySubText:  { fontSize: 13, color: C.textLight, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  // Pickers
  pickerOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  pickerBox:         { backgroundColor: C.card, borderRadius: 22, padding: 22, width: '100%', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  pickerTitle:       { fontSize: 17, fontWeight: '800', color: C.textDark, marginBottom: 14 },

  yearRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  yearBtn:     { padding: 8 },
  yearText:    { fontSize: 18, fontWeight: '800', color: C.textDark },
  monthGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  monthCell:   { width: '22%', paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: C.cardAlt },
  monthCellActive: { backgroundColor: C.primary },
  monthCellText:   { fontSize: 13, fontWeight: '600', color: C.textMed },
  monthCellTextActive: { color: '#fff' },

  teacherRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  teacherRowActive: { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 8 },
  teacherRowText:   { fontSize: 14, fontWeight: '600', color: C.textDark },
  teacherRowEmail:  { fontSize: 11, color: C.textLight },
  teacherAvatar:    { width: 32, height: 32, borderRadius: 9, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  teacherAvatarText:{ color: C.primary, fontSize: 12, fontWeight: '800' },
  closePickerBtn:   { marginTop: 14, backgroundColor: C.cardAlt, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  closePickerText:  { color: C.textMed, fontWeight: '700', fontSize: 14 },
});
