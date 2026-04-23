import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import api from '../services/api';

const STATUS_COLOR = { present: '#16A34A', absent: '#DC2626', leave: '#D97706', not_marked: '#9CA3AF' };
const STATUS_ICON  = { present: '✅', absent: '❌', leave: '🟡', not_marked: '⬜' };

export default function ReportScreen({ route }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const [records,  setRecords]  = useState([]);
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);

  useEffect(() => {
    fetchReport();
  }, [date]);

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

  const sendToWhatsApp = async () => {
    setSending(true);
    try {
      await api.post('/attendance/send-whatsapp', { class_id, section_id, date });
      Alert.alert('Sent!', 'Attendance report sent to WhatsApp group successfully 📲');
    } catch (err) {
      Alert.alert('Failed', err?.response?.data?.message || 'Could not send to WhatsApp');
    } finally {
      setSending(false);
    }
  };

  const counts = {
    present: records.filter(r => r.status === 'present').length,
    absent:  records.filter(r => r.status === 'absent').length,
    leave:   records.filter(r => r.status === 'leave').length
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{class_name} — Section {section_name}</Text>
        <Text style={styles.headerDate}>📅 {date}</Text>
      </View>

      {/* Summary cards */}
      <View style={styles.summary}>
        {[['present', '✅'], ['absent', '❌'], ['leave', '🟡']].map(([key, icon]) => (
          <View key={key} style={[styles.summaryCard, { borderTopColor: STATUS_COLOR[key] }]}>
            <Text style={styles.summaryIcon}>{icon}</Text>
            <Text style={[styles.summaryNum, { color: STATUS_COLOR[key] }]}>{counts[key]}</Text>
            <Text style={styles.summaryLabel}>{key.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      {/* Student records */}
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color="#2563EB" size="large" />
        : (
          <FlatList
            data={records}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            renderItem={({ item, index }) => (
              <View style={styles.row}>
                <Text style={styles.rowNum}>{index + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.first_name} {item.last_name}</Text>
                  {item.roll_no && <Text style={styles.rowRoll}>Roll #{item.roll_no}</Text>}
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_ICON[item.status]} {item.status.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
            )}
          />
        )}

      {/* Send to WhatsApp */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.waBtn} onPress={sendToWhatsApp} disabled={sending || loading}>
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.waBtnText}>📲 Send to WhatsApp Group</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8FAFC' },
  header:       { backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerDate:   { color: '#BFDBFE', fontSize: 13, marginTop: 2 },
  summary:      {
    flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1,
    borderColor: '#E5E7EB', paddingVertical: 12
  },
  summaryCard:  {
    flex: 1, alignItems: 'center', borderTopWidth: 3, marginHorizontal: 8,
    borderRadius: 8, paddingVertical: 8, backgroundColor: '#F9FAFB'
  },
  summaryIcon:  { fontSize: 20 },
  summaryNum:   { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  row:          {
    backgroundColor: '#fff', borderRadius: 12, marginVertical: 4,
    padding: 12, flexDirection: 'row', alignItems: 'center',
    gap: 10, elevation: 1
  },
  rowNum:       { fontSize: 13, color: '#9CA3AF', width: 24 },
  rowName:      { fontSize: 14, fontWeight: '600', color: '#1E3A5F' },
  rowRoll:      { fontSize: 11, color: '#9CA3AF' },
  statusPill:   { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  footer:       {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E5E7EB'
  },
  waBtn:        { backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  waBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' }
});
