import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable,
  Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';

export default function AdminSubjectsScreen({ navigation }) {
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (err) {
      const msg = err?.response?.data?.message || '';
      if (err?.response?.status === 503 || msg.toLowerCase().includes('migration')) {
        Alert.alert(
          '⚠️ Database Setup Required',
          'Run the file:\n\nbackend/migrations/add_school_subjects.sql\n\nin your Supabase SQL editor, then restart the backend.',
        );
      } else {
        Alert.alert('Error', 'Could not load subjects');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return Alert.alert('Validation', 'Enter a subject name');
    setSaving(true);
    try {
      const { data } = await api.post('/subjects', { name });
      setSubjects(prev =>
        prev.find(s => s.id === data.id)
          ? prev
          : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName('');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to add subject';
      if (err?.response?.status === 503) {
        Alert.alert(
          '⚠️ Database Setup Required',
          'Run backend/migrations/add_school_subjects.sql in your Supabase SQL editor, then restart the backend.',
        );
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Subject',
      `Remove "${item.name}" from the subject list?\n\nExisting lectures using this subject will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/subjects/${item.id}`);
              setSubjects(prev => prev.filter(s => s.id !== item.id));
            } catch (err) {
              Alert.alert('Error', err?.response?.data?.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader title="Subjects" navigation={navigation} />

      {/* Add new subject row */}}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="New subject name…"
          placeholderTextColor={C.textLight}
          value={newName}
          onChangeText={setNewName}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Pressable
          style={[styles.addBtn, saving && { opacity: 0.6 }]}
          onPress={handleAdd}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.addBtnTxt}>Add</Text>}
        </Pressable>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={C.primary} />
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTxt}>No subjects yet</Text>
              <Text style={styles.emptySub}>Add your first subject above</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardName}>📖  {item.name}</Text>
              <Pressable style={styles.delBtn} onPress={() => handleDelete(item)}>
                <Text style={styles.delTxt}>🗑</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingTop: 52, paddingBottom: 24, paddingHorizontal: 20,
  },
  headerTitle: { color: '#E0E7FF', fontSize: 22, fontWeight: '900' },
  headerSub:   { color: '#A5B4FC', fontSize: 13, marginTop: 4, lineHeight: 18 },

  addRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  input: {
    flex: 1, backgroundColor: C.bg,
    borderWidth: 1.5, borderColor: '#C7D2FE',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: C.text || '#111827',
  },
  addBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  list: { padding: 16, gap: 10 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 15,
    borderWidth: 1, borderColor: '#E5E7EB',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
  },
  cardName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1F2937' },
  delBtn:   { padding: 6 },
  delTxt:   { fontSize: 18 },

  empty:    { alignItems: 'center', marginTop: 60 },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyTxt: { fontSize: 17, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
});
