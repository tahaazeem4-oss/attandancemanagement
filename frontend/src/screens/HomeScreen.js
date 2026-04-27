import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Animated, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Image, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { C } from '../config/theme';

const ROLE_CFG = {
  class_teacher:   { label: 'Class Teacher',   emoji: '🏫', bg: '#DCFCE7', color: '#166534' },
  floor_incharge:  { label: 'Floor Incharge',  emoji: '🏢', bg: '#EDE9FE', color: '#5B21B6' },
  subject_teacher: { label: 'Subject Teacher', emoji: '📚', bg: '#FEF9C3', color: '#854D0E' },
};

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function HomeScreen({ navigation }) {
  const { teacher, school, logout } = useAuth();
  const [todayStatus,      setTodayStatus]      = useState(null);
  const [loadingStatus,    setLoadingStatus]    = useState(true);
  const [marking,          setMarking]          = useState(false);
  const [assignments,      setAssignments]      = useState(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  const teacherRole = assignments === null ? null
    : assignments.length === 0 ? 'subject_teacher'
    : assignments.length === 1 ? 'class_teacher'
    : 'floor_incharge';

  // Card entrance animations
  const aY = [useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current];
  const aO = [useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current];
  const sc = [useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current];
  const pulse = useRef(new Animated.Value(1)).current;
  const pi = (i) => () => Animated.spring(sc[i], { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const po = (i) => () => Animated.spring(sc[i], { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  useEffect(() => {
    fetchTodayStatus();
    api.get('/teachers/classes').then(({ data }) => setAssignments(data)).catch(() => setAssignments([]));
    api.get('/teachers/leaves').then(({ data }) => {
      const pendingLeaves     = data.filter(l => l.status === 'pending' && !l.withdrawal_status).length;
      const pendingWithdrawals = data.filter(l => l.withdrawal_status === 'pending').length;
      setPendingLeaveCount(pendingLeaves + pendingWithdrawals);
    }).catch(() => {});
    Animated.stagger(100, aO.map((o, i) =>
      Animated.parallel([
        Animated.timing(o, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.spring(aY[i], { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  const fetchTodayStatus = async () => {
    try {
      const { data } = await api.get('/teachers/attendance/today');
      setTodayStatus(data);
    } catch { setTodayStatus(null); }
    finally { setLoadingStatus(false); }
  };

  const markOwnAttendance = async (status) => {
    setMarking(true);
    try {
      await api.post('/teachers/attendance', { status });
      setTodayStatus({ status });
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not mark attendance');
    } finally { setMarking(false); }
  };

  useEffect(() => {
    if (!todayStatus) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.04, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 1000, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [todayStatus]);

  const statusColor = { present: '#059669', absent: '#DC2626', leave: '#D97706' };
  const statusBg    = { present: '#DCFCE7', absent: '#FEE2E2', leave: '#FEF9C3' };
  const statusIcon  = { present: '✅', absent: '❌', leave: '🟡' };

  const schoolName = school?.name || 'EduTrack';
  const schoolSub  = school?.tagline || 'Attendance Management System';
  const initials   = school?.initials || schoolName.slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1B4B" />

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <LinearGradient
        colors={['#1E1B4B', '#312E81', '#4338CA']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Decorative circles */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={deco.c1} /><View style={deco.c2} /><View style={deco.c3} />
        </View>

        {/* ── Row 1: School info + Sign Out ── */}
        <View style={styles.schoolRow}>
          <View style={styles.schoolLeft}>
            {school?.logo_url
              ? <Image source={{ uri: school.logo_url }} style={styles.schoolLogo} resizeMode="contain" />
              : <View style={styles.schoolLogoFallback}><Text style={styles.schoolLogoText}>{initials}</Text></View>
            }
            <View style={{ flex: 1 }}>
              <Text style={styles.schoolName} numberOfLines={1}>{schoolName}</Text>
              <Text style={styles.schoolSub}  numberOfLines={1}>{schoolSub}</Text>
            </View>
          </View>
          <Pressable onPress={logout} style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.signOutTxt}>Sign Out</Text>
          </Pressable>
        </View>

        {/* Thin divider */}
        <View style={styles.headerDivider} />

        {/* ── Row 2: Teacher info ── */}
        <View style={styles.teacherRow}>
          <View style={styles.teacherAvatar}>
            <Text style={styles.teacherAvatarTxt}>
              {(teacher.first_name?.[0] || '') + (teacher.last_name?.[0] || '')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetTxt}>{greet()} 👋</Text>
            <Text style={styles.teacherName}>{teacher.first_name} {teacher.last_name}</Text>
            <Text style={styles.dateTxt}>{todayLabel}</Text>
          </View>
          {teacherRole && ROLE_CFG[teacherRole] && (
            <View style={[styles.rolePill, { backgroundColor: ROLE_CFG[teacherRole].bg }]}>
              <Text style={styles.roleEmoji}>{ROLE_CFG[teacherRole].emoji}</Text>
              <Text style={[styles.roleTxt, { color: ROLE_CFG[teacherRole].color }]}>
                {ROLE_CFG[teacherRole].label}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ══ YOUR ATTENDANCE TODAY ════════════════════════════════ */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>YOUR ATTENDANCE TODAY</Text>
        <View style={styles.attCard}>
          {loadingStatus ? (
            <ActivityIndicator color={C.primary} />
          ) : todayStatus ? (
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <View style={[styles.markedBadge, { backgroundColor: statusBg[todayStatus.status] }]}>
                <Text style={styles.markedIcon}>{statusIcon[todayStatus.status]}</Text>
                <View>
                  <Text style={[styles.markedStatus, { color: statusColor[todayStatus.status] }]}>
                    {todayStatus.status.toUpperCase()}
                  </Text>
                  <Text style={styles.markedSub}>Marked for today ✓</Text>
                </View>
              </View>
            </Animated.View>
          ) : (
            <>
              <Text style={styles.attPrompt}>Mark your attendance for today</Text>
              <View style={styles.attBtns}>
                {[
                  { s: 'present', label: 'Present', icon: '✅', col: '#059669', bg: '#DCFCE7' },
                  { s: 'absent',  label: 'Absent',  icon: '❌', col: '#DC2626', bg: '#FEE2E2' },
                  { s: 'leave',   label: 'Leave',   icon: '🟡', col: '#D97706', bg: '#FEF9C3' },
                ].map(({ s, label, icon, col, bg }) => (
                  <Pressable
                    key={s}
                    disabled={marking}
                    onPress={() => markOwnAttendance(s)}
                    style={({ pressed }) => [styles.attBtn, { backgroundColor: bg, borderColor: col, opacity: pressed ? 0.8 : 1 }]}
                  >
                    {marking
                      ? <ActivityIndicator color={col} size="small" />
                      : <>
                          <Text style={styles.attBtnIcon}>{icon}</Text>
                          <Text style={[styles.attBtnLabel, { color: col }]}>{label}</Text>
                        </>}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </View>

      {/* ══ QUICK ACTIONS ════════════════════════════════════════ */}
      <Text style={styles.sectionLabel2}>QUICK ACTIONS</Text>

      {[
        {
          i: 0,
          emoji: teacherRole === 'subject_teacher' ? '🔒' : '📋',
          title: 'Mark Student Attendance',
          sub:   teacherRole === 'subject_teacher' ? 'Not available for Subject Teachers' : 'Select class & section to begin',
          grad:  ['#EEF2FF', '#E0E7FF'],
          locked: teacherRole === 'subject_teacher',
          onPress: () => navigation.navigate('ClassSelection'),
        },
        {
          i: 1,
          emoji: teacherRole === 'subject_teacher' ? '🔒' : '📝',
          title: 'Leave Requests',
          sub:   teacherRole === 'subject_teacher' ? 'Not available for Subject Teachers' : 'Review and approve student leaves',
          grad:  ['#FFF1F2', '#FFE4E6'],
          locked: teacherRole === 'subject_teacher',
          badge: pendingLeaveCount,
          onPress: () => navigation.navigate('TeacherLeaves'),
        },
        {
          i: 2,
          emoji: '📊',
          title: 'View & Send Report',
          sub:   'View attendance records by date',
          grad:  ['#FFF7ED', '#FEF3C7'],
          locked: false,
          onPress: () => navigation.navigate('ClassSelection', { mode: 'report' }),
        },
      ].map(({ i, emoji, title, sub, grad, locked, badge, onPress }) => (
        <Animated.View key={i} style={{ opacity: aO[i], transform: [{ translateY: aY[i] }, { scale: sc[i] }] }}>
          {locked ? (
            <View style={[styles.actionCard, styles.actionLocked]}>
              <LinearGradient colors={['#F1F5F9', '#E2E8F0']} style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>🔒</Text>
              </LinearGradient>
              <View style={styles.actionBody}>
                <Text style={[styles.actionTitle, { color: C.textMed }]}>{title}</Text>
                <Text style={styles.actionSub}>{sub}</Text>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.actionCard, pressed && { backgroundColor: '#F5F3FF' }]}
              onPress={onPress}
              onPressIn={pi(i)}
              onPressOut={po(i)}
            >
              <LinearGradient colors={grad} style={styles.actionIcon}>
                <Text style={styles.actionEmoji}>{emoji}</Text>
              </LinearGradient>
              <View style={styles.actionBody}>
                <Text style={styles.actionTitle}>{title}</Text>
                <Text style={styles.actionSub}>{sub}</Text>
              </View>
              {badge > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeTxt}>{badge}</Text>
                </View>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        </Animated.View>
      ))}
    </ScrollView>
  );
}

// ── Decorative blobs ────────────────────────────────────────────
const deco = StyleSheet.create({
  c1: { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -50 },
  c2: { position: 'absolute', width: 100, height: 100, borderRadius: 50,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: 0,  left: 20  },
  c3: { position: 'absolute', width: 60,  height: 60,  borderRadius: 30,  borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', top: 30, right: 120 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4FF' },

  // ── Header ──────────────────────────────────────────────────
  header: {
    paddingTop: 52, paddingBottom: 24,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },

  // School row
  schoolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  schoolLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 10 },
  schoolLogo: { width: 42, height: 42, borderRadius: 10 },
  schoolLogoFallback: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  schoolLogoText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  schoolName: { color: '#E0E7FF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  schoolSub:  { color: 'rgba(165,180,252,0.8)', fontSize: 11, marginTop: 1 },
  signOutBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  signOutTxt: { color: '#C7D2FE', fontSize: 12, fontWeight: '600' },

  // Divider
  headerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 16 },

  // Teacher row
  teacherRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  teacherAvatar: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  teacherAvatarTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  greetTxt:    { color: 'rgba(165,180,252,0.9)', fontSize: 12, fontWeight: '500' },
  teacherName: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 1 },
  dateTxt:     { color: 'rgba(224,231,255,0.5)', fontSize: 11, marginTop: 2 },
  rolePill: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', gap: 3,
  },
  roleEmoji: { fontSize: 16 },
  roleTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Section labels ───────────────────────────────────────────
  section: { marginHorizontal: 16, marginTop: 20 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: C.textMed,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8,
  },
  sectionLabel2: {
    fontSize: 10, fontWeight: '800', color: C.textMed,
    letterSpacing: 1.5, textTransform: 'uppercase',
    marginHorizontal: 16, marginTop: 24, marginBottom: 10,
  },

  // ── Attendance card ──────────────────────────────────────────
  attCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    shadowColor: '#4F46E5', shadowOpacity: 0.08, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  attPrompt: { color: C.textMed, fontSize: 13, marginBottom: 14, fontWeight: '500' },
  attBtns: { flexDirection: 'row', gap: 8 },
  attBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1.5,
  },
  attBtnIcon:  { fontSize: 18, marginBottom: 4 },
  attBtnLabel: { fontSize: 12, fontWeight: '700' },

  // Marked badge
  markedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, padding: 16,
  },
  markedIcon:   { fontSize: 28 },
  markedStatus: { fontSize: 18, fontWeight: '800' },
  markedSub:    { fontSize: 12, color: C.textMed, marginTop: 2 },

  // ── Action cards ─────────────────────────────────────────────
  actionCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#fff', borderRadius: 18,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#4F46E5', shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  actionLocked: { opacity: 0.5 },
  actionIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  actionEmoji: { fontSize: 24 },
  actionBody:  { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: C.textDark },
  actionSub:   { fontSize: 12, color: C.textLight, marginTop: 2 },
  chevron:     { fontSize: 26, color: '#CBD5E1', fontWeight: '300' },
  notifBadge:  { backgroundColor: '#EF4444', borderRadius: 11, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, marginRight: 4 },
  notifBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
