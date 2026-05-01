import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';
import { HeaderBlobs } from '../../components/Deco';

const STATUS_COLOR = { present: C.present, absent: C.absent, leave: C.leave };
const STATUS_BG    = { present: C.presentBg, absent: C.absentBg, leave: C.leaveBg };

export default function StudentHomeScreen({ navigation }) {
  const { user, school, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const a1o = useRef(new Animated.Value(0)).current, a1y = useRef(new Animated.Value(30)).current;
  const a2o = useRef(new Animated.Value(0)).current, a2y = useRef(new Animated.Value(30)).current;
  const a3o = useRef(new Animated.Value(0)).current, a3y = useRef(new Animated.Value(30)).current;
  const a4o = useRef(new Animated.Value(0)).current, a4y = useRef(new Animated.Value(30)).current;

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const now = new Date();
    api.get('/student-portal/attendance', { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
      .then(({ data }) => setStats(data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get('/notifications/me/unread-count')
      .then(({ data }) => setUnreadCount(data.count || 0))
      .catch(() => {});

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(a1o, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(a1y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(a2o, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(a2y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(a3o, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(a3y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(a4o, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(a4y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const attendancePercent = stats && stats.total > 0
    ? Math.round((stats.present / stats.total) * 100)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="light-content" backgroundColor="#064E3B" />

      <LinearGradient colors={['#064E3B', '#065F46', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <HeaderBlobs />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {school && (
              <View style={styles.schoolRow}>
                {school.logo_url
                  ? <Image source={{ uri: school.logo_url }} style={[styles.schoolBadge, { backgroundColor: school.primary_color || '#047857' }]} resizeMode="contain" />
                  : <View style={[styles.schoolBadge, { backgroundColor: school.primary_color || '#047857' }]}><Text style={styles.schoolBadgeText}>{school.initials || school.name.slice(0,2).toUpperCase()}</Text></View>
                }
                <Text style={styles.schoolName} numberOfLines={1}>{school.name}</Text>
              </View>
            )}
            <Text style={styles.greeting}>Student Portal 🎒</Text>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
            <Text style={styles.meta}>{user?.class_name} — Sec {user?.section_name}  •  #{user?.roll_no}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* This month's attendance summary */}
        {!loading && stats && (
          <View style={styles.monthSummary}>
            <Text style={styles.monthLabel}>This Month</Text>
            <View style={styles.pillRow}>
              {[['present', '✓', stats.present], ['absent', '✗', stats.absent], ['leave', '~', stats.leave]].map(([key, icon, val]) => (
                <View key={key} style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Text style={styles.pillNum}>{val}</Text>
                  <Text style={styles.pillLabel}>{key.toUpperCase()}</Text>
                </View>
              ))}
              {attendancePercent !== null && (
                <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={styles.pillNum}>{attendancePercent}%</Text>
                  <Text style={styles.pillLabel}>RATE</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </LinearGradient>

      <Text style={styles.sectionTitle}>Quick Actions</Text>

      <Animated.View style={{ opacity: a1o, transform: [{ translateY: a1y }] }}>
        <Pressable style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} onPress={() => navigation.navigate('StudentHistory')}>
          <LinearGradient colors={['#1D4ED8', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionGrad}>
            <Text style={styles.actionIcon}>📅</Text>
            <View>
              <Text style={styles.actionTitle}>Attendance History</Text>
              <Text style={styles.actionSub}>View your full attendance record</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ opacity: a2o, transform: [{ translateY: a2y }] }}>
        <Pressable style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} onPress={() => navigation.navigate('StudentLeaves')}>
          <LinearGradient colors={['#B45309', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionGrad}>
            <Text style={styles.actionIcon}>📩</Text>
            <View>
              <Text style={styles.actionTitle}>Leave Applications</Text>
              <Text style={styles.actionSub}>Apply for leave or view status</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ opacity: a3o, transform: [{ translateY: a3y }] }}>
        <Pressable style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} onPress={() => navigation.navigate('StudentLectures')}>
          <LinearGradient colors={['#312E81', '#4338CA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionGrad}>
            <Text style={styles.actionIcon}>📚</Text>
            <View>
              <Text style={styles.actionTitle}>Lectures & Notes</Text>
              <Text style={styles.actionSub}>View classwork, homework & PDFs</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ opacity: a4o, transform: [{ translateY: a4y }] }}>
        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]}
          onPress={() => { setUnreadCount(0); navigation.navigate('StudentNotifications'); }}
        >
          <LinearGradient colors={['#064E3B', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionGrad}>
            <Text style={styles.actionIcon}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Notifications</Text>
              <Text style={styles.actionSub}>School, class & personal notices</Text>
            </View>
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeTxt}>{unreadCount}</Text>
              </View>
            )}
            <Text style={styles.actionArrow}>›</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  schoolBadge:     { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  schoolBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  schoolName:      { color: '#D1FAE5', fontSize: 13, fontWeight: '700', flex: 1 },
  greeting:        { color: '#6EE7B7', fontSize: 13, fontWeight: '600' },
  name:         { color: '#ECFDF5', fontSize: 22, fontWeight: '800', marginTop: 2 },
  meta:         { color: '#A7F3D0', fontSize: 13, marginTop: 4 },
  logoutBtn:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  logoutText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  monthSummary: { marginTop: 20 },
  monthLabel:   { color: '#A7F3D0', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  pillRow:      { flexDirection: 'row', gap: 10 },
  pill:         { alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  pillNum:      { color: '#fff', fontSize: 20, fontWeight: '800' },
  pillLabel:    { color: '#A7F3D0', fontSize: 9, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.textMed, marginHorizontal: 20, marginTop: 24, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionCard:   { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  actionGrad:   { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  actionIcon:   { fontSize: 30 },
  actionTitle:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  actionSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  actionArrow:  { color: '#fff', fontSize: 26, marginLeft: 8, opacity: 0.7 },
  notifBadge:   { backgroundColor: '#EF4444', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginRight: 4 },
  notifBadgeTxt:{ color: '#fff', fontSize: 11, fontWeight: '900' },
});
