/**
 * AttendanceExportModal
 * Shows a date-range picker so the user can choose From/To dates,
 * then calls onExport(fromDateStr, toDateStr).
 */
import React, { useState } from 'react';
import {
  Modal, View, Text, Pressable,
  Platform, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C } from '../config/theme';

const fmt = (d) => d.toISOString().slice(0, 10);

export default function AttendanceExportModal({ visible, onClose, onExport }) {
  const today = new Date();

  const [fromDate, setFromDate]         = useState(today);
  const [toDate,   setToDate]           = useState(today);
  const [showFrom, setShowFrom]         = useState(false);
  const [showTo,   setShowTo]           = useState(false);

  const handleFromChange = (_, selected) => {
    setShowFrom(Platform.OS === 'ios'); // keep open on iOS, close on Android
    if (selected) {
      setFromDate(selected);
      // If from > to, push toDate forward
      if (selected > toDate) setToDate(selected);
    }
  };

  const handleToChange = (_, selected) => {
    setShowTo(Platform.OS === 'ios');
    if (selected) setToDate(selected);
  };

  const handleExport = () => {
    onExport(fmt(fromDate), fmt(toDate));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Export Attendance</Text>
          <Text style={styles.sub}>Choose a date range for the Excel report</Text>

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

          {/* Native pickers — rendered inline on iOS, dialog on Android */}
          {showFrom && (
            <DateTimePicker
              value={fromDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={today}
              onChange={handleFromChange}
            />
          )}
          {showTo && (
            <DateTimePicker
              value={toDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={fromDate}
              maximumDate={today}
              onChange={handleToChange}
            />
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
  },
  title: {
    fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4,
  },
  sub: {
    fontSize: 12, color: C.textLight, marginBottom: 18,
  },
  label: {
    fontSize: 12, fontWeight: '700', color: C.textMed,
    marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  datePill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  dateText: {
    fontSize: 15, fontWeight: '700', color: C.primary,
  },
  hint: {
    fontSize: 11, color: C.textLight, marginTop: 14, textAlign: 'center',
  },
  btns: {
    flexDirection: 'row', gap: 10, marginTop: 20,
  },
  cancelBtn: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelTxt: {
    color: C.textMed, fontWeight: '700', fontSize: 14,
  },
  exportBtn: {
    flex: 2, backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  exportTxt: {
    color: '#fff', fontWeight: '700', fontSize: 14,
  },
});
