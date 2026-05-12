import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { C } from '../../config/theme';

export default function StaffNewChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState(null);

  const load = useCallback(async (q = '') => {
    try {
      setLoading(true);
      const { data } = await api.get(`/chat/parents${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setParents(Array.isArray(data) ? data : []);
    } catch {
      setParents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const startChat = async (parent) => {
    try {
      setStarting(parent.id);
      const { data: conv } = await api.post('/chat/conversations', {
        parent_id: parent.id,
      });
      const enriched = {
        ...conv,
        participant_name: `${parent.first_name} ${parent.last_name}`,
        participant_role: 'parent',
      };
      navigation.replace('Chat', { conversation: enriched });
    } catch {
      // silent — user can retry
    } finally {
      setStarting(null);
    }
  };

  const renderItem = ({ item }) => {
    const isStarting = starting === item.id;
    const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Parent';
    return (
      <Pressable
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        onPress={() => startChat(item)}
        disabled={!!starting}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.sub}>{item.email || (item.phone || '')}</Text>
        </View>
        {isStarting ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={C.textLight} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Message a Parent</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={C.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email…"
          placeholderTextColor={C.textLight}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={C.textLight} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : parents.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={64} color={C.textLight} />
          <Text style={styles.emptyTitle}>
            {search ? 'No parents found' : 'No parents in this school'}
          </Text>
          {!search && (
            <Text style={styles.emptySubtitle}>
              Parents will appear here once they are registered in the system.
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={parents}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { marginRight: 12, padding: 2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: C.textDark },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.textMed, marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: C.textLight, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  list: { paddingBottom: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemPressed: { backgroundColor: C.cardAlt },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#059669',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: C.textDark },
  sub: { fontSize: 13, color: C.textMed, marginTop: 2 },
});
