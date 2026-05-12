import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { C } from '../../config/theme';
import { useAuth } from '../../context/AuthContext';

export default function ParentDashboardScreen({ navigation }) {
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overview, setOverview] = useState({
    totalChildren: 0,
    markedToday: 0,
    presentToday: 0,
    unreadNotifications: 0,
    pendingLeaves: 0,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const topInset = Math.max(insets.top, 0);
  const heroMarginTop = topInset + 6;

  const summarizeChildren = useCallback(async (list) => {
    if (!Array.isArray(list) || list.length === 0) {
      setOverview({
        totalChildren: 0,
        markedToday: 0,
        presentToday: 0,
        unreadNotifications: 0,
        pendingLeaves: 0,
      });
      return;
    }

    setOverviewLoading(true);
    try {
      const summary = {
        totalChildren: list.length,
        markedToday: 0,
        presentToday: 0,
        unreadNotifications: 0,
        pendingLeaves: 0,
      };

      await Promise.all(list.map(async (child) => {
        const id = child.student_id;
        const [attRes, notifRes, leavesRes] = await Promise.allSettled([
          api.get(`/parent/children/${id}/attendance`),
          api.get(`/parent/children/${id}/notifications`),
          api.get(`/parent/children/${id}/leaves`),
        ]);

        if (attRes.status === 'fulfilled') {
          const records = attRes.value?.data?.records || [];
          const todayRecord = records.find((r) => String(r?.date || '').slice(0, 10) === todayIso);
          if (todayRecord) {
            summary.markedToday += 1;
            if (todayRecord.status === 'present') summary.presentToday += 1;
          }
        }

        if (notifRes.status === 'fulfilled') {
          const notifications = notifRes.value?.data?.notifications || [];
          summary.unreadNotifications += notifications.filter((n) => !n?.is_read).length;
        }

        if (leavesRes.status === 'fulfilled') {
          const leaves = leavesRes.value?.data?.leaves || [];
          summary.pendingLeaves += leaves.filter((l) => l?.status === 'pending' || l?.withdrawal_status === 'pending').length;
        }
      }));

      setOverview(summary);
    } catch {
      setOverview((prev) => ({ ...prev, totalChildren: list.length }));
    } finally {
      setOverviewLoading(false);
    }
  }, [todayIso]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/parent/dashboard');
      const list = data.children || [];
      setChildren(list);
      summarizeChildren(list);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      Alert.alert('Error', 'Could not load your children');
    } finally {
      setLoading(false);
    }
  }, [summarizeChildren]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get('/parent/dashboard');
      const list = data.children || [];
      setChildren(list);
      summarizeChildren(list);
    } catch (err) {
      Alert.alert('Error', 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [summarizeChildren]);

  const handleChildPressed = (child) => {
    const selectionToken = Date.now();
    navigation.navigate('ChildStudentPortal', {
      child,
      selectionToken,
      screen: 'HomeTab',
      params: {
        screen: 'StudentHome',
        params: { child, selectionToken },
      },
    });
  };

  const initials = (child) => {
    const first = (child.first_name || '?')[0].toUpperCase();
    const last = (child.last_name || '?')[0].toUpperCase();
    return `${first}${last}`;
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={children}
          keyExtractor={(item) => String(item.student_id)}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.summaryWrap}>
              <LinearGradient
                colors={['#1E3A8A', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.heroCard,
                  {
                    marginTop: heroMarginTop,
                    paddingTop: 20,
                  },
                ]}
              >
                <View style={styles.heroDeco} pointerEvents="none" />
                <Text style={styles.heroEyebrow}>Parent Dashboard</Text>
                <Text style={styles.heroTitle}>Quick Overview</Text>
                <Text style={styles.heroSub}>See today's key updates before opening each child profile.</Text>

                <Pressable
                  onPress={() => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: logout },
                  ])}
                  style={({ pressed }) => [styles.heroSignOutBtn, pressed && { opacity: 0.82 }]}
                >
                  <Ionicons name="log-out-outline" size={14} color="#DBEAFE" />
                  <Text style={styles.heroSignOutText}>Sign Out</Text>
                </Pressable>

                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.totalChildren}</Text>
                    <Text style={styles.summaryItemLabel}>Children</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.markedToday}/{overview.totalChildren || 0}</Text>
                    <Text style={styles.summaryItemLabel}>Marked</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.presentToday}</Text>
                    <Text style={styles.summaryItemLabel}>Present</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.unreadNotifications}</Text>
                    <Text style={styles.summaryItemLabel}>Alerts</Text>
                  </View>
                </View>
              </LinearGradient>

              <View style={styles.pendingRow}>
                <View style={styles.pendingLeft}>
                  <View style={styles.pendingIconWrap}>
                    <Ionicons name="time-outline" size={16} color="#1E40AF" />
                  </View>
                  <Text style={styles.pendingText}>Pending leave actions: {overview.pendingLeaves}</Text>
                </View>
                {overviewLoading ? <ActivityIndicator size="small" color={C.primary} /> : null}
              </View>
              {/* Quick-access shortcut row */}
              <View style={styles.quickRow}>
                <Pressable
                  style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.82 }]}
                  onPress={() => navigation.navigate('ChatList')}
                >
                  <View style={[styles.quickIcon, { backgroundColor: '#2563EB' }]}>
                    <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
                  </View>
                  <Text style={styles.quickLabel}>Messages</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.textLight} />
                </Pressable>
              </View>

              <Text style={styles.childrenHeading}>Children</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👶</Text>
              <Text style={styles.emptyTitle}>No children linked yet</Text>
              <Text style={styles.emptyTxt}>Please ask your school admin to link your children to this account.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              onPress={() => handleChildPressed(item)}
            >
              <View style={styles.iconBox}>
                <Ionicons name="person-outline" size={24} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {item.first_name} {item.last_name}
                </Text>
                <Text style={styles.subtitle}>
                  {item.class_name} • Sec {item.section_name}
                </Text>
                <Text style={styles.meta}>Age {item.age}</Text>
              </View>
              <View style={styles.arrowWrap}>
                <Ionicons name="chevron-forward" size={18} color={C.textLight} />
              </View>
            </Pressable>
          )}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  summaryWrap: { marginBottom: 8 },
  heroCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  heroDeco: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -45,
    top: -55,
  },
  heroEyebrow: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  heroSub: {
    color: '#DBEAFE',
    fontSize: 12,
    marginTop: 4,
  },
  heroSignOutBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.45)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  heroSignOutText: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { color: '#fff', fontSize: 18, fontWeight: '800' },
  summaryItemLabel: { color: '#BFDBFE', fontSize: 10, marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  pendingRow: {
    marginTop: 0,
    marginBottom: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: { color: '#1E3A8A', fontSize: 13, fontWeight: '700' },
  childrenHeading: { fontSize: 12, color: C.textMed, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  quickRow: { marginBottom: 12 },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  quickIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.textDark },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  emptyTxt: { fontSize: 14, color: C.textMed, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    marginVertical: 6,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: C.textDark },
  subtitle: { fontSize: 12, color: C.textMed, marginTop: 1 },
  meta: { fontSize: 11, color: C.textLight, marginTop: 2 },
  arrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
