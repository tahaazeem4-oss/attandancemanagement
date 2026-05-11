import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import PickerField from '../../components/PickerField';

export default function OrgAdminSubjectsScreen({ navigation }) {
  const [campuses, setCampuses] = useState([]);
  const [campusId, setCampusId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/org-admin/campuses')
      .then(({ data }) => {
        setCampuses(data);
        if (data.length === 1) setCampusId(String(data[0].id));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!campusId) return;
    setLoading(true);
    api.get('/org-admin/subjects', { params: { campus_id: campusId } })
      .then(({ data }) => setSubjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campusId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return Alert.alert('Validation', 'Enter a subject name.');
    if (!campusId) return Alert.alert('Validation', 'Select a campus first.');
    setSaving(true);
    try {
      await api.post('/org-admin/subjects', { name, campus_id: parseInt(campusId) });
      setNewName('');
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not add subject.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Subject', `Remove "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/org-admin/subjects/${item.id}`);
            setSubjects(prev => prev.filter(s => s.id !== item.id));
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete subject.');
          }
        },
      },
    ]);
  };

  const campusItems = campuses.map(c => ({ label: c.name, value: String(c.id) }));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title="Subjects" navigation={navigation} />

      <View style={styles.pickerWrap}>
        <PickerField
          label=""
          value={campusId}
          onChange={setCampusId}
          items={campusItems}
          placeholder="Select campus to manage subjects"
        />
      </View>

      {campusId ? (
        <>
          {/* Add row */}
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="New subject name…"
              placeholderTextColor="#94A3B8"
              value={newName}
              onChangeText={setNewName}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <TouchableOpacity
              style={[styles.addBtn, saving && { opacity: 0.6 }]}
              onPress={handleAdd}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.addBtnTxt}>Add</Text>}
            </TouchableOpacity>
          </View>

          {loading
            ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
            : <FlatList
                data={subjects}
                keyExtractor={i => String(i.id)}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="book-outline" size={40} color="#CBD5E1" />
                    <Text style={styles.emptyTxt}>No subjects yet</Text>
                    <Text style={styles.emptySub}>Add the first subject above</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.card}>
                    <Ionicons name="book-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                    <Text style={styles.subjectName}>{item.name}</Text>
                    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.delBtn}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}
              />
          }
        </>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="school-outline" size={44} color="#CBD5E1" />
          <Text style={styles.emptyTxt}>Select a campus</Text>
          <Text style={styles.emptySub}>Choose a campus above to manage its subjects</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  pickerWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  addBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  subjectName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.textDark },
  delBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FEF2F2' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTxt: { fontSize: 16, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
  emptySub: { fontSize: 13, color: '#CBD5E1', textAlign: 'center', paddingHorizontal: 32 },
});
