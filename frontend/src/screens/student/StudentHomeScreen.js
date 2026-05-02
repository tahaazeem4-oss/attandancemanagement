import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';

// Action menu items — each navigates to a student sub-screen
const ACTIONS = [
  { key: 'StudentHistory',      icon: 'calendar-outline',      label: 'Attendance History',  sub: 'View your full attendance record',    tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'StudentLeaves',       icon: 'document-text-outline', label: 'Leave Applications',  sub: 'Apply for leave or check status',     tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'StudentLectures',     icon: 'book-open-outline',     label: 'Lectures & Notes',    sub: 'Browse classwork, homework & PDFs',   tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'StudentNotifications',icon: 'notifications-outline', label: 'Notifications',       sub: 'School, class & personal notices',    tint: '#10B981', bg: '#ECFDF5' },
];

export default function StudentHomeScreen({ navigation }) {
  const { user, school, logout } = useAuth();
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fadeAnims  = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(ACTIONS.map(() => new Animated.Value(20))).current;

  useEffect(() => {
    const now = new Date();
    api.get('/student-portal/attendance', { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
      .then(({ data }) => setStats(data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get('/notifications/me/unread-count')
      .then(({ data }) => setUnreadCount(data.count || 0))
      .catch(() => {});

    Animated.stagger(80, ACTIONS.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i],  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnims[i], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  const attendancePct = stats && stats.total > 0
    ? Math.round((stats.present / stats.total) * 100)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />

      {/* ── Header ──────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDeco} pointerEvents="none" />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {school && (
              <View style={styles.schoolRow}>
                {school.logo_url
                  ? <Image source={{ uri: school.logo_url }} style={styles.schoolBadge} resizeMode="contain" />
                  : <View style={styles.schoolBadgeFallback}>
                      <Text style={styles.schoolBadgeText}>{school.initials || school.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                }
                <Text style={styles.schoolName} numberOfLines={1}>{school.name}</Text>
              </View>
            )}
            <Text style={styles.roleLabel}>Student Portal</Text>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
            <Text style={styles.meta}>{user?.class_name} · Sec {user?.section_name} · #{user?.roll_no}</Text>
          </View>
          <Pressable onPress={logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* ── Attendance summary strip ── */}
        {!loading && stats && (
          <View style={styles.summaryRow}>
            {[
              { label: 'Present', value: stats.present, color: '#6EE7B7' },
              { label: 'Absent',  value: stats.absent,  color: '#FCA5A5' },
              { label: 'Leave',   value: stats.leave,   color: '#FDE68A' },
              ...(attendancePct !== null ? [{ label: 'Rate', value: `${attendancePct}%`, color: '#93C5FD' }] : []),
            ].map(s => (
              <View key={s.label} style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.summaryLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
        {loading && <ActivityIndicator color="rgba(255,255,255,0.5)" style={{ marginTop: 20 }} />}
      </LinearGradient>

      {/* ── Quick Actions ────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      <View style={styles.grid}>
        {ACTIONS.map(({ key, icon, label, tint, bg }, i) => (
          <Animated.View
            key={key}
            style={[styles.cardWrap, { opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] }]}
          >
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => {
                if (key === 'StudentNotifications') setUnreadCount(0);
                navigation.navigate(key);
              }}
            >
              <View style={[styles.iconBox, { backgroundColor: bg }]}>
                <Ionicons name={icon} size={24} color={tint} />
              </View>
              <Text style={styles.navLabel}>{label}</Text>
              {key === 'StudentNotifications' && unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{unreadCount}</Text>
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
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header:             { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerDeco:         { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -70, right: -50 },
  headerRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  schoolBadge:        { width: 28, height: 28, borderRadius: 8 },
  schoolBadgeFallback:{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  schoolBadgeText:    { color: '#fff', fontSize: 10, fontWeight: '800' },
  schoolName:         { color: '#BFDBFE', fontSize: 13, fontWeight: '600', flex: 1 },
  roleLabel:          { color: '#93C5FD', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  name:               { color: '#fff', fontSize: 22, fontWeight: '800' },
  meta:               { color: '#BFDBFE', fontSize: 12, marginTop: 4 },
  logoutBtn:          { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText:         { color: '#fff', fontSize: 13, fontWeight: '600' },

  // ── Summary strip ──
  summaryRow:   { flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 24, fontWeight: '800' },
  summaryLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Section ──
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textLight, marginHorizontal: 20, marginTop: 28, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },

  // ── Grid ──
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
    minHeight: 100,
    justifyContent: 'center',
  },
  navCardPressed: { opacity: 0.75 },
  iconBox:  { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  navLabel: { color: C.textDark, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },

  // ── Badge ──
  badge:    { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
