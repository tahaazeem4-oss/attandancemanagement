import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, SectionList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';

export default function NewChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [teachers, setTeachers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null); // id of person being connected to
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      if (mountedRef.current) setLoading(true);
      const [tRes, aRes] = await Promise.allSettled([
        api.get('/chat/teachers'),
        api.get('/chat/admins'),
      ]);
      if (mountedRef.current) {
        setTeachers(tRes.status === 'fulfilled' ? (tRes.value?.data || []) : []);
        setAdmins(aRes.status === 'fulfilled' ? (aRes.value?.data || []) : []);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startChat = async (person, participantType) => {
    const key = `${participantType}-${person.id}`;
    try {
      setStarting(key);
      const { data: conv } = await api.post('/chat/conversations', {
        participant_id: person.id,
        participant_type: participantType,
      });
      // Build a display-ready conversation object
      const enriched = {
        ...conv,
        participant_name: `${person.first_name} ${person.last_name}`,
        participant_role: participantType,
      };
      // Replace NewChat screen with Chat screen
      navigation.replace('Chat', { conversation: enriched });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Unable to start chat right now. Please try again.';
      Alert.alert('Could not open chat', msg);
    } finally {
      setStarting(null);
    }
  };

  const renderPerson = (person, participantType) => {
    const key = `${participantType}-${person.id}`;
    const isStarting = starting === key;
    return (
      <Pressable
        key={String(person.id)}
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        onPress={() => startChat(person, participantType)}
        disabled={!!starting}
      >
        <View style={[styles.avatar, { backgroundColor: participantType === 'admin' ? '#7C3AED' : C.primary }]}>
          <Text style={styles.avatarText}>
            {(person.first_name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{person.first_name} {person.last_name}</Text>
          <Text style={styles.email}>{person.email}</Text>
        </View>
        {isStarting ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={C.textLight} />
        )}
      </Pressable>
    );
  };

  const sections = [
    {
      title: 'Teachers',
      data: teachers,
      type: 'teacher',
      icon: 'school-outline',
    },
    {
      title: 'Admins',
      data: admins,
      type: 'admin',
      icon: 'shield-checkmark-outline',
    },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>New Message</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={64} color={C.textLight} />
          <Text style={styles.emptyTitle}>No contacts available</Text>
          <Text style={styles.emptySubtitle}>
            Teachers and admins will appear here once your children are enrolled in classes.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon} size={18} color={C.primary} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, section }) => renderPerson(item, section.type)}
          stickySectionHeadersEnabled={false}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.textMed, marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: C.textLight, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  list: { paddingBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.primary, marginLeft: 8, letterSpacing: 0.5, textTransform: 'uppercase' },

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
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: C.textDark },
  email: { fontSize: 13, color: C.textMed, marginTop: 2 },
});
