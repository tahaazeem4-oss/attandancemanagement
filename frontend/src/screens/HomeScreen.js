import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Animated, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Image, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { C } from '../config/theme';
import { HeaderBlobs } from '../components/Deco';

// ── School banner using dynamic branding from AuthContext ──────
function SchoolBanner({ school }) {
  const name     = school?.name     || 'EduTrack';
  const tagline  = school?.tagline  || 'Attendance Management System';
  const initials = school?.initials || name.slice(0, 2).toUpperCase();
  const color1   = school?.primary_color || '#3730A3';
  const color2   = school?.accent_color  || '#6366F1';

  return (
    <LinearGradient
      colors={[color1, color2]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.bannerPlaceholder}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={bb.c1} /><View style={bb.c2} /><View style={bb.c3} />
        <View style={bb.r1} /><View style={bb.r2} />
      </View>
      <View style={styles.bannerOverlay}>
        <View style={styles.bannerLogoRow}>
          {school?.logo_url
            ? <Image source={{ uri: school.logo_url }} style={[styles.schoolBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]} resizeMode="contain" />
            : <View style={[styles.schoolBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}><Text style={styles.schoolBadgeText}>{initials}</Text></View>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{name}</Text>
            <Text style={styles.bannerSub}>{tagline}</Text>
          </View>
        </View>
        <View style={styles.bannerDivider} />
        <Text style={styles.bannerMotto}>🎓  Excellence in Education</Text>
      </View>
    </LinearGradient>
  );
}
const bb = StyleSheet.create({
  c1: { position:'absolute', width:140, height:140, borderRadius:70, backgroundColor:'rgba(255,255,255,0.07)', top:-50, right:-30 },
  c2: { position:'absolute', width:80,  height:80,  borderRadius:40, backgroundColor:'rgba(255,255,255,0.05)', bottom:-20, left:30 },
  c3: { position:'absolute', width:50,  height:50,  borderRadius:25, backgroundColor:'rgba(165,180,252,0.2)', top:20, left:60 },
  r1: { position:'absolute', width:100, height:100, borderRadius:50, borderWidth:1.5, borderColor:'rgba(255,255,255,0.12)', right:60, bottom:-30 },
  r2: { position:'absolute', width:60,  height:60,  borderRadius:30, borderWidth:1, borderColor:'rgba(255,255,255,0.1)', top:5, right:140 },
});

export default function HomeScreen({ navigation }) {
  const { teacher, school, logout } = useAuth();
  const [todayStatus,   setTodayStatus]   = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [marking,       setMarking]       = useState(false);

  // Staggered entrance for the 3 action cards
  const a1o = useRef(new Animated.Value(0)).current, a1y = useRef(new Animated.Value(40)).current;
  const a2o = useRef(new Animated.Value(0)).current, a2y = useRef(new Animated.Value(40)).current;
  const a3o = useRef(new Animated.Value(0)).current, a3y = useRef(new Animated.Value(40)).current;
  // Pulse for status badge
  const pulse = useRef(new Animated.Value(1)).current;

  // Press scale for action cards
  const s1 = useRef(new Animated.Value(1)).current;
  const s2 = useRef(new Animated.Value(1)).current;
  const s3 = useRef(new Animated.Value(1)).current;
  const pi = (s) => () => Animated.spring(s, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const po = (s) => () => Animated.spring(s, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  useEffect(() => {
    fetchTodayStatus();
    // Staggered entrance for action cards (after a short mount delay)
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(a1o, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(a1y,  { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(a2o, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(a2y,  { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(a3o, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(a3y,  { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const fetchTodayStatus = async () => {
    try {
      const { data } = await api.get('/teachers/attendance/today');
      setTodayStatus(data);
    } catch {
      setTodayStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  const markOwnAttendance = async (status) => {
    setMarking(true);
    try {
      await api.post('/teachers/attendance', { status });
      setTodayStatus({ status });
      Alert.alert('Attendance Marked', `Your attendance has been marked as ${status.toUpperCase()}`);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const statusColor = { present: C.present, absent: C.absent, leave: C.leave };
  const statusBg    = { present: C.presentBg, absent: C.absentBg, leave: C.leaveBg };

  // Pulse animation when status is already marked
  useEffect(() => {
    if (!todayStatus) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [todayStatus]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* ── Gradient Header with blobs ─────────────────────── */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <View style={styles.headerLeft}>
          {school?.logo_url
            ? <Image source={{ uri: school.logo_url }} style={styles.schoolLogoImg} resizeMode="contain" />
            : <View style={styles.schoolBadge}><Text style={styles.schoolBadgeText}>{school?.initials || school?.name?.slice(0,2).toUpperCase() || 'ET'}</Text></View>
          }
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Good morning 👋</Text>
            <Text style={styles.name}>{teacher.first_name} {teacher.last_name}</Text>
            <Text style={styles.dateText}>{today}</Text>
          </View>
        </View>
        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </LinearGradient>

      {/* ── Banner ─────────────────────────────────────────── */}
      <SchoolBanner school={school} />

      {/* ── Teacher Attendance Card ─────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={['#EEF2FF', '#E0E7FF']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.cardIconBox}
          >
            <Text style={styles.cardIcon}>📅</Text>
          </LinearGradient>
          <Text style={styles.cardTitle}>Your Attendance Today</Text>
        </View>
        {loadingStatus ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 8 }} />
        ) : todayStatus ? (
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={[styles.statusBadge, { backgroundColor: statusBg[todayStatus.status] }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor[todayStatus.status] }]} />
              <Text style={[styles.statusText, { color: statusColor[todayStatus.status] }]}>
                {todayStatus.status.toUpperCase()}
              </Text>
              <Text style={[styles.statusSub, { color: statusColor[todayStatus.status] }]}>
                ✓ Marked for today
              </Text>
            </View>
          </Animated.View>
        ) : (
          <>
            <Text style={styles.cardSub}>Mark your attendance for today</Text>
            <View style={styles.attBtns}>
              {['present', 'absent', 'leave'].map((s, i) => (
                <Pressable
                  key={s}
                  onPress={() => markOwnAttendance(s)}
                  disabled={marking}
                  style={({ pressed }) => [styles.attBtn, { backgroundColor: statusColor[s], opacity: pressed ? 0.8 : 1 }]}
                >
                  {marking
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.attBtnText}>{s.toUpperCase()}</Text>}
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Quick Actions with staggered animation ─────────── */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      {/* Card 1 */}
      <Animated.View style={{ opacity: a1o, transform: [{ translateY: a1y }, { scale: s1 }] }}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => navigation.navigate('ClassSelection')}
          onPressIn={pi(s1)} onPressOut={po(s1)}
        >
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.actionIconBox}>
            <Text style={styles.actionEmoji}>📋</Text>
          </LinearGradient>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Mark Student Attendance</Text>
            <Text style={styles.actionSub}>Select class & section to begin</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Animated.View>

      {/* Card 2 */}
      <Animated.View style={{ opacity: a2o, transform: [{ translateY: a2y }, { scale: s2 }] }}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => navigation.navigate('AddStudent')}
          onPressIn={pi(s2)} onPressOut={po(s2)}
        >
          <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.actionIconBox}>
            <Text style={styles.actionEmoji}>➕</Text>
          </LinearGradient>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Add New Student</Text>
            <Text style={styles.actionSub}>Register a student in the system</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Animated.View>

      {/* Card 3 */}
      <Animated.View style={{ opacity: a3o, transform: [{ translateY: a3y }, { scale: s3 }] }}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => navigation.navigate('ClassSelection', { mode: 'report' })}
          onPressIn={pi(s3)} onPressOut={po(s3)}
        >
          <LinearGradient colors={['#FFF7ED', '#FEF3C7']} style={styles.actionIconBox}>
            <Text style={styles.actionEmoji}>📊</Text>
          </LinearGradient>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>View & Send Report</Text>
            <Text style={styles.actionSub}>View attendance records by date</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Animated.View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.bg },

  // Header
  header:           {
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 22, overflow: 'hidden',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  headerText:       { flex: 1 },
  greeting:         { color: 'rgba(165,180,252,0.9)', fontSize: 12, letterSpacing: 0.3 },
  name:             { color: '#E0E7FF', fontSize: 18, fontWeight: '800', marginTop: 1 },
  dateText:         { color: 'rgba(224,231,255,0.45)', fontSize: 11, marginTop: 3 },
  logoutBtn:        {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  logoutText:       { color: '#E0E7FF', fontSize: 13, fontWeight: '600' },

  // School Badge (inside banner)
  bannerLogoRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  schoolBadge:      { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  schoolBadgeText:  { color: '#E0E7FF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  schoolLogoImg:    { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)' },

  // Banner
  bannerPlaceholder:{ height: 150, backgroundColor: C.primaryDark, overflow: 'hidden' },
  bannerOverlay:    {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(55,48,163,0.6)',
  },
  bannerTitle:      { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  bannerSub:        { color: '#C7D2FE', fontSize: 12, marginTop: 2 },
  bannerDivider:    { width: 48, height: 2, backgroundColor: C.accent, borderRadius: 2, marginVertical: 10 },
  bannerMotto:      { color: '#E0E7FF', fontSize: 12, fontStyle: 'italic' },

  // Attendance card
  card:             {
    marginHorizontal: 16, marginTop: 18, marginBottom: 4,
    backgroundColor: C.card, borderRadius: 22, padding: 20,
    shadowColor: C.shadow, shadowOpacity: 0.12, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 7,
  },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardIconBox:      {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  cardIcon:         { fontSize: 18 },
  cardTitle:        { fontSize: 16, fontWeight: '700', color: C.textDark },
  cardSub:          { fontSize: 13, color: C.textLight, marginBottom: 14 },
  statusBadge:      { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot:        { width: 10, height: 10, borderRadius: 5 },
  statusText:       { fontSize: 16, fontWeight: '800' },
  statusSub:        { fontSize: 12, fontWeight: '600', marginLeft: 2 },
  attBtns:          { flexDirection: 'row', gap: 8 },
  attBtn:           { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  attBtnText:       { color: '#fff', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },

  // Section title
  sectionTitle:     {
    marginHorizontal: 16, marginTop: 24, marginBottom: 12,
    fontSize: 11, fontWeight: '800', color: C.textMed,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },

  // Action cards
  actionBtn:        {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: C.card, borderRadius: 20,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  actionBtnPressed: { backgroundColor: '#F5F3FF' },
  actionIconBox:    {
    width: 50, height: 50, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
  },
  actionEmoji:      { fontSize: 24 },
  actionText:       { flex: 1 },
  actionTitle:      { fontSize: 15, fontWeight: '700', color: C.textDark },
  actionSub:        { fontSize: 12, color: C.textLight, marginTop: 2 },
  chevron:          { fontSize: 24, color: C.textLight, fontWeight: '200', marginRight: 2 },
});
