import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, Animated, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Image, StatusBar, RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { C } from '../config/theme';
import DashboardCardGrid from '../components/DashboardCardGrid';
import { buildDashboardCards } from '../config/dashboardCards';
import useAiTutorConfig from '../features/aiTutor/hooks/useAiTutorConfig';

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

const TEACHER_HOME_CARDS = buildDashboardCards([
  { type: 'attendance', key: 'TeacherAttendance' },
  { type: 'leaves', key: 'TeacherLeavesCard' },
  { type: 'attendanceReports', key: 'TeacherAttendanceReports' },
  { type: 'upload', key: 'UploadLectureCard' },
  { type: 'lectures', key: 'LectureListCard' },
  { type: 'students', key: 'TeacherStudentsCard' },
  { type: 'notifications', key: 'SendNotificationCard' },
  { type: 'subjects', key: 'TeacherSubjectsCard' },
  { type: 'aiMaterials', key: 'TeacherAiMaterialsCard' },
]);

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { teacher, school, logout } = useAuth();
  const [todayStatus,      setTodayStatus]      = useState(null);
  const [loadingStatus,    setLoadingStatus]    = useState(true);
  const [marking,          setMarking]          = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assignments,      setAssignments]      = useState(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const { enabled: aiEnabled } = useAiTutorConfig();

  const teacherRole = teacher?.teacher_role || (
    assignments === null
      ? null
      : assignments.length === 0
        ? 'subject_teacher'
        : assignments.length === 1
          ? 'class_teacher'
          : 'floor_incharge'
  );

  const pulse = useRef(new Animated.Value(1)).current;

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
    }).catch(() => setPendingLeaveCount(0));
  }, []);

  // Re-fetch unread count and pending leave count whenever this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      api.get('/teachers/leaves').then(({ data }) => {
        const pendingLeaves      = data.filter(l => l.status === 'pending' && !l.withdrawal_status).length;
        const pendingWithdrawals = data.filter(l => l.withdrawal_status === 'pending').length;
        setPendingLeaveCount(pendingLeaves + pendingWithdrawals);
      }).catch(() => setPendingLeaveCount(0));
    }, [])
  );

  const refreshDashboard = useCallback(async () => {
    await Promise.all([
      fetchTodayStatus(),
      api.get('/teachers/classes').then(({ data }) => setAssignments(data)).catch(() => setAssignments([])),
      api.get('/teachers/leaves').then(({ data }) => {
        const pendingLeaves = data.filter(l => l.status === 'pending' && !l.withdrawal_status).length;
        const pendingWithdrawals = data.filter(l => l.withdrawal_status === 'pending').length;
        setPendingLeaveCount(pendingLeaves + pendingWithdrawals);
      }).catch(() => setPendingLeaveCount(0)),
    ]);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [refreshDashboard]);

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
  const topInset = Math.max(insets.top, statusInset, 0);
  const headerTopMargin = topInset + 12;
  const quickActions = TEACHER_HOME_CARDS
    .filter((card) => !(card.key === 'TeacherAiMaterialsCard' && !aiEnabled))
    .filter((card) => !isLocked || !['TeacherAttendance', 'TeacherLeavesCard', 'TeacherAttendanceReports', 'TeacherStudentsCard'].includes(card.key))
    .map((card) => {
      if (card.key === 'TeacherAttendance') {
        return { ...card, onPress: () => navigation.navigate('ClassSelection') };
      }
      if (card.key === 'TeacherLeavesCard') {
        return { ...card, badge: pendingLeaveCount, onPress: () => navigation.navigate('TeacherLeaves') };
      }
      if (card.key === 'TeacherAttendanceReports') {
        return { ...card, onPress: () => navigation.navigate('ClassSelection', { mode: 'report' }) };
      }
      if (card.key === 'UploadLectureCard') {
        return { ...card, onPress: () => navigation.navigate('UploadLecture') };
      }
      if (card.key === 'LectureListCard') {
        return { ...card, onPress: () => navigation.navigate('LectureList') };
      }
      if (card.key === 'TeacherStudentsCard') {
        return { ...card, onPress: () => navigation.navigate('TeacherStudents') };
      }
      if (card.key === 'SendNotificationCard') {
        return { ...card, onPress: () => navigation.navigate('SendNotification') };
      }
      if (card.key === 'TeacherSubjectsCard') {
        return { ...card, onPress: () => navigation.navigate('TeacherSubjects') };
      }
      if (card.key === 'TeacherAiMaterialsCard') {
        return { ...card, onPress: () => navigation.navigate('TeacherAiMaterials') };
      }
      return card;
    });

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.brandDeep} translucent={false} />

      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { marginTop: headerTopMargin }]}
      >
        <View style={styles.headerDeco} pointerEvents="none" />
        <View style={styles.headerDecoSecondary} pointerEvents="none" />

        <View style={styles.schoolRow}>
          {school?.logo_url
            ? <Image source={{ uri: school.logo_url }} style={styles.schoolLogo} resizeMode="contain" />
            : <View style={styles.schoolLogoFallback}><Text style={styles.schoolLogoText}>{initials}</Text></View>
          }
          <Text style={styles.schoolName} numberOfLines={1}>{schoolName}</Text>
        </View>

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleLabel}>Teacher Command Center</Text>
            <Text style={styles.heroTitle}>Teacher Portal</Text>
            <Text style={styles.heroSub}>Handle attendance, messages, and learning tasks from one place.</Text>
          </View>

          <Pressable onPress={logout} style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="log-out-outline" size={14} color="#DBEAFE" />
            <Text style={styles.signOutTxt}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.metaRow}>
          {teacherRole && ROLE_CFG[teacherRole] && (
            <View style={[styles.rolePill, { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(191,219,254,0.28)' }]}>
              <Text style={styles.roleTxt}>{ROLE_CFG[teacherRole].label}</Text>
            </View>
          )}
          <View style={styles.datePill}>
            <Ionicons name="calendar-outline" size={13} color="#DBEAFE" />
            <Text style={styles.dateTxt} numberOfLines={1}>{todayLabel}</Text>
          </View>
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
      <DashboardCardGrid
        cards={quickActions}
        sectionTitle="Quick Actions"
        preferenceKey={`dashboard:teacher:${teacher?.id || teacher?.email || 'anon'}`}
      />
    </ScrollView>
  );
}



const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 24,
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 18,
    minHeight: 220,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: C.brandDeep,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerDeco: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.08)', top: -68, right: -50 },
  headerDecoSecondary: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(96,165,250,0.12)', left: -48, bottom: -56 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  schoolLogo: { width: 30, height: 30, borderRadius: 9 },
  schoolLogoFallback: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  schoolLogoText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  schoolName: { color: '#DBEAFE', fontSize: 13, fontWeight: '700', flex: 1 },
  roleLabel: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  heroSub: { color: '#DBEAFE', fontSize: 12, marginTop: 4, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.28)',
  },
  dateTxt: { color: '#DBEAFE', fontSize: 11, fontWeight: '700', flexShrink: 1 },

  rolePill: {
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  roleTxt: { color: '#DBEAFE', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(191,219,254,0.45)',
    marginLeft: 10,
  },
  signOutTxt: { color: '#DBEAFE', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },

  section: { marginHorizontal: 16, marginTop: 20 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: C.textMed,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8,
  },
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
  markedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, padding: 16,
  },
  markedIcon:   { fontSize: 28 },
  markedStatus: { fontSize: 18, fontWeight: '800' },
  markedSub:    { fontSize: 12, color: C.textMed, marginTop: 2 },

});
