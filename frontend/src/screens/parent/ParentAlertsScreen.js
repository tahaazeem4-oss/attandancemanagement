// frontend/src/screens/parent/ParentAlertsScreen.js
// "School Alerts" landing for a parent — aggregates notifications across every
// linked child via GET /parent/notifications so a parent with more than one
// child can open this directly, without picking a child first.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, LayoutAnimation, Platform, UIManager } from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

export default function ParentAlertsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/parent/notifications');
      setNotifications(data?.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => (prev === id ? null : id));
  };

  return (
    <View style={styles.root}>
      <AppHeader title="School Alerts" eyebrow="All Children" navigation={navigation} />
      {loading ? (
        <ActivityIndicator color={C.primary} size="large" style={{ flex: 1, marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => String(n.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>No school alerts yet.</Text>}
          renderItem={({ item }) => {
            const open = expanded === item.id;
            return (
              <Pressable style={[styles.card, !item.is_read && styles.cardUnread]} onPress={() => toggleExpand(item.id)}>
                <View style={styles.metaRow}>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                  {item.child_names?.length ? (
                    <Text style={styles.childTag}>{item.child_names.join(', ')}</Text>
                  ) : null}
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.message} numberOfLines={open ? undefined : 2}>{item.message}</Text>
                <Text style={styles.hint}>{open ? '▲ collapse' : '▼ read more'}</Text>
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
  empty: { textAlign: 'center', marginTop: 40, color: C.textMed },
  card: {
    backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: C.primary },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  time: { fontSize: 11, color: C.textLight },
  childTag: { fontSize: 11, color: C.primary, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  message: { fontSize: 13, color: C.textMed, lineHeight: 19 },
  hint: { fontSize: 11, color: C.primary, marginTop: 8, fontWeight: '700' },
});
