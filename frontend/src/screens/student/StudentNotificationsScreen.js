import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator,
  Animated, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';

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
  student: '👤 You',
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

export default function StudentNotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [markingAll,    setMarkingAll]     = useState(false);
  const [filter,        setFilter]        = useState('all');
  const [expanded,      setExpanded]      = useState(null); // id of expanded card

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications/me');
      setNotifications(data);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } catch {
      Alert.alert('Error', 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Mark single as read ────────────────────────────────────
  const markRead = async (notif) => {
    if (notif.is_read) return;
    try {
      await api.post(`/notifications/${notif.id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
      );
    } catch {}
  };

  // ── Toggle expand ──────────────────────────────────────────
  const toggleExpand = (notif) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => prev === notif.id ? null : notif.id);
    markRead(notif);
  };

  // ── Mark all as read ───────────────────────────────────────
  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {
      Alert.alert('Error', 'Could not mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  // ── Filtered list ──────────────────────────────────────────
  const visible = filter === 'all'
    ? notifications
    : notifications.filter(n => n.category === filter);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Target display ─────────────────────────────────────────
  const targetText = (n) => {
    if (n.target_type === 'school')  return TARGET_LABEL.school;
    if (n.target_type === 'class')   return `${TARGET_LABEL.class} ${n.class_name || ''}`;
    if (n.target_type === 'section') return `${TARGET_LABEL.section} ${n.class_name} — Sec ${n.section_name}`;
    return TARGET_LABEL.student;
  };

  // ── Render item ────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const meta  = CATEGORY_META[item.category] || CATEGORY_META.general;
    const open  = expanded === item.id;

    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <Pressable
          style={[styles.card, !item.is_read && styles.cardUnread]}
          onPress={() => toggleExpand(item)}
        >
          {/* Unread dot */}
          {!item.is_read && <View style={styles.unreadDot} />}

          <View style={styles.cardMain}>
            {/* Category + time row */}
            <View style={styles.cardMeta}>
              <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
                <Text style={styles.catEmoji}>{meta.emoji}</Text>
                <Text style={[styles.catLabel, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
            </View>

            {/* Title */}
            <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]}>{item.title}</Text>

            {/* Message — collapsed shows 2 lines, expanded shows full */}
            <Text style={styles.notifMsg} numberOfLines={open ? undefined : 2}>{item.message}</Text>

            {/* Expanded extras */}
            {open && (
              <View style={styles.notifExtra}>
                <Text style={styles.notifFrom}>From: {item.sender_name || 'School'}</Text>
                <Text style={styles.notifTarget}>Sent to: {targetText(item)}</Text>
                <Text style={styles.notifDate}>
                  {new Date(item.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            )}

            {/* Expand hint */}
            <Text style={styles.expandHint}>{open ? '▲ collapse' : '▼ read more'}</Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Notifications" navigation={navigation} />

      {/* Mark all read row */}
      {unreadCount > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 13, color: C.textMed, fontWeight: '600' }}>
            {unreadCount} unread
          </Text>
          <Pressable
            style={{ backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            onPress={markAll}
            disabled={markingAll}
          >
            {markingAll
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Mark all read</Text>}
          </Pressable>
        </View>
      )}

      {/* Category filter tabs */}}
      <View style={styles.filterBar}>
        <FlatList
          data={FILTER_CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={i => i}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}
          renderItem={({ item: f }) => {
            const meta = CATEGORY_META[f];
            const active = filter === f;
            return (
              <Pressable
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterTabTxt, active && styles.filterTabTxtActive]}>
                  {f === 'all' ? '📋 All' : `${meta.emoji} ${meta.label}`}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Notification list */}
      {loading
        ? <ActivityIndicator color={C.primary} size="large" style={{ flex: 1, marginTop: 40 }} />
        : (
          <FlatList
            data={visible}
            keyExtractor={n => String(n.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>🔕</Text>
                <Text style={styles.emptyTxt}>No notifications yet</Text>
                <Text style={styles.emptySub}>You're all caught up!</Text>
              </View>
            }
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            onRefresh={load}
            refreshing={loading}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },

  // Header
  header:       { paddingTop: 52, paddingBottom: 16, paddingHorizontal: 20 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:      { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  backTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  titleWrap:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:  { color: '#ECFDF5', fontSize: 20, fontWeight: '900' },
  badge:        { backgroundColor: '#EF4444', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeTxt:     { color: '#fff', fontSize: 11, fontWeight: '900' },
  markAllBtn:   { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  markAllTxt:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Filter bar
  filterBar:    { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  filterTab:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  filterTabActive:  { backgroundColor: C.primaryLight, borderColor: C.primary },
  filterTabTxt:     { fontSize: 12, fontWeight: '600', color: C.textMed },
  filterTabTxtActive: { color: C.primary, fontWeight: '800' },

  // Cards
  card: {
    backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    position: 'relative',
  },
  cardUnread:   { borderLeftWidth: 4, borderLeftColor: C.primary },
  cardMain:     { flex: 1 },
  unreadDot:    { position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },

  cardMeta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  catBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  catEmoji:     { fontSize: 12 },
  catLabel:     { fontSize: 11, fontWeight: '800' },
  timeAgo:      { fontSize: 11, color: C.textLight },

  notifTitle:       { fontSize: 16, fontWeight: '700', color: C.textMed, marginBottom: 4 },
  notifTitleUnread: { color: C.textDark, fontWeight: '900' },
  notifMsg:         { fontSize: 13, color: C.textMed, lineHeight: 20 },

  notifExtra:   { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 4 },
  notifFrom:    { fontSize: 12, color: C.textMed, fontWeight: '600' },
  notifTarget:  { fontSize: 12, color: C.primary, fontWeight: '600' },
  notifDate:    { fontSize: 11, color: C.textLight },

  expandHint:   { fontSize: 11, color: C.primary, marginTop: 8, fontWeight: '700' },

  // Empty
  emptyWrap:  { alignItems: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTxt:   { fontSize: 17, fontWeight: '800', color: C.textMed },
  emptySub:   { fontSize: 13, color: C.textLight, marginTop: 4 },
});
