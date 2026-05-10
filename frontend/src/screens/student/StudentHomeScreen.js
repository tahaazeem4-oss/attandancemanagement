import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, ActivityIndicator, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';

// Action menu items — each navigates to a student sub-screen
const ACTIONS = [
  { key: 'StudentHistory',      icon: 'calendar-outline',      label: 'Attendance History',  sub: 'View your full attendance record',    tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'StudentLeaves',       icon: 'document-text-outline', label: 'Leave Applications',  sub: 'Apply for leave or check status',     tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'StudentClasswork',    icon: 'book-outline',          label: 'Class Work',          sub: 'Browse class work files',             tint: '#4F46E5', bg: '#EEF2FF' },
  { key: 'StudentHomework',     icon: 'clipboard-outline',     label: 'Homework',            sub: 'Browse homework files',               tint: '#D97706', bg: '#FFFBEB' },
];

export default function StudentHomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, school, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvedCampus, setResolvedCampus] = useState(null);

  // Support parent viewing child's portal
  const childData = route?.params?.child;
  const isParentViewing = !!childData;
  const displayUser = childData || user;

  const fadeAnims  = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(ACTIONS.map(() => new Animated.Value(20))).current;

  useEffect(() => {
    const now = new Date();
    const endpoint = isParentViewing
      ? `/parent/children/${childData.student_id}/attendance`
      : '/student-portal/attendance';
    
    api.get(endpoint, { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
      .then(({ data }) => {
        if (data?.stats) {
          setStats(data.stats);
          return;
        }
        const records = data?.records || data?.attendance || [];
        if (!Array.isArray(records)) {
          setStats(null);
          return;
        }
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const leave = records.filter(r => r.status === 'leave').length;
        setStats({ present, absent, leave, total: records.length });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    Animated.stagger(80, ACTIONS.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i],  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnims[i], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ])
    )).start();
  }, [isParentViewing, childData?.student_id]);

  useEffect(() => {
    const schoolId = childData?.school_id || displayUser?.school_id || user?.school_id;
    if (!schoolId) {
      setResolvedCampus(null);
      return;
    }

    let mounted = true;
    api.get('/schools')
      .then(({ data }) => {
        const schools = Array.isArray(data) ? data : [];
        const found = schools.find((s) => Number(s?.id) === Number(schoolId)) || null;
        if (mounted) setResolvedCampus(found);
      })
      .catch(() => {
        if (mounted) setResolvedCampus(null);
      });

    return () => { mounted = false; };
  }, [childData?.school_id, displayUser?.school_id, user?.school_id]);

  const attendancePct = stats && stats.total > 0
    ? Math.round((stats.present / stats.total) * 100)
    : null;
  const topInset = Math.max(insets.top, 0);
  const heroMarginTop = topInset + 6;
  const campusName = school?.name || resolvedCampus?.name || childData?.school_name || user?.school_name || 'Campus';
  const campusLogo = school?.logo_url || resolvedCampus?.logo_url || childData?.school_logo_url || user?.school_logo_url || null;
  const campusInitials = (school?.initials || campusName.slice(0, 2) || 'CP').toUpperCase();

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

      {/* ── Hero Card ──────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[
          styles.header,
          {
            marginTop: heroMarginTop,
            paddingTop: 20,
          },
        ]}
      >
        <View style={styles.headerDeco} pointerEvents="none" />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleLabel}>Student Portal</Text>
            <Text style={styles.name}>{displayUser?.first_name} {displayUser?.last_name}</Text>
            <Text style={styles.meta}>{displayUser?.class_name} · Sec {displayUser?.section_name} · #{displayUser?.roll_no}</Text>
          </View>
          {isParentViewing ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE VIEW</Text>
            </View>
          ) : (
            <Pressable 
              onPress={logout} 
              style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>
          )}
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

      <View style={styles.optionsCampusCard}>
          {campusLogo
            ? <Image source={{ uri: campusLogo }} style={styles.optionsCampusLogo} resizeMode="contain" />
            : <View style={styles.optionsCampusLogoFallback}>
                <Text style={styles.optionsCampusLogoText}>{campusInitials}</Text>
              </View>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.optionsCampusLabel}>Campus</Text>
            <Text style={styles.optionsCampusName} numberOfLines={2}>{campusName}</Text>
          </View>
      </View>

      <View style={styles.grid}>
        {ACTIONS.map(({ key, icon, label, tint, bg }, i) => (
          <Animated.View
            key={key}
            style={[styles.cardWrap, { opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] }]}
          >
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => {
                if (isParentViewing) {
                  navigation.navigate(key, { child: childData });
                } else {
                  navigation.navigate(key);
                }
              }}
            >
              <View style={[styles.iconBox, { backgroundColor: bg }]}>
                <Ionicons name={icon} size={24} color={tint} />
              </View>
              <Text style={styles.navLabel}>{label}</Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header:             {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  headerDeco:         { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -70, right: -50 },
  headerRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roleLabel:          { color: '#93C5FD', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  name:               { color: '#fff', fontSize: 22, fontWeight: '800' },
  meta:               { color: '#BFDBFE', fontSize: 12, marginTop: 4 },
  logoutBtn:          { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText:         { color: '#fff', fontSize: 13, fontWeight: '600' },
  liveBadge:          { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(191,219,254,0.4)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 10 },
  liveText:           { color: '#DBEAFE', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // ── Summary strip ──
  summaryRow:   { flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 24, fontWeight: '800' },
  summaryLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Section ──
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textLight, marginHorizontal: 20, marginTop: 18, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },

  optionsCampusCard:         { marginHorizontal: 14, marginBottom: 12, backgroundColor: '#EFF6FF', borderRadius: 14, borderWidth: 1, borderColor: '#DBEAFE', paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionsCampusLogo:         { width: 40, height: 40, borderRadius: 10 },
  optionsCampusLogoFallback: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#BFDBFE', justifyContent: 'center', alignItems: 'center' },
  optionsCampusLogoText:     { color: '#1E3A8A', fontSize: 12, fontWeight: '900' },
  optionsCampusLabel:        { color: '#2563EB', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  optionsCampusName:         { color: '#1E3A8A', fontSize: 13, fontWeight: '700', marginTop: 2 },

  // ── Grid ──
  grid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, justifyContent: 'space-between', rowGap: 12 },
  cardWrap: { width: '48%' },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    position: 'relative',
    minHeight: 118,
    justifyContent: 'center',
  },
  navCardPressed: { opacity: 0.75 },
  iconBox:  { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  navLabel: { color: C.textDark, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16, minHeight: 32 },

  // ── Badge ──
  badge:    { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
