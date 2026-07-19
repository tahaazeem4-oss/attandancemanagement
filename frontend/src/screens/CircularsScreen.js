// frontend/src/screens/CircularsScreen.js
// Dedicated "Circulars" list — filters the shared notifications feed down to
// school-notice style entries (category: announcement/general/holiday) and
// opens a real Circular Details screen on tap, instead of dropping the user
// into the full, unfiltered Notifications inbox.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../context/AuthContext';

const CIRCULAR_CATEGORIES = new Set(['announcement', 'general', 'holiday']);

const CATEGORY_META = {
  general:      { emoji: '📢', label: 'General',      color: '#475569' },
  holiday:      { emoji: '🎉', label: 'Holiday',      color: '#059669' },
  announcement: { emoji: '📣', label: 'Announcement', color: '#2563EB' },
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CircularsScreen({ navigation, route }) {
  const { user } = useAuth();
  const childId = route?.params?.child?.student_id;
  const isParentViewing = !!childId;
  const isStaff = !isParentViewing && user?.role && user.role !== 'student';

  const [circulars,  setCirculars]  = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [refreshing,  setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = isParentViewing
        ? await api.get(`/parent/children/${childId}/notifications`).then((res) => ({ data: res.data.notifications || [] }))
        : isStaff
          ? await api.get('/notifications/inbox')
          : await api.get('/notifications/me');
      setCirculars((data || []).filter((n) => CIRCULAR_CATEGORIES.has(n.category)));
    } catch {
      setCirculars([]);
    } finally {
      setLoading(false);
    }
  }, [isStaff, isParentViewing, childId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const openDetail = (item) => navigation.navigate('CircularDetail', { circular: item, isStaff, isParentViewing, childId });

  return (
    <View style={styles.root}>
      <AppHeader title="Circulars" eyebrow="School Notices" navigation={navigation} />
      {loading ? (
        <ActivityIndicator color={C.primary} size="large" style={{ flex: 1, marginTop: 40 }} />
      ) : (
        <FlatList
          data={circulars}
          keyExtractor={(n) => String(n.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTxt}>No circulars yet</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = CATEGORY_META[item.category] || CATEGORY_META.general;
            return (
              <Pressable style={[styles.card, !item.is_read && styles.cardUnread]} onPress={() => openDetail(item)}>
                {!item.is_read && <View style={styles.unreadDot} />}
                <View style={styles.cardMeta}>
                  <Text style={[styles.catLabel, { color: meta.color }]}>{meta.emoji} {meta.label}</Text>
                  <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.preview} numberOfLines={2}>{item.message}</Text>
                <View style={styles.openRow}>
                  <Text style={styles.openTxt}>View details</Text>
                  <Ionicons name="chevron-forward" size={14} color={C.primary} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    position: 'relative',
  },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: C.primary },
  unreadDot: { position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catLabel: { fontSize: 12, fontWeight: '800' },
  timeAgo: { fontSize: 11, color: C.textLight },
  title: { fontSize: 15, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  preview: { fontSize: 13, color: C.textMed, lineHeight: 19 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10 },
  openTxt: { fontSize: 12, color: C.primary, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { fontSize: 15, fontWeight: '700', color: C.textMed },
});
