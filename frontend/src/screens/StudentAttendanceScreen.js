import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C } from '../config/theme';
import { HeaderBlobs } from '../components/Deco';

const STATUS_OPTIONS = ['present', 'absent', 'leave'];
const STATUS_COLOR   = { present: C.present,  absent: C.absent,  leave: C.leave };
const STATUS_BG      = { present: C.presentBg, absent: C.absentBg, leave: C.leaveBg };

export default function StudentAttendanceScreen({ navigation, route }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const [students,   setStudents]   = useState([]);
  const [attendance, setAttendance] = useState({}); // { [student_id]: 'present'|'absent'|'leave' }
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [frozen,     setFrozen]     = useState(false); // true when today's attendance already submitted
  const submitS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(submitS, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(submitS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    api.get('/students', { params: { class_id, section_id } })
      .then(({ data }) => {
        setStudents(data);
        // Default all to 'present'
        const defaults = {};
        data.forEach(s => { defaults[s.id] = 'present'; });
        setAttendance(defaults);
        // Check if attendance already submitted for today
        return api.get('/attendance/report', { params: { class_id, section_id, date: today } })
          .then(({ data: report }) => {
            const alreadyMarked = report.records.length > 0 &&
              report.records.some(r => r.status !== 'not_marked');
            if (alreadyMarked) {
              const existing = {};
              report.records.forEach(r => { existing[r.id] = r.status; });
              setAttendance(existing);
              setFrozen(true);
            }
          })
          .catch(() => {}); // silently ignore check failure
      })
      .catch(() => Alert.alert('Error', 'Could not load students'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (studentId, status) => {
    if (frozen) return;
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
        { text: 'OK', onPress: () => navigation.navigate('Home') }
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

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.headerBg} />

      {/* Class header */}
      <View style={styles.infoBar}>
        <Text style={styles.infoText}>{class_name} — Section {section_name}</Text>
        <Text style={styles.infoSub}>{students.length} students</Text>
      </View>

      {/* Summary pills */}
      <View style={styles.summary}>
        {Object.entries(counts).map(([key, val]) => (
          <View key={key} style={[styles.summaryItem, { backgroundColor: STATUS_BG[key] }]}>
            <Text style={[styles.summaryNum, { color: STATUS_COLOR[key] }]}>{val}</Text>
            <Text style={[styles.summaryLabel, { color: STATUS_COLOR[key] }]}>{key.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      {/* Student list */}
      <FlatList
        data={students}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120, paddingTop: 8 }}
        renderItem={({ item, index }) => (
          <View style={styles.studentRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text>
            </View>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{item.first_name} {item.last_name}</Text>
              {item.roll_no && <Text style={styles.rollNo}>#{item.roll_no}</Text>}
            </View>
            <View style={styles.toggles}>
              {STATUS_OPTIONS.map(s => (
                <Pressable
                  key={s}
                  style={({ pressed }) => [
                    styles.toggleBtn,
                    attendance[item.id] === s
                      ? { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] }
                      : { borderColor: C.border },
                    pressed && { opacity: 0.75 }
                  ]}
                  onPress={() => toggle(item.id, s)}
                >
                  <Text style={[
                    styles.toggleText,
                    { color: attendance[item.id] === s ? '#fff' : C.textMed }
                  ]}>
                    {s === 'present' ? 'P' : s === 'absent' ? 'A' : 'L'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />

      {/* Submit footer */}
      <View style={styles.footer}>
        {frozen ? (
          <View style={styles.frozenBanner}>
            <Text style={styles.frozenIcon}>🔒</Text>
            <Text style={styles.frozenText}>Attendance already submitted for today</Text>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: submitS }] }}>
            <Pressable onPress={handleSubmit} disabled={saving} onPressIn={pIn} onPressOut={pOut}>
              <LinearGradient
                colors={['#10B981', '#059669', '#047857']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>✓  Submit Attendance</Text>}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },

  infoBar:      {
    paddingHorizontal: 20, paddingVertical: 18, overflow: 'hidden',
  },
  infoText:     { color: '#E0E7FF', fontSize: 16, fontWeight: '800' },
  infoSub:      { color: C.headerSub, fontSize: 12, marginTop: 2 },

  summary:      {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderColor: C.border,
  },
  summaryItem:  {
    alignItems: 'center', borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 8, minWidth: 80,
  },
  summaryNum:   { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },

  studentRow:   {
    backgroundColor: C.card, borderRadius: 14, marginVertical: 4,
    paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: C.shadow, shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar:       {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText:   { color: C.primary, fontWeight: '800', fontSize: 13 },
  studentInfo:  { flex: 1 },
  studentName:  { fontSize: 14, fontWeight: '700', color: C.textDark },
  rollNo:       { fontSize: 11, color: C.textLight, marginTop: 1 },
  toggles:      { flexDirection: 'row', gap: 6 },
  toggleBtn:    {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleText:   { fontSize: 12, fontWeight: '800' },

  footer:       {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 24,
    backgroundColor: C.card,
    borderTopWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 }, elevation: 8,
  },
  submitBtn:    {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: C.present, shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  submitText:   { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  frozenBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: '#CBD5E1', gap: 8,
  },
  frozenIcon:   { fontSize: 18 },
  frozenText:   { color: '#64748B', fontSize: 14, fontWeight: '700' },
});
