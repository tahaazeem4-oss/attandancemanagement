import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator,
  Animated, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from '../components/AppHeader';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CATEGORY_META = {
  general:      { emoji: '📢', label: 'General',      bg: '#F1F5F9', color: '#475569' },
  holiday:      { emoji: '🎉', label: 'Holiday',      bg: '#ECFDF5', color: '#059669' },
  announcement: { emoji: '📣', label: 'Announcement', bg: '#EFF6FF', color: '#2563EB' },
  homework:     { emoji: '📝', label: 'Homework',     bg: '#FFFBEB', color: '#D97706' },
  exam:         { emoji: '📋', label: 'Exam',         bg: '#F5F3FF', color: '#7C3AED' },
  complaint:    { emoji: '⚠️', label: 'Complaint',    bg: '#FEF2F2', color: '#DC2626' },
};

const TARGET_LABEL = {
  school:  '🏫 Whole School',
  class:   '📚',
  section: '👥',
  student: '👤 Student',
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

const FILTER_CATEGORIES = ['all', ...Object.keys(CATEGORY_META)];

export default function StaffNotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [markingAll,    setMarkingAll]     = useState(false);
  const [filter,        setFilter]        = useState('all');
  const [expanded,      setExpanded]      = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications/inbox');
      setNotifications(data);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      // Mark all as read silently so the badge clears on the home screen
      if (data.some(n => !n.is_read)) {
        api.post('/notifications/inbox/read-all').catch(() => {});
        setNotifications(data.map(n => ({ ...n, is_read: true })));
      }
    } catch {
      Alert.alert('Error', 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (notif) => {
    if (notif.is_read) return;
    try {
      await api.post(`/notifications/inbox/${notif.id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
      );
    } catch {}
  };

  const toggleExpand = (notif) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => prev === notif.id ? null : notif.id);
    markRead(notif);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api.post('/notifications/inbox/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {
      Alert.alert('Error', 'Could not mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter(n => n.category === filter);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderItem = ({ item }) => {
    const meta    = CATEGORY_META[item.category] || CATEGORY_META.general;
    const isOpen  = expanded === item.id;

    let targetLabel = TARGET_LABEL[item.target_type] || item.target_type;
    if (item.target_type === 'class'   && item.class_name)   targetLabel += ` ${item.class_name}`;
    if (item.target_type === 'section' && item.class_name)   targetLabel += ` ${item.class_name}${item.section_name ? ' · ' + item.section_name : ''}`;
    if (item.target_type === 'student' && item.st_first)     targetLabel += ` ${item.st_first} ${item.st_last}`;

    return (
      <Pressable
        style={[styles.card, !item.is_read && styles.cardUnread]}
        onPress={() => toggleExpand(item)}
      >
        {/* Unread dot */}
        {!item.is_read && <View style={styles.unreadDot} />}

        {/* Header row */}
        <View style={styles.cardTop}>
          <View style={[styles.categoryChip, { backgroundColor: meta.bg }]}>
            <Text style={[styles.categoryText, { color: meta.color }]}>
              {meta.emoji} {meta.label}
            </Text>
          </View>
          <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]}>
          {item.title}
        </Text>

        {/* Expanded body */}
        {isOpen && (
          <View style={styles.expandedBody}>
            <Text style={styles.notifMessage}>{item.message}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>From: {item.sender_name}</Text>
              <Text style={styles.metaText}>{targetLabel}</Text>
            </View>
          </View>
        )}

        {/* Chevron */}
        <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Notifications" navigation={navigation} />

      {/* Mark all read row */}
      <View style={styles.topBar}>
        <Text style={styles.topBarCount}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up ✓'}
        </Text>
        {unreadCount > 0 && (
          <Pressable onPress={markAll} disabled={markingAll} style={styles.markAllBtn}>
            {markingAll
              ? <ActivityIndicator size="small" color={C.primary} />
              : <Text style={styles.markAllTxt}>Mark all read</Text>}
          </Pressable>
        )}
      </View>

      {/* Category filter chips */}
      <View style={styles.filterWrap}>
        <FlatList
          horizontal
          data={FILTER_CATEGORIES}
          keyExtractor={k => k}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
          renderItem={({ item: cat }) => {
            const active = filter === cat;
            const meta = CATEGORY_META[cat];
            return (
              <Pressable
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(cat)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {meta ? `${meta.emoji} ${meta.label}` : 'All'}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : (
        <Animated.FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          style={{ opacity: fadeAnim }}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border,
  },
  topBarCount: { fontSize: 13, color: C.textMed, fontWeight: '600' },
  markAllBtn:  { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#EFF6FF', borderRadius: 8 },
  markAllTxt:  { color: C.primary, fontWeight: '700', fontSize: 12 },

  filterWrap:  { backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  filterChip:  {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#F1F5F9',
    borderWidth: 1, borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#EFF6FF', borderColor: C.primary },
  filterText:       { fontSize: 12, color: C.textMed, fontWeight: '600' },
  filterTextActive: { color: C.primary },

  card: {
    backgroundColor: C.card, borderRadius: 14, marginBottom: 10,
    padding: 14, position: 'relative',
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardUnread: { borderColor: '#BFDBFE', backgroundColor: '#F8FAFF' },
  unreadDot: {
    position: 'absolute', top: 14, right: 14,
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  categoryChip: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  categoryText: { fontSize: 11, fontWeight: '700' },
  timeText: { fontSize: 11, color: C.textLight },

  notifTitle:       { fontSize: 14, fontWeight: '600', color: C.textDark, paddingRight: 20, marginBottom: 2 },
  notifTitleUnread: { fontWeight: '800' },

  expandedBody: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: C.border },
  notifMessage: { fontSize: 13, color: C.textMed, lineHeight: 20, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 11, color: C.textLight, fontStyle: 'italic' },

  chevron: { position: 'absolute', bottom: 10, right: 14, fontSize: 10, color: C.textLight },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: C.textLight, fontWeight: '600' },
});
