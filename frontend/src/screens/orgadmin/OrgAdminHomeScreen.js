import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';

const CARDS = [
  { key: 'OrgAdminCampuses',      icon: 'business-outline',      label: 'Campuses',      tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'OrgAdminAdmins',        icon: 'person-circle-outline', label: 'Admins',        tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'OrgAdminTeachers',      icon: 'people-outline',        label: 'Teachers',      tint: '#0EA5E9', bg: '#F0F9FF' },
  { key: 'OrgAdminStudents',      icon: 'school-outline',        label: 'Students',      tint: '#10B981', bg: '#ECFDF5' },
  { key: 'OrgAdminClasses',       icon: 'library-outline',       label: 'Classes',       tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'OrgAdminSubjects',      icon: 'book-outline',          label: 'Subjects',      tint: '#EC4899', bg: '#FDF2F8' },
  { key: 'OrgAdminParents',       icon: 'people-circle-outline', label: 'Parents',       tint: '#06B6D4', bg: '#ECFEFF' },
  { key: 'OrgAdminLeaves',        icon: 'mail-open-outline',     label: 'Leaves',        tint: '#EF4444', bg: '#FEF2F2' },
  { key: 'OrgAdminNotifications', icon: 'notifications-outline', label: 'Notifications', tint: '#8B5CF6', bg: '#F5F3FF' },
];

export default function OrgAdminHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const statusInset = StatusBar.currentHeight ?? 0;
  const headerTopPad = Math.max(insets.top, statusInset) + 18;

  const fadeAnims  = useRef(CARDS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(CARDS.map(() => new Animated.Value(20))).current;

  const fetchStats = useCallback(() => {
    api.get('/org-admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
    Animated.stagger(55, CARDS.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i],  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnims[i], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  useFocusEffect(
    useCallback(() => { fetchStats(); }, [fetchStats])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" translucent={false} />

      {/* ── Header ───────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: headerTopPad }]}
      >
        <View style={styles.headerDeco} pointerEvents="none" />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleLabel}>Organization Admin Panel</Text>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
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
                { label: 'Campuses',  value: stats?.campuses,       color: '#93C5FD' },
                { label: 'Teachers',  value: stats?.teachers,       color: '#6EE7B7' },
                { label: 'Students',  value: stats?.students,       color: '#FDE68A' },
                { label: 'Pending',   value: stats?.pending_leaves, color: '#FCA5A5' },
              ].map(s => (
                <View key={s.label} style={styles.statItem}>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.value ?? '—'}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))
          }
        </View>
      </LinearGradient>

      {/* ── Navigation Grid ──────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Management</Text>

      <View style={styles.grid}>
        {CARDS.map((card, i) => (
          <Animated.View
            key={card.key}
            style={[styles.cardWrap, { opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] }]}
          >
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => navigation.navigate(card.key)}
            >
              <View style={[styles.iconBox, { backgroundColor: card.bg }]}>
                <Ionicons name={card.icon} size={24} color={card.tint} />
              </View>
              <Text style={styles.navLabel}>{card.label}</Text>

              {card.key === 'OrgAdminLeaves' && (stats?.pending_leaves ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{stats.pending_leaves}</Text>
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

  header:        { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerDeco:    { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roleLabel:     { color: '#93C5FD', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  name:          { color: '#fff', fontSize: 22, fontWeight: '800' },
  logoutBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText:    { color: '#fff', fontSize: 13, fontWeight: '600' },

  statsRow:  { flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statItem:  { flex: 1, alignItems: 'center' },
  statNum:   { fontSize: 24, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textLight, marginHorizontal: 20, marginTop: 28, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },

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

  badge:    { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
