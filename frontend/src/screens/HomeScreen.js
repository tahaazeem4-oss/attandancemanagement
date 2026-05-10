import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, Animated, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Image, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { C } from '../config/theme';

const ROLE_CFG = {
  class_teacher:   { label: 'Class Teacher',   bg: '#EFF6FF', color: '#1D4ED8' },
  floor_incharge:  { label: 'Floor Incharge',  bg: '#F5F3FF', color: '#6D28D9' },
  subject_teacher: { label: 'Subject Teacher', bg: '#FFF7ED', color: '#C2410C' },
};

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
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
  const aY = [useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current, useRef(new Animated.Value(30)).current];
  const aO = [useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current,  useRef(new Animated.Value(0)).current];
  const sc = [useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current,  useRef(new Animated.Value(1)).current];
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

  // Re-fetch unread count and pending leave count whenever this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      api.get('/teachers/leaves').then(({ data }) => {
        const pendingLeaves      = data.filter(l => l.status === 'pending' && !l.withdrawal_status).length;
        const pendingWithdrawals = data.filter(l => l.withdrawal_status === 'pending').length;
        setPendingLeaveCount(pendingLeaves + pendingWithdrawals);
      }).catch(() => {});
    }, [])
  );

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
  const isLocked   = teacherRole === 'subject_teacher';
  const statusInset = StatusBar.currentHeight ?? 0;
  const headerTopPad = Math.max(insets.top, statusInset) + 18;

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" translucent={false} />

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: headerTopPad }]}
      >
        {/* Subtle decorative circle */}
        <View style={styles.headerDeco} pointerEvents="none" />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {/* School logo + name */}
            <View style={styles.schoolRow}>
              {school?.logo_url
                ? <Image source={{ uri: school.logo_url }} style={styles.schoolLogo} resizeMode="contain" />
                : <View style={styles.schoolLogoFallback}><Text style={styles.schoolLogoText}>{initials}</Text></View>
              }
              <Text style={styles.schoolName} numberOfLines={1}>{schoolName}</Text>
            </View>

            {/* Teacher name + greeting */}
            <Text style={styles.greetTxt}>{greet()}, {teacher.first_name} {teacher.last_name}</Text>

            {/* Role badge + date on same line */}
            <View style={styles.metaRow}>
              {teacherRole && ROLE_CFG[teacherRole] && (
                <View style={[styles.rolePill, { backgroundColor: ROLE_CFG[teacherRole].bg }]}>
                  <Text style={[styles.roleTxt, { color: ROLE_CFG[teacherRole].color }]}>
                    {ROLE_CFG[teacherRole].label}
                  </Text>
                </View>
              )}
              <Text style={styles.dateTxt} numberOfLines={1}>{todayLabel}</Text>
            </View>
          </View>

          <Pressable onPress={logout} style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.signOutTxt}>Sign Out</Text>
          </Pressable>
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

      <View style={styles.grid}>
        {[
          {
            i: 0, icon: 'clipboard-outline', label: 'Mark Attendance',
            tint: isLocked ? '#94A3B8' : '#2563EB', bg: isLocked ? '#F1F5F9' : '#EFF6FF',
            locked: isLocked, badge: 0, onPress: () => navigation.navigate('ClassSelection'),
          },
          {
            i: 1, icon: 'mail-open-outline', label: 'Leave Requests',
            tint: isLocked ? '#94A3B8' : '#EF4444', bg: isLocked ? '#F1F5F9' : '#FEF2F2',
            locked: isLocked, badge: pendingLeaveCount, onPress: () => navigation.navigate('TeacherLeaves'),
          },
          {
            i: 2, icon: 'bar-chart-outline', label: 'Attendance Report',
            tint: '#F59E0B', bg: '#FFFBEB',
            locked: false, badge: 0, onPress: () => navigation.navigate('ClassSelection', { mode: 'report' }),
          },
          {
            i: 3, icon: 'cloud-upload-outline', label: 'Upload Lecture',
            tint: '#7C3AED', bg: '#F5F3FF',
            locked: false, badge: 0, onPress: () => navigation.navigate('UploadLecture'),
          },
          {
            i: 4, icon: 'videocam-outline', label: 'Browse Lectures',
            tint: '#10B981', bg: '#ECFDF5',
            locked: false, badge: 0, onPress: () => navigation.navigate('LectureList'),
          },
          {
            i: 5, icon: 'notifications-outline', label: 'Send Notification',
            tint: '#0EA5E9', bg: '#F0F9FF',
            locked: false, badge: 0, onPress: () => navigation.navigate('SendNotification'),
          },
        ].map(({ i, icon, label, tint, bg, locked, badge, onPress }) => (
          <Animated.View key={i} style={[styles.cardWrap, { opacity: aO[i], transform: [{ translateY: aY[i] }, { scale: sc[i] }] }]}>
            <Pressable
              style={({ pressed }) => [styles.navCard, locked && styles.navCardLocked, pressed && !locked && styles.navCardPressed]}
              onPress={locked ? null : onPress}
              disabled={locked}
              onPressIn={!locked ? pi(i) : undefined}
              onPressOut={!locked ? po(i) : undefined}
            >
              <View style={[styles.iconBox, { backgroundColor: bg }]}>
                <Ionicons name={icon} size={24} color={tint} />
              </View>
              <Text style={[styles.navLabel, locked && { color: C.textMed }]}>{label}</Text>
              {badge > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeTxt}>{badge}</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}



const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── Header ──────────────────────────────────────────────
  header: {
    paddingTop: 52, paddingBottom: 24,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  headerDeco: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -70, right: -50 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },

  // School row inside header
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  schoolLogo: { width: 36, height: 36, borderRadius: 8 },
  schoolLogoFallback: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  schoolLogoText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  schoolName: { color: '#BFDBFE', fontSize: 14, fontWeight: '700', flex: 1 },

  // Teacher greeting line — always single line
  greetTxt: {
    color: '#fff', fontSize: 17, fontWeight: '800',
    numberOfLines: 1, flexShrink: 1,
  },

  // Meta row: role pill + date
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  dateTxt: { color: 'rgba(191,219,254,0.65)', fontSize: 11, flexShrink: 1 },

  rolePill: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignItems: 'center',
  },
  roleTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  signOutBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    marginLeft: 10,
  },
  signOutTxt: { color: '#BFDBFE', fontSize: 12, fontWeight: '600' },

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
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    shadowColor: '#94A3B8', shadowOpacity: 0.10, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
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

  // ── Grid ─────────────────────────────────────────────────────────
  grid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12 },
  cardWrap: { width: '30%', flexGrow: 1 },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    position: 'relative',
    height: 110,
    justifyContent: 'center',
  },
  navCardLocked:  { opacity: 0.5 },
  navCardPressed: { opacity: 0.75 },
  iconBox:  { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  navLabel: { color: C.textDark, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  notifBadge:    { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  notifBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
