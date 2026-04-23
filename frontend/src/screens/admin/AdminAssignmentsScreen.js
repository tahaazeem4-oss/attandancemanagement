import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable,
  Modal, StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../../services/api';
import { C, S } from '../../config/theme';

export default function AdminAssignmentsScreen() {
  const [assignments, setAssignments] = useState([]);
  const [teachers,    setTeachers]    = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [sections,    setSections]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [form,        setForm]        = useState({ teacher_id: '', class_id: '', section_id: '' });
  const [saving,      setSaving]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t, c] = await Promise.all([
        api.get('/admin/assignments'),
        api.get('/admin/teachers'),
        api.get('/classes'),
      ]);
      setAssignments(a.data); setTeachers(t.data); setClasses(c.data);
    } catch { Alert.alert('Error', 'Could not load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (form.class_id) {
      api.get(`/classes/${form.class_id}/sections`).then(({ data }) => setSections(data)).catch(() => {});
    } else setSections([]);
  }, [form.class_id]);

  const handleSave = async () => {
    if (!form.teacher_id || !form.class_id || !form.section_id)
      return Alert.alert('Validation', 'All fields are required.');
    setSaving(true);
    try {
      await api.post('/admin/assignments', { teacher_id: Number(form.teacher_id), class_id: Number(form.class_id), section_id: Number(form.section_id) });
      setModal(false); setForm({ teacher_id: '', class_id: '', section_id: '' }); load();
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = (item) => {
    Alert.alert('Remove Assignment', `Remove ${item.teacher_name} from ${item.class_name} — ${item.section_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.delete(`/admin/assignments/${item.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
      }},
    ]);
  };

  const F = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <View style={styles.container}>
      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={assignments}
            keyExtractor={a => String(a.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No assignments yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.icon}><Text style={{ fontSize: 18 }}>📋</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teacherName}>{item.teacher_name}</Text>
                  <Text style={styles.classInfo}>{item.class_name} — Section {item.section_name}</Text>
                </View>
                <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              </View>
            )}
          />
        )}

      <Pressable style={styles.fab} onPress={() => { setForm({ teacher_id: '', class_id: '', section_id: '' }); setModal(true); }}>
        <Text style={styles.fabText}>+ Assign Teacher</Text>
      </Pressable>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign Teacher to Class</Text>
            <Text style={S.label}>Teacher *</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={form.teacher_id} onValueChange={v => F('teacher_id', v)} style={styles.picker}>
                <Picker.Item label="Select teacher…" value="" />
                {teachers.map(t => <Picker.Item key={t.id} label={`${t.first_name} ${t.last_name}`} value={String(t.id)} />)}
              </Picker>
            </View>
            <Text style={[S.label, { marginTop: 8 }]}>Class *</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={form.class_id} onValueChange={v => F('class_id', v)} style={styles.picker}>
                <Picker.Item label="Select class…" value="" />
                {classes.map(c => <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />)}
              </Picker>
            </View>
            <Text style={[S.label, { marginTop: 8 }]}>Section *</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={form.section_id} onValueChange={v => F('section_id', v)} style={styles.picker} enabled={!!form.class_id}>
                <Picker.Item label="Select section…" value="" />
                {sections.map(s => <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />)}
              </Picker>
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(false)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Assign</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  card:        { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  icon:        { width: 40, height: 40, borderRadius: 11, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  teacherName: { fontSize: 14, fontWeight: '700', color: C.textDark },
  classInfo:   { fontSize: 12, color: C.textLight, marginTop: 2 },
  deleteBtn:   { backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  empty:       { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:         { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#D97706', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6 },
  fabText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:  { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 16 },
  pickerWrap:  { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, overflow: 'hidden', backgroundColor: C.cardAlt, marginBottom: 4 },
  picker:      { height: 44 },
  modalBtns:   { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:    { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:   { backgroundColor: C.border },
  saveBtn:     { backgroundColor: '#D97706' },
  cancelText:  { color: C.textMed, fontWeight: '700' },
  saveText:    { color: '#fff', fontWeight: '700' },
});
