import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';

// Each card: Ionicons icon + subtle tinted icon box + label
const CARDS = [
  { key: 'AdminTeachers',    icon: 'people-outline',        label: 'Teachers',       tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'AdminStudents',    icon: 'school-outline',        label: 'Students',       tint: '#0EA5E9', bg: '#F0F9FF' },
  { key: 'AdminClasses',     icon: 'library-outline',       label: 'Classes',        tint: '#10B981', bg: '#ECFDF5' },
  { key: 'AdminAssignments', icon: 'clipboard-outline',     label: 'Assignments',    tint: '#F59E0B', bg: '#FFFBEB' },
  { key: 'AdminLeaves',      icon: 'mail-open-outline',     label: 'Leaves',         tint: '#EF4444', bg: '#FEF2F2' },
  { key: 'SendNotification', icon: 'notifications-outline', label: 'Notifications',  tint: '#8B5CF6', bg: '#F5F3FF' },
  { key: 'UploadLecture',      icon: 'cloud-upload-outline',  label: 'Upload',         tint: '#0891B2', bg: '#F0F9FF' },
  { key: 'LectureList',        icon: 'videocam-outline',      label: 'Lectures',       tint: '#2563EB', bg: '#EFF6FF' },
  { key: 'AdminSubjects',      icon: 'book-outline',          label: 'Subjects',       tint: '#7C3AED', bg: '#F5F3FF' },
  { key: 'StaffNotifications', icon: 'notifications',         label: 'My Inbox',       tint: '#8B5CF6', bg: '#F5F3FF' },
];

export default function AdminHomeScreen({ navigation }) {
  const { user, school, logout } = useAuth();
  const [stats,         setStats]        = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [notifUnread,   setNotifUnread]  = useState(0);

  const fadeAnims  = useRef(CARDS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(CARDS.map(() => new Animated.Value(20))).current;

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get('/notifications/inbox/unread-count')
      .then(({ data }) => setNotifUnread(data.count || 0))
      .catch(() => {});

    Animated.stagger(55, CARDS.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i],  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnims[i], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  // Re-fetch unread count when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      api.get('/notifications/inbox/unread-count')
        .then(({ data }) => setNotifUnread(data.count || 0))
        .catch(() => {});
    }, [])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />

      {/* ── Header ──────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Subtle decorative circle */}
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
            <Text style={styles.roleLabel}>Admin Panel</Text>
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
                { label: 'Teachers', value: stats?.teachers,       color: '#93C5FD' },
                { label: 'Students', value: stats?.students,       color: '#6EE7B7' },
                { label: 'Classes',  value: stats?.classes,        color: '#FDE68A' },
                { label: 'Pending',  value: stats?.pending_leaves, color: '#FCA5A5' },
              ].map(s => (
                <View key={s.label} style={styles.statItem}>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.value ?? '—'}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))
          }
        </View>
      </LinearGradient>

      {/* ── Navigation Grid ─────────────────────────────────────── */}
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
              {/* Colored icon container */}
              <View style={[styles.iconBox, { backgroundColor: card.bg }]}>
                <Ionicons name={card.icon} size={24} color={card.tint} />
              </View>
              <Text style={styles.navLabel}>{card.label}</Text>

              {/* Notification badge on Leaves card */}
              {card.key === 'AdminLeaves' && (stats?.pending_leaves ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{stats.pending_leaves}</Text>
                </View>
              )}
              {/* Unread inbox badge */}
              {card.key === 'StaffNotifications' && notifUnread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{notifUnread > 99 ? '99+' : notifUnread}</Text>
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
  container:    { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header:        { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerDeco:    { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  schoolBadge:   { width: 28, height: 28, borderRadius: 8 },
  schoolBadgeFallback: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  schoolBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  schoolName:    { color: '#BFDBFE', fontSize: 13, fontWeight: '600', flex: 1 },
  roleLabel:     { color: '#93C5FD', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  name:          { color: '#fff', fontSize: 22, fontWeight: '800' },
  logoutBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText:    { color: '#fff', fontSize: 13, fontWeight: '600' },

  // ── Stats ──
  statsRow:  { flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statItem:  { flex: 1, alignItems: 'center' },
  statNum:   { fontSize: 24, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Section label ──
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
