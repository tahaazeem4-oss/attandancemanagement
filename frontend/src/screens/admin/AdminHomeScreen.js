import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';
import { HeaderBlobs } from '../../components/Deco';

const CARDS = [
  { key: 'AdminTeachers',    icon: '👨‍🏫', label: 'Teachers',     color: ['#4F46E5','#6366F1'] },
  { key: 'AdminStudents',    icon: '🎒', label: 'Students',     color: ['#0891B2','#06B6D4'] },
  { key: 'AdminClasses',     icon: '🏫', label: 'Classes',      color: ['#059669','#10B981'] },
  { key: 'AdminAssignments', icon: '📋', label: 'Assignments',  color: ['#D97706','#F59E0B'] },
  { key: 'AdminLeaves',      icon: '📩', label: 'Leave Requests', color: ['#DC2626','#EF4444'] },
];

export default function AdminHomeScreen({ navigation }) {
  const { user, school, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fadeAnims = useRef(CARDS.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(CARDS.map(() => new Animated.Value(30))).current;

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    Animated.stagger(80, CARDS.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i],  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(slideAnims[i], { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  const StatPill = ({ label, value, color }) => (
    <View style={[styles.statPill, { borderColor: color }]}>
      <Text style={[styles.statNum, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="light-content" backgroundColor="#4C1D95" />

      <LinearGradient colors={['#4C1D95', '#5B21B6', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <HeaderBlobs />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {school && (
              <View style={styles.schoolRow}>
                {school.logo_url
                  ? <Image source={{ uri: school.logo_url }} style={[styles.schoolBadge, { backgroundColor: school.primary_color || '#7C3AED' }]} resizeMode="contain" />
                  : <View style={[styles.schoolBadge, { backgroundColor: school.primary_color || '#7C3AED' }]}><Text style={styles.schoolBadgeText}>{school.initials || school.name.slice(0,2).toUpperCase()}</Text></View>
                }
                <Text style={styles.schoolName} numberOfLines={1}>{school.name}</Text>
              </View>
            )}
            <Text style={styles.greeting}>Admin Panel 🛡️</Text>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        {loading
          ? <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
          : (
            <View style={styles.statsRow}>
              <StatPill label="Teachers" value={stats?.teachers}       color="#A78BFA" />
              <StatPill label="Students" value={stats?.students}       color="#67E8F9" />
              <StatPill label="Classes"  value={stats?.classes}        color="#6EE7B7" />
              <StatPill label="Leaves"   value={stats?.pending_leaves} color="#FCA5A5" />
            </View>
          )}
      </LinearGradient>

      <Text style={styles.sectionTitle}>Management</Text>

      <View style={styles.grid}>
        {CARDS.map((card, i) => (
          <Animated.View key={card.key} style={{ opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }], width: '47%' }}>
            <View style={{ position: 'relative' }}>
              <Pressable
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                onPress={() => navigation.navigate(card.key)}
              >
                <LinearGradient colors={card.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardGrad}>
                  <Text style={styles.cardIcon}>{card.icon}</Text>
                  <Text style={styles.cardLabel}>{card.label}</Text>
                </LinearGradient>
              </Pressable>
              {card.key === 'AdminLeaves' && (stats?.pending_leaves ?? 0) > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeTxt}>{stats.pending_leaves}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  header:          { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 24, overflow: 'hidden' },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  schoolBadge:     { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  schoolBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  schoolName:      { color: '#EDE9FE', fontSize: 14, fontWeight: '700', flex: 1 },
  greeting:        { color: '#C4B5FD', fontSize: 13, fontWeight: '600' },
  name:            { color: '#EDE9FE', fontSize: 20, fontWeight: '800', marginTop: 2 },
  logoutBtn:       { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  logoutText:      { color: '#fff', fontSize: 13, fontWeight: '600' },
  statsRow:        { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  statPill:        { alignItems: 'center', borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  statNum:         { fontSize: 22, fontWeight: '800' },
  statLabel:       { fontSize: 10, color: '#C4B5FD', fontWeight: '600', marginTop: 2 },
  sectionTitle:    { fontSize: 15, fontWeight: '800', color: C.textMed, marginHorizontal: 20, marginTop: 24, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid:            { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12, justifyContent: 'center' },
  card:            { borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  cardGrad:        { paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', minWidth: 140 },
  cardIcon:        { fontSize: 34, marginBottom: 8 },
  cardLabel:       { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  notifBadge:      { position: 'absolute', top: -7, right: -7, backgroundColor: '#EF4444', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#fff', zIndex: 10 },
  notifBadgeTxt:   { color: '#fff', fontSize: 11, fontWeight: '900' },
});
