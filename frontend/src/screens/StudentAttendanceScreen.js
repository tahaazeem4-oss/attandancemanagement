import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import api from '../services/api';

const STATUS_OPTIONS = ['present', 'absent', 'leave'];
const STATUS_COLOR   = { present: '#16A34A', absent: '#DC2626', leave: '#D97706' };
const STATUS_ICON    = { present: '✅', absent: '❌', leave: '🟡' };

export default function StudentAttendanceScreen({ navigation, route }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const [students,   setStudents]   = useState([]);
  const [attendance, setAttendance] = useState({}); // { [student_id]: 'present'|'absent'|'leave' }
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    api.get('/students', { params: { class_id, section_id } })
      .then(({ data }) => {
        setStudents(data);
        // Default all to 'present'
        const defaults = {};
        data.forEach(s => { defaults[s.id] = 'present'; });
        setAttendance(defaults);
      })
      .catch(() => Alert.alert('Error', 'Could not load students'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (studentId, status) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSubmit = async () => {
    if (students.length === 0) return Alert.alert('No students', 'No students found for this class/section.');
    setSaving(true);
    try {
      const records = students.map(s => ({ student_id: s.id, status: attendance[s.id] || 'present' }));
      const today   = new Date().toISOString().slice(0, 10);
      await api.post('/attendance/mark', { date: today, records });
      Alert.alert('Saved!', 'Attendance has been submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    present: students.filter(s => attendance[s.id] === 'present').length,
    absent:  students.filter(s => attendance[s.id] === 'absent').length,
    leave:   students.filter(s => attendance[s.id] === 'leave').length
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} color="#2563EB" size="large" />;

  return (
    <View style={styles.container}>
      {/* Class info */}
      <View style={styles.infoBar}>
        <Text style={styles.infoText}>{class_name} — Section {section_name}</Text>
        <Text style={styles.infoSub}>{students.length} students</Text>
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        {Object.entries(counts).map(([key, val]) => (
          <View key={key} style={[styles.summaryItem, { borderColor: STATUS_COLOR[key] }]}>
            <Text style={[styles.summaryNum, { color: STATUS_COLOR[key] }]}>{val}</Text>
            <Text style={styles.summaryLabel}>{key}</Text>
          </View>
        ))}
      </View>

      {/* Student list */}
      <FlatList
        data={students}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        renderItem={({ item, index }) => (
          <View style={styles.studentRow}>
            <View style={styles.studentInfo}>
              <Text style={styles.studentNum}>{index + 1}.</Text>
              <View>
                <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
                {item.roll_no && <Text style={styles.rollNo}>Roll #{item.roll_no}</Text>}
              </View>
            </View>
            <View style={styles.toggles}>
              {STATUS_OPTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.toggleBtn,
                    attendance[item.id] === s && { backgroundColor: STATUS_COLOR[s] }
                  ]}
                  onPress={() => toggle(item.id, s)}
                >
                  <Text style={[
                    styles.toggleText,
                    attendance[item.id] === s && { color: '#fff' }
                  ]}>
                    {s === 'present' ? 'P' : s === 'absent' ? 'A' : 'L'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />

      {/* Submit button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>Submit Attendance</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8FAFC' },
  infoBar:      { backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 12 },
  infoText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  infoSub:      { color: '#BFDBFE', fontSize: 12 },
  summary:      { flexDirection: 'row', justifyContent: 'space-around', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#E5E7EB' },
  summaryItem:  { alignItems: 'center', borderWidth: 2, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 6 },
  summaryNum:   { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: '#6B7280', textTransform: 'capitalize' },
  studentRow:   {
    backgroundColor: '#fff', borderRadius: 12, marginVertical: 5,
    padding: 14, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', elevation: 1
  },
  studentInfo:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  studentNum:   { fontSize: 14, color: '#9CA3AF', width: 24 },
  studentName:  { fontSize: 15, fontWeight: '600', color: '#1E3A5F' },
  rollNo:       { fontSize: 11, color: '#9CA3AF' },
  toggles:      { flexDirection: 'row', gap: 6 },
  toggleBtn:    {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1.5,
    borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center'
  },
  toggleText:   { fontSize: 13, fontWeight: '700', color: '#374151' },
  footer:       {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E5E7EB'
  },
  submitBtn:    { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitText:   { color: '#fff', fontSize: 16, fontWeight: '700' }
});
