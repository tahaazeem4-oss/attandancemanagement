import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';

const ACTIONS = [
  { key: 'SuperAdminSchools',  icon: 'business-outline', label: 'Schools',  sub: 'Add, edit and manage schools · assign admins',       tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'SuperAdminTeachers', icon: 'people-outline',   label: 'Teachers', sub: 'Add, edit, delete teachers · reset passwords',        tint: '#10B981', bg: '#ECFDF5' },
  { key: 'SuperAdminStudents', icon: 'school-outline',   label: 'Students', sub: 'Add, edit, delete students · reset portal passwords', tint: '#F59E0B', bg: '#FFFBEB' },
];

export default function SuperAdminHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fadeAnims  = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(ACTIONS.map(() => new Animated.Value(20))).current;

  useEffect(() => {
    api.get('/super-admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    Animated.stagger(80, ACTIONS.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i],  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnims[i], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ])
    )).start();
  }, []);

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
            <View style={styles.superBadge}>
              <Text style={styles.superBadgeText}>SUPER ADMIN</Text>
            </View>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
            <Text style={styles.subtitle}>{user?.email}</Text>
          </View>
          <Pressable onPress={logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          {loading
            ? <ActivityIndicator color="rgba(255,255,255,0.6)" />
            : [
                { label: 'Schools',  value: stats?.schools,  color: '#93C5FD' },
                { label: 'Admins',   value: stats?.admins,   color: '#C4B5FD' },
                { label: 'Teachers', value: stats?.teachers, color: '#6EE7B7' },
                { label: 'Students', value: stats?.students, color: '#FDE68A' },
              ].map(s => (
                <View key={s.label} style={styles.statItem}>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.value ?? '—'}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))
          }
        </View>
      </LinearGradient>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Platform Management</Text>

      <View style={styles.grid}>
        {ACTIONS.map(({ key, icon, label, tint, bg }, i) => (
          <Animated.View
            key={key}
            style={[styles.cardWrap, { opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] }]}
          >
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => navigation.navigate(key)}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header:      { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerDeco:  { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  superBadge:     { alignSelf: 'flex-start', backgroundColor: 'rgba(147,197,253,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(147,197,253,0.4)' },
  superBadgeText: { color: '#93C5FD', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  name:        { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle:    { color: '#BFDBFE', fontSize: 12, marginTop: 2 },
  logoutBtn:   { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText:  { color: '#fff', fontSize: 13, fontWeight: '600' },

  // ── Stats ──
  statsRow:  { flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statItem:  { flex: 1, alignItems: 'center' },
  statNum:   { fontSize: 24, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

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
});
