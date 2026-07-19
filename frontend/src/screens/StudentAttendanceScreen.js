import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, useWindowDimensions,
  StyleSheet, Alert, ActivityIndicator, Animated, RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from '../components/AppHeader';

const STATUS_OPTIONS = ['present', 'absent', 'leave'];
const STATUS_COLOR   = { present: '#10B981', absent: '#EF4444', leave: '#F59E0B' };
const STATUS_BG      = { present: '#ECFDF5', absent: '#FEF2F2', leave: '#FFFBEB' };
const STATUS_BORDER  = { present: '#6EE7B7', absent: '#FCA5A5', leave: '#FCD34D' };
const STATUS_ICON    = { present: 'checkmark',  absent: 'close',  leave: 'calendar-outline' };
const STATUS_LABEL   = { present: 'Present',    absent: 'Absent', leave: 'Leave' };
const STATUS_SHORT_LABEL = { present: 'P', absent: 'A', leave: 'L' };
const STATUS_DARK    = { present: '#059669',    absent: '#DC2626', leave: '#D97706' };

export default function StudentAttendanceScreen({ navigation, route }) {
  const { class_id, section_id, class_name, section_name } = route.params;
  const { width } = useWindowDimensions();
  // Always use the compact chip layout on this screen — the roster list is
  // dense (many rows), so keeping toggles small leaves names room to stay
  // on one line and keeps more of the screen scrollable.
  const compactPhone = width < 480;

  const [students,       setStudents]       = useState([]);
  const [attendance,     setAttendance]     = useState({});
  const [lockedStudents, setLockedStudents] = useState({});
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [frozen,         setFrozen]         = useState(false);
  const [toast,          setToast]          = useState(false); // success toast
  const toastAnim = useRef(new Animated.Value(0)).current;
  const submitS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(submitS, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(submitS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const showToastAndNavigate = () => {
    setToast(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => navigation.navigate('Home'));
  };

  const loadAttendance = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    setLoading(true);
    try {
      const { data } = await api.get('/students', { params: { class_id, section_id } });
      setStudents(data || []);
      const { data: report } = await api.get('/attendance/report', { params: { class_id, section_id, date: today } });
      const locked = {};
      const existing = {};
      let anyNonLockedMarked = false;
      for (const r of (report?.records || [])) {
        if (r.leave_locked) {
          locked[r.id] = true;
          existing[r.id] = 'leave';
        } else if (r.status !== 'not_marked') {
          existing[r.id] = r.status;
          anyNonLockedMarked = true;
        }
      }
      setLockedStudents(locked);
      setAttendance(existing);
      setFrozen(anyNonLockedMarked);
    } catch {
      // keep previous UI state on transient network errors
    } finally {
      setLoading(false);
    }
  }, [class_id, section_id]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAttendance();
    } finally {
      setRefreshing(false);
    }
  }, [loadAttendance]);

  const toggle = (studentId, status) => {
    if (frozen || lockedStudents[studentId]) return;
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  // ── Animated status chip ─────────────────────────────────────
  function StatusChip({ status, selected, onPress }) {
    const scale = useRef(new Animated.Value(1)).current;
    const handlePress = () => {
      Animated.sequence([
        Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 80, bounciness: 0 }),
        Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, speed: 80, bounciness: 12 }),
        Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 50, bounciness: 4 }),
      ]).start();
      onPress();
    };

    const bg     = selected ? STATUS_COLOR[status]   : '#F8FAFC';
    const border = selected ? STATUS_COLOR[status]   : C.border;
    const color  = selected ? '#FFFFFF'              : '#94A3B8';
    const shadow = selected ? STATUS_COLOR[status]   : 'transparent';

    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={handlePress}
          style={[
            styles.chip,
            compactPhone && styles.chipCompact,
            { backgroundColor: bg, borderColor: border, shadowColor: shadow },
          ]}
        >
          <Ionicons name={STATUS_ICON[status]} size={compactPhone ? 12 : 14} color={color} />
          <Text style={[styles.chipText, compactPhone && styles.chipTextCompact, { color }]}>
            {compactPhone ? STATUS_SHORT_LABEL[status] : STATUS_LABEL[status]}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Animated student row ─────────────────────────────────────
  function StudentRow({ item, index }) {
    const isLocked = !!lockedStudents[item.id];
    const status   = attendance[item.id];
    const fadeIn   = useRef(new Animated.Value(0)).current;
    const slideIn  = useRef(new Animated.Value(18)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(fadeIn,  { toValue: 1, duration: 280, delay: index * 40, useNativeDriver: true }),
        Animated.spring(slideIn, { toValue: 0, speed: 18, bounciness: 6, delay: index * 40, useNativeDriver: true }),
      ]).start();
    }, []);

    const rowBg     = status ? STATUS_BG[status]     : C.card;
    const accentClr = status ? STATUS_COLOR[status]  : 'transparent';
    const avatarBg  = status ? STATUS_BG[status]     : '#EFF6FF';
    const avatarTxt = status ? STATUS_DARK[status]   : C.primary;

    return (
      <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideIn }] }}>
        <View style={[styles.studentRow, { backgroundColor: rowBg, borderLeftColor: accentClr }]}>
          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            {status ? (
              <Ionicons name={STATUS_ICON[status]} size={16} color={avatarTxt} />
            ) : (
              <Text style={[styles.avatarText, { color: avatarTxt }]}>
                {item.first_name[0]}{item.last_name[0]}
              </Text>
            )}
          </View>

          {/* Name */}
          <View style={styles.studentInfo}>
            <Text style={styles.studentName} numberOfLines={2} ellipsizeMode="tail">
              {item.first_name} {item.last_name}
            </Text>
            {item.roll_no
              ? <Text style={styles.rollNo}>ID: {item.roll_no}</Text>
              : <Text style={[styles.rollNo, { color: status ? STATUS_COLOR[status] : '#CBD5E1' }]}>
                  {status ? STATUS_LABEL[status] : '— not marked'}
                </Text>}
          </View>

          {/* Buttons or lock badge */}
          {isLocked ? (
            <View style={styles.leaveLockBadge}>
              <Ionicons name="lock-closed" size={12} color="#059669" />
              <Text style={styles.leaveLockText}>On Leave</Text>
            </View>
          ) : (
            <View style={[styles.toggles, compactPhone && styles.togglesCompact]}>
              {STATUS_OPTIONS.map(s => (
                <StatusChip
                  key={s}
                  status={s}
                  selected={status === s}
                  onPress={() => toggle(item.id, s)}
                />
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  const handleSubmit = async () => {
    const nonLocked = students.filter(s => !lockedStudents[s.id]);
    if (nonLocked.length === 0) return Alert.alert('Info', 'All students have approved leave for today.');
    const unmarked = nonLocked.filter(s => !attendance[s.id]);
    if (unmarked.length > 0) return Alert.alert('Incomplete', `${unmarked.length} student(s) not marked yet.`);
    setSaving(true);
    try {
      const records = nonLocked.map(s => ({ student_id: s.id, status: attendance[s.id] }));
      const today   = new Date().toISOString().slice(0, 10);
      await api.post('/attendance/mark', { date: today, records });
      showToastAndNavigate();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const nonLockedStudents = students.filter(s => !lockedStudents[s.id]);
  const unmarkedCount = nonLockedStudents.filter(s => !attendance[s.id]).length;
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
      <AppHeader title="Mark Attendance" navigation={navigation} />

      <View style={styles.infoBar}>
        <View style={styles.infoCopy}>
          <Text style={styles.infoText} numberOfLines={1}>{class_name} — Section {section_name}</Text>
          <Text style={styles.infoEyebrow}>{students.length} students</Text>
        </View>
        <View style={styles.summaryInline}>
          {Object.entries(counts).map(([key, val]) => (
            <View key={key} style={[styles.summaryChip, { backgroundColor: STATUS_BG[key], borderColor: STATUS_BORDER[key] }]}>
              <Ionicons name={STATUS_ICON[key]} size={11} color={STATUS_COLOR[key]} />
              <Text style={[styles.summaryNum, { color: STATUS_DARK[key] }]}>{val}</Text>
            </View>
          ))}
          {unmarkedCount > 0 && (
            <View style={[styles.summaryChip, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
              <Ionicons name="ellipse-outline" size={11} color="#94A3B8" />
              <Text style={[styles.summaryNum, { color: '#94A3B8' }]}>{unmarkedCount}</Text>
            </View>
          )}
        </View>
      </View>

      <FlatList
        data={students}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 94, paddingTop: 6 }}
        renderItem={({ item, index }) => (
          <StudentRow item={item} index={index} />
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

      {/* ── Success Toast ── */}
      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
          <Text style={styles.toastText}>✅  Attendance submitted!</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  list:         { flex: 1 },
  toast:        { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#059669', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, elevation: 10, shadowColor: '#059669', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  toastText:    { color: '#fff', fontSize: 15, fontWeight: '800' },

  infoBar:      {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  infoCopy:     { flex: 1, minWidth: 0 },
  infoEyebrow:  { color: C.textMed, fontSize: 10, fontWeight: '700', marginTop: 1 },
  infoText:     { color: C.textDark, fontSize: 13, fontWeight: '800' },

  summaryInline: { flexDirection: 'row', gap: 5 },
  summaryChip:  {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 4,
  },
  summaryNum:   { fontSize: 12, fontWeight: '800' },

  // ── Student row ────────────────────────────────────────────
  studentRow:   {
    backgroundColor: C.card, borderRadius: 14, marginVertical: 3,
    paddingVertical: 7, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#94A3B8', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
    borderLeftWidth: 3,
  },
  leaveLockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#D1FAE5', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  leaveLockText:  { fontSize: 11, fontWeight: '800', color: '#059669' },
  avatar:       {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginRight: 9,
  },
  avatarText:   { fontWeight: '800', fontSize: 12 },
  studentInfo:  { flex: 1, minWidth: 0, paddingRight: 6 },
  studentName:  { fontSize: 13, fontWeight: '700', color: C.textDark, lineHeight: 16 },
  rollNo:       { fontSize: 10, color: C.textLight, marginTop: 1 },
  toggles:      { flexDirection: 'row', gap: 4 },
  togglesCompact: { gap: 3 },

  // ── Status chips ───────────────────────────────────────────
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1.5,
    shadowOpacity: 0.12, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  chipCompact: { paddingHorizontal: 5, paddingVertical: 4, gap: 2, minWidth: 26, justifyContent: 'center' },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  chipTextCompact: { fontSize: 9, minWidth: 7, textAlign: 'center' },

  footer:       {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14,
    backgroundColor: C.card,
    borderTopWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 }, elevation: 8,
  },
  submitBtn:    {
    borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    shadowColor: C.present, shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  submitText:   { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  frozenBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#CBD5E1', gap: 8,
  },
  frozenIcon:   { fontSize: 18 },
  frozenText:   { color: '#64748B', fontSize: 14, fontWeight: '700' },
});
