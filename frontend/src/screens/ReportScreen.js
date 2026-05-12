import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, Modal, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '../services/api';
import { C } from '../config/theme';
import { exportFile } from '../services/importExport';
import AppHeader from '../components/AppHeader';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

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

// â”€â”€ MonthPicker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <View style={st.yearRow}>
              <Pressable onPress={() => setTempYear(y => y - 1)} style={st.yearBtn}>
                <Ionicons name="chevron-back" size={20} color={C.primary} />
              </Pressable>
              <Text style={st.yearText}>{tempYear}</Text>
              <Pressable onPress={() => setTempYear(y => y + 1)} style={st.yearBtn}>
                <Ionicons name="chevron-forward" size={20} color={C.primary} />
              </Pressable>
            </View>
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

// â”€â”€ StudentPicker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StudentPicker({ students, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const label = selected ? `${selected.first_name} ${selected.last_name}` : 'All Students';

  return (
    <>
      <Pressable style={st.studentBtn} onPress={() => setOpen(true)}>
        <Ionicons name="person-outline" size={16} color={C.textMed} />
        <Text style={st.studentBtnText} numberOfLines={1}>{label}</Text>
        {selected
          ? <Pressable onPress={() => onSelect(null)} hitSlop={10}><Ionicons name="close-circle" size={17} color={C.primary} /></Pressable>
          : <Ionicons name="chevron-down" size={14} color={C.textMed} />
        }
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={st.pickerOverlay}>
          <View style={[st.pickerBox, { maxHeight: '75%' }]}>
            <Text style={st.pickerTitle}>Select Student</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                style={[st.studentRow, !selected && st.studentRowActive]}
                onPress={() => { onSelect(null); setOpen(false); }}
              >
                <Text style={[st.studentRowText, !selected && { color: C.primary, fontWeight: '700' }]}>All Students</Text>
                {!selected && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
              </Pressable>
              {students.map(s => {
                const active = selected?.id === s.id;
                return (
                  <Pressable
                    key={s.id}
                    style={[st.studentRow, active && st.studentRowActive]}
                    onPress={() => { onSelect(s); setOpen(false); }}
                  >
                    <View style={st.studentAvatar}>
                      <Text style={st.studentAvatarText}>{s.first_name[0]}{s.last_name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.studentRowText, active && { color: C.primary, fontWeight: '700' }]}>
                        {s.first_name} {s.last_name}
                      </Text>
                      {s.roll_no ? <Text style={st.studentRoll}>Roll #{s.roll_no}</Text> : null}
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

// â”€â”€ SummaryBar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SummaryBar({ data }) {
  const totals = data.reduce(
    (acc, s) => ({ present: acc.present + s.summary.present, absent: acc.absent + s.summary.absent, leave: acc.leave + s.summary.leave }),
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

// â”€â”€ StudentCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StudentCard({ student, year, month, onPress }) {
  const numDays = daysInMonth(year, month);
  const dayMap = {};
  (student.days || []).forEach(d => {
    const day = parseInt(d.date.split('-')[2]);
    dayMap[day] = d.status;
  });

  return (
    <Pressable style={st.studentCard} onPress={onPress}>
      <View style={st.cardHeader}>
        <View style={st.cardAvatar}>
          <Text style={st.cardAvatarText}>{student.first_name[0]}{student.last_name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.cardName}>{student.first_name} {student.last_name}</Text>
          {student.roll_no ? <Text style={st.cardRoll}>Roll #{student.roll_no}</Text> : null}
        </View>
        <View style={st.miniSummary}>
          <Text style={[st.miniCount, { color: C.present }]}>{student.summary.present}P</Text>
          <Text style={[st.miniCount, { color: C.absent  }]}>{student.summary.absent}A</Text>
          <Text style={[st.miniCount, { color: C.leave   }]}>{student.summary.leave}L</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ marginLeft: 4 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.dayScrollView}>
        <View style={st.dayRow}>
          {Array.from({ length: numDays }, (_, i) => i + 1).map(day => {
            const status = dayMap[day];
            const c = statusColor(status);
            return (
              <View key={day} style={[st.dayCell, { backgroundColor: c.bg }]}>
                <Text style={[st.dayCellDay,    { color: c.text }]}>{day}</Text>
                <Text style={[st.dayCellStatus, { color: c.text }]}>{statusLabel(status)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Pressable>
  );
}

// â”€â”€ CSV export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportCSV(data, year, month, className, sectionName) {
  if (!data.length) { Alert.alert('No data', 'No records to export.'); return; }
  const numDays = daysInMonth(year, month);
  const monthName = MONTHS[month - 1];
  const dayHeaders = Array.from({ length: numDays }, (_, i) => `${i + 1} ${monthName.slice(0, 3)}`).join(',');
  const header = `Name,Roll No,${dayHeaders},Present,Absent,Leave\n`;
  const rows = data.map(s => {
    const dayMap = {};
    (s.days || []).forEach(d => { dayMap[parseInt(d.date.split('-')[2])] = d.status; });
    const dayCols = Array.from({ length: numDays }, (_, i) => {
      const st = dayMap[i + 1];
      return st === 'present' ? 'P' : st === 'absent' ? 'A' : st === 'leave' ? 'L' : '';
    }).join(',');
    return `"${s.first_name} ${s.last_name}",${s.roll_no || ''},${dayCols},${s.summary.present},${s.summary.absent},${s.summary.leave}`;
  });
  const csv = header + rows.join('\n');
  const fileName = `attendance_${className}_${sectionName}_${year}_${String(month).padStart(2, '0')}.csv`;

  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } else {
      const path = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Attendance' });
      } else {
        Alert.alert('Saved', `File saved to:\n${path}`);
      }
    }
  } catch (e) {
    Alert.alert('Export failed', e?.message || 'Could not export file.');
  }
}

// â”€â”€ ExportOptionsModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Lets user pick XLSX (date range) or CSV (current month view)
function ExportOptionsModal({ visible, onClose, onXlsx, onCsv, exporting }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.pickerOverlay} onPress={onClose}>
        <Pressable style={[st.pickerBox, { paddingVertical: 24 }]} onPress={() => {}}>
          <Text style={st.pickerTitle}>Export Attendance</Text>

          <Pressable style={st.exportOptionBtn} onPress={onCsv} disabled={exporting}>
            <Ionicons name="document-text-outline" size={22} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={st.exportOptionLabel}>CSV  -  Current Month View</Text>
              <Text style={st.exportOptionSub}>Downloads a CSV for the month shown on screen</Text>
            </View>
          </Pressable>

          <Pressable style={st.exportOptionBtn} onPress={onXlsx} disabled={exporting}>
            <Ionicons name="grid-outline" size={22} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={[st.exportOptionLabel, { color: '#10B981' }]}>XLSX  -  Custom Date Range</Text>
              <Text style={st.exportOptionSub}>Pick any from/to range and export as Excel</Text>
            </View>
          </Pressable>

          <Pressable style={st.closePickerBtn} onPress={onClose}>
            <Text style={st.closePickerText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ReportScreen({ route, navigation }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const now = new Date();
  const [year,            setYear]            = useState(now.getFullYear());
  const [month,           setMonth]           = useState(now.getMonth() + 1);
  const [data,            setData]            = useState([]);
  const [allStudents,     setAllStudents]     = useState([]); // full list for picker
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [exporting,       setExporting]       = useState(false);
  const [exportOptions,   setExportOptions]   = useState(false);
  const [xlsxModal,       setXlsxModal]       = useState(false);

  // Load once: full student list for the picker (year/month-independent)
  useEffect(() => {
    api.get('/attendance/monthly', { params: { class_id, section_id, year: now.getFullYear(), month: now.getMonth() + 1 } })
      .then(({ data: d }) => setAllStudents(d || []))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = { class_id, section_id, year, month };
    if (selectedStudent) params.student_id = selectedStudent.id;
    api.get('/attendance/monthly', { params })
      .then(({ data: d }) => setData(d || []))
      .catch(() => Alert.alert('Error', 'Could not load attendance'))
      .finally(() => setLoading(false));
  }, [year, month, selectedStudent]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleCsvExport = async () => {
    setExportOptions(false);
    setExporting(true);
    await exportCSV(data, year, month, class_name, section_name);
    setExporting(false);
  };

  const handleXlsxExport = async (from, to, studentId) => {
    setExporting(true);
    const params = { class_id, section_id, from, to };
    if (studentId) params.student_id = studentId;
    const studentSuffix = studentId ? `_${selectedStudent?.first_name}_${selectedStudent?.last_name}` : '';
    await exportFile(
      '/import-export/attendance/export',
      `attendance_${class_name}_${section_name}${studentSuffix}_${from}_to_${to}.xlsx`,
      params,
    );
    setExporting(false);
  };

  // Dynamically import AttendanceExportModal only when needed
  const [XlsxModal, setXlsxModalComp] = useState(null);
  useEffect(() => {
    import('../components/AttendanceExportModal').then(m => setXlsxModalComp(() => m.default));
  }, []);

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Pressable onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>{class_name}  -  {section_name}</Text>
          <Text style={st.headerSub}>Monthly Attendance Report</Text>
        </View>
        <Pressable style={st.exportHeaderBtn} onPress={() => setExportOptions(true)} disabled={exporting}>
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="download-outline" size={15} color="#fff" /><Text style={st.exportHeaderBtnText}>Export</Text></>
          }
        </Pressable>
      </View>

      {/* Filters */}
      <View style={st.filtersRow}>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        <StudentPicker
          students={allStudents}
          selected={selectedStudent}
          onSelect={setSelectedStudent}
        />
      </View>

      {/* Result count */}
      <View style={st.resultRow}>
        <Text style={st.resultCount}>{data.length} student{data.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Summary */}
      {!loading && data.length > 0 && <SummaryBar data={data} />}

      {/* List */}
      {loading
        ? <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        : data.length === 0
          ? (
            <View style={st.empty}>
              <Ionicons name="calendar-outline" size={48} color={C.textLight} />
              <Text style={st.emptyText}>No records for {MONTHS[month - 1]} {year}</Text>
            </View>
          )
          : (
            <FlatList
              data={data}
              keyExtractor={item => String(item.id)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
              renderItem={({ item }) => (
                <StudentCard
                  student={item}
                  year={year}
                  month={month}
                  onPress={() => navigation.navigate('StudentAttendanceDetail', {
                    student:      item,
                    year,
                    month,
                    class_id,
                    section_id,
                    class_name,
                    section_name,
                  })}
                />
              )}
              contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
            />
          )
      }

      {/* Export options modal */}
      <ExportOptionsModal
        visible={exportOptions}
        onClose={() => setExportOptions(false)}
        onCsv={handleCsvExport}
        onXlsx={() => { setExportOptions(false); setXlsxModal(true); }}
        exporting={exporting}
      />

      {/* XLSX date-range modal */}
      {XlsxModal && (
        <XlsxModal
          visible={xlsxModal}
          onClose={() => setXlsxModal(false)}
          onExport={handleXlsxExport}
          students={allStudents}
          initialStudent={selectedStudent}
        />
      )}
    </View>
  );
}

// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const st = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, gap: 10 },
  backBtn:     { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  exportHeaderBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  exportHeaderBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  filtersRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },

  monthBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#BFDBFE' },
  monthBtnText: { flex: 1, color: C.primary, fontWeight: '700', fontSize: 13 },

  studentBtn:     { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: C.border },
  studentBtnText: { flex: 1, color: C.textMed, fontWeight: '600', fontSize: 13 },

  resultRow:    { paddingHorizontal: 16, paddingVertical: 6 },
  resultCount:  { fontSize: 12, color: C.textLight, fontWeight: '600' },

  summaryBar:   { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 4 },
  summaryItem:  { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  studentCard:  { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: C.shadow, shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  cardAvatar:   { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  cardAvatarText:{ color: C.primary, fontSize: 15, fontWeight: '800' },
  cardName:     { fontSize: 14, fontWeight: '700', color: C.textDark },
  cardRoll:     { fontSize: 11, color: C.textLight, marginTop: 1 },
  miniSummary:  { alignItems: 'flex-end', gap: 2 },
  miniCount:    { fontSize: 11, fontWeight: '700' },

  dayScrollView: { borderTopWidth: 1, borderTopColor: C.border },
  dayRow:        { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  dayCell:       { width: 32, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dayCellDay:    { fontSize: 10, fontWeight: '600' },
  dayCellStatus: { fontSize: 12, fontWeight: '800', marginTop: 1 },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:    { fontSize: 16, fontWeight: '700', color: C.textMed, textAlign: 'center', marginTop: 12 },

  // Month picker
  pickerOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  pickerBox:           { backgroundColor: C.card, borderRadius: 22, padding: 22, width: '100%', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  pickerTitle:         { fontSize: 17, fontWeight: '800', color: C.textDark, marginBottom: 14 },
  yearRow:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  yearBtn:             { padding: 8 },
  yearText:            { fontSize: 18, fontWeight: '800', color: C.textDark },
  monthGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  monthCell:           { width: '22%', paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: C.cardAlt },
  monthCellActive:     { backgroundColor: C.primary },
  monthCellText:       { fontSize: 13, fontWeight: '600', color: C.textMed },
  monthCellTextActive: { color: '#fff' },

  // Student picker bottom sheet
  studentRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  studentRowActive: { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 8 },
  studentRowText:   { fontSize: 14, fontWeight: '600', color: C.textDark },
  studentRoll:      { fontSize: 11, color: C.textLight },
  studentAvatar:    { width: 32, height: 32, borderRadius: 9, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  studentAvatarText:{ color: C.primary, fontSize: 12, fontWeight: '800' },
  closePickerBtn:   { marginTop: 14, backgroundColor: C.cardAlt, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  closePickerText:  { color: C.textMed, fontWeight: '700', fontSize: 14 },

  // Export option rows
  exportOptionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  exportOptionLabel: { fontSize: 14, fontWeight: '700', color: C.primary },
  exportOptionSub:   { fontSize: 11, color: C.textLight, marginTop: 2 },
});

