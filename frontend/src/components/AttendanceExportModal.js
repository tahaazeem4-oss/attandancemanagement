/**
 * AttendanceExportModal
 * Lets user choose date range + optional student filter, then calls
 * onExport(fromDateStr, toDateStr, studentId | null).
 */
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView,
  Platform, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../config/theme';

const fmt = (d) => d.toISOString().slice(0, 10);

export default function AttendanceExportModal({ visible, onClose, onExport, students = [], initialStudent = null }) {
  const today = new Date();

  const [fromDate, setFromDate]             = useState(today);
  const [toDate,   setToDate]               = useState(today);
  const [showFrom, setShowFrom]             = useState(false);
  const [showTo,   setShowTo]               = useState(false);
  const [selStudent, setSelStudent]         = useState(initialStudent);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);

  // Sync with initialStudent whenever modal opens
  useEffect(() => { if (visible) setSelStudent(initialStudent); }, [visible]);

  const handleFromChange = (_, selected) => {
    setShowFrom(Platform.OS === 'ios');
    if (selected) {
      setFromDate(selected);
      if (selected > toDate) setToDate(selected);
    }
  };

  const handleToChange = (_, selected) => {
    setShowTo(Platform.OS === 'ios');
    if (selected) setToDate(selected);
  };

  const handleExport = () => {
    onExport(fmt(fromDate), fmt(toDate), selStudent?.id || null);
    onClose();
  };

  const studentLabel = selStudent
    ? `${selStudent.first_name} ${selStudent.last_name}`
    : 'All Students';

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>Export Attendance</Text>
            <Text style={styles.sub}>Choose date range and optional student filter</Text>

            {/* From Date */}
            <Text style={styles.label}>From Date</Text>
            <Pressable style={styles.datePill} onPress={() => { setShowTo(false); setShowFrom(true); }}>
              <Text style={styles.dateText}>{fmt(fromDate)}</Text>
            </Pressable>

            {/* To Date */}
            <Text style={styles.label}>To Date</Text>
            <Pressable style={styles.datePill} onPress={() => { setShowFrom(false); setShowTo(true); }}>
              <Text style={styles.dateText}>{fmt(toDate)}</Text>
            </Pressable>

            {/* Native pickers */}
            {showFrom && (
              <DateTimePicker
                value={fromDate} mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={today}
                onChange={handleFromChange}
              />
            )}
            {showTo && (
              <DateTimePicker
                value={toDate} mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={fromDate} maximumDate={today}
                onChange={handleToChange}
              />
            )}

            {/* Student filter — only shown when a student list is provided */}
            {students.length > 0 && (
              <>
                <Text style={styles.label}>Student</Text>
                <Pressable
                  style={[styles.datePill, styles.studentPill]}
                  onPress={() => setStudentPickerOpen(true)}
                >
                  <Ionicons name="person-outline" size={15} color={selStudent ? C.primary : C.textMed} />
                  <Text style={[styles.dateText, !selStudent && { color: C.textMed, fontWeight: '600' }]}>
                    {studentLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={13} color={C.textLight} />
                </Pressable>
              </>
            )}

            {/* Hint */}
            <Text style={styles.hint}>
              Max 31 days · P = Present, A = Absent, L = Leave, – = Not Marked
            </Text>

            {/* Buttons */}
            <View style={styles.btns}>
              <Pressable style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.exportBtn} onPress={handleExport}>
                <Text style={styles.exportTxt}>⬇ Export</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Student picker — rendered as a separate bottom-sheet modal */}
      <Modal visible={studentPickerOpen} animationType="slide" transparent onRequestClose={() => setStudentPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>Select Student</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                style={[styles.pickerRow, !selStudent && styles.pickerRowActive]}
                onPress={() => { setSelStudent(null); setStudentPickerOpen(false); }}
              >
                <Text style={[styles.pickerRowText, !selStudent && { color: C.primary, fontWeight: '700' }]}>All Students</Text>
                {!selStudent && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
              </Pressable>
              {students.map(s => {
                const active = selStudent?.id === s.id;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => { setSelStudent(s); setStudentPickerOpen(false); }}
                  >
                    <View style={styles.pickerAvatar}>
                      <Text style={styles.pickerAvatarText}>{s.first_name[0]}{s.last_name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowText, active && { color: C.primary, fontWeight: '700' }]}>
                        {s.first_name} {s.last_name}
                      </Text>
                      {s.roll_no ? <Text style={styles.pickerRoll}>Roll #{s.roll_no}</Text> : null}
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.pickerCloseBtn} onPress={() => setStudentPickerOpen(false)}>
              <Text style={styles.pickerCloseTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 22,
  },
  title: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  sub:   { fontSize: 12, color: C.textLight, marginBottom: 18 },
  label: {
    fontSize: 12, fontWeight: '700', color: C.textMed,
    marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  datePill: {
    backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: C.border,
  },
  studentPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  dateText: { fontSize: 15, fontWeight: '700', color: C.primary, flex: 1 },
  hint: { fontSize: 11, color: C.textLight, marginTop: 14, textAlign: 'center' },
  btns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelTxt: { color: C.textMed, fontWeight: '700', fontSize: 14 },
  exportBtn: {
    flex: 2, backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  exportTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Student picker bottom sheet
  pickerOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerBox:       { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '72%' },
  pickerTitle:     { fontSize: 17, fontWeight: '800', color: C.textDark, marginBottom: 14 },
  pickerRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowActive: { backgroundColor: C.primaryLight, borderRadius: 10, paddingHorizontal: 8 },
  pickerRowText:   { flex: 1, fontSize: 14, fontWeight: '600', color: C.textDark },
  pickerRoll:      { fontSize: 11, color: C.textLight },
  pickerAvatar:    { width: 32, height: 32, borderRadius: 9, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  pickerAvatarText:{ color: C.primary, fontSize: 12, fontWeight: '800' },
  pickerCloseBtn:  { marginTop: 14, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  pickerCloseTxt:  { color: C.textMed, fontWeight: '700', fontSize: 14 },
});
