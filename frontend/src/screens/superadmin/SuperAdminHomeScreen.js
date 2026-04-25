import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';
import { HeaderBlobs } from '../../components/Deco';

export default function SuperAdminHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    api.get('/super-admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
    ]).start();
  }, []);

  const StatCard = ({ label, value, color, icon }) => (
    <View style={[styles.statCard, { borderColor: color }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statNum, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      <LinearGradient
        colors={['#0F172A', '#1E293B', '#334155']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <View style={styles.headerRow}>
          <View>
            <View style={styles.superBadge}>
              <Text style={styles.superBadgeText}>SUPER ADMIN</Text>
            </View>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
            <Text style={styles.subtitle}>{user?.email}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        {loading
          ? <ActivityIndicator color="#94A3B8" style={{ marginTop: 20 }} />
          : (
            <View style={styles.statsRow}>
              <StatCard label="Schools"  value={stats?.schools}  color="#38BDF8" icon="🏫" />
              <StatCard label="Admins"   value={stats?.admins}   color="#A78BFA" icon="🛡️" />
              <StatCard label="Teachers" value={stats?.teachers} color="#34D399" icon="👨‍🏫" />
              <StatCard label="Students" value={stats?.students} color="#FB923C" icon="🎒" />
            </View>
          )}
      </LinearGradient>

      <Text style={styles.sectionTitle}>Platform Management</Text>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.85 }]}
          onPress={() => navigation.navigate('SuperAdminSchools')}
        >
          <LinearGradient
            colors={['#0369A1', '#0284C7', '#0EA5E9']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.navCardGrad}
          >
            <Text style={styles.navCardIcon}>🏫</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.navCardTitle}>Schools</Text>
              <Text style={styles.navCardSub}>Add, edit and manage schools · assign admins</Text>
            </View>
            <Text style={styles.navCardArrow}>›</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  header:         { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  superBadge:     { alignSelf: 'flex-start', backgroundColor: 'rgba(56,189,248,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(56,189,248,0.4)' },
  superBadgeText: { color: '#38BDF8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  name:           { color: '#F1F5F9', fontSize: 22, fontWeight: '800' },
  subtitle:       { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  logoutBtn:      { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  logoutText:     { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  statsRow:       { flexDirection: 'row', gap: 10, marginTop: 24, flexWrap: 'wrap' },
  statCard:       { flex: 1, minWidth: 70, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  statIcon:       { fontSize: 22, marginBottom: 4 },
  statNum:        { fontSize: 22, fontWeight: '800' },
  statLabel:      { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 2 },
  sectionTitle:   { fontSize: 13, fontWeight: '800', color: C.textMed, marginHorizontal: 20, marginTop: 28, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 },
  navCard:        { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  navCardGrad:    { flexDirection: 'row', alignItems: 'center', padding: 22, gap: 16 },
  navCardIcon:    { fontSize: 32 },
  navCardTitle:   { color: '#fff', fontSize: 17, fontWeight: '800' },
  navCardSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 },
  navCardArrow:   { color: '#fff', fontSize: 30, opacity: 0.6, marginLeft: 'auto' },
});
