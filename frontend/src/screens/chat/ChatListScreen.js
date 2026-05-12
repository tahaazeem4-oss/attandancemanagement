import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';
import { useAuth } from '../../context/AuthContext';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function avatarLetter(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function roleLabel(role) {
  if (role === 'teacher') return 'Teacher';
  if (role === 'admin') return 'Admin';
  if (role === 'parent') return 'Parent';
  return role;
}

export default function ChatListScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isParent = user?.role === 'parent';

  const loadConversations = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const { data } = await api.get('/chat/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations]),
  );

  const openChat = (conv) => {
    navigation.navigate('Chat', { conversation: conv });
  };

  const renderItem = ({ item }) => {
    const hasUnread = item.unread_count > 0;
    const lastMsg = item.last_message_text || 'No messages yet';

    return (
      <Pressable
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        onPress={() => openChat(item)}
      >
        <View style={[styles.avatar, { backgroundColor: item.participant_type === 'admin' ? '#7C3AED' : C.primary }]}>
          <Text style={styles.avatarText}>{avatarLetter(item.participant_name)}</Text>
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.participant_name}
            </Text>
            <Text style={styles.itemTime}>{timeAgo(item.last_message_at)}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text
              style={[styles.itemMsg, hasUnread && styles.itemMsgUnread]}
              numberOfLines={1}
            >
              {lastMsg}
            </Text>
            {hasUnread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.roleChip}>{roleLabel(item.participant_role)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => navigation.navigate(isParent ? 'NewChat' : 'StaffNewChat')}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={conversations.length === 0 && styles.empty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadConversations(true); }}
              colors={[C.primary]}
              tintColor={C.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={64} color={C.textLight} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                {isParent
                  ? 'Tap the compose icon above to message a teacher or admin.'
                  : 'Tap the compose icon above to message a parent.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  newBtn: { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { flexGrow: 1 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.textMed, marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: C.textLight, marginTop: 8, textAlign: 'center' },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemPressed: { backgroundColor: C.cardAlt },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  itemContent: { flex: 1, minWidth: 0 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { fontSize: 16, fontWeight: '600', color: C.textDark, flex: 1, marginRight: 8 },
  itemTime: { fontSize: 12, color: C.textLight },
  itemMsg: { fontSize: 14, color: C.textMed, flex: 1, marginRight: 8 },
  itemMsgUnread: { color: C.textDark, fontWeight: '500' },
  badge: {
    backgroundColor: C.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  roleChip: { fontSize: 12, color: C.textLight, marginTop: 2 },
});
