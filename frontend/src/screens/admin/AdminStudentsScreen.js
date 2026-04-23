import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../../services/api';
import { C, S } from '../../config/theme';

const EMPTY_FORM = { first_name: '', last_name: '', age: '', class_id: '', section_id: '', roll_no: '' };

export default function AdminStudentsScreen() {
  const [students,  setStudents]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [sections,  setSections]  = useState([]);
  const [filter,    setFilter]    = useState({ class_id: '', section_id: '' });
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [pwModal,   setPwModal]   = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [newPw,     setNewPw]     = useState('');
  const [pwTarget,  setPwTarget]  = useState(null);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    api.get('/classes').then(({ data }) => setClasses(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (filter.class_id) {
      api.get(`/classes/${filter.class_id}/sections`).then(({ data }) => setSections(data)).catch(() => {});
    } else { setSections([]); }
  }, [filter.class_id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.class_id)   params.class_id   = filter.class_id;
      if (filter.section_id) params.section_id = filter.section_id;
      const { data } = await api.get('/admin/students', { params });
      setStudents(data);
    } catch { Alert.alert('Error', 'Could not load students'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const [modalSections, setModalSections] = useState([]);
  useEffect(() => {
    if (form.class_id) {
      api.get(`/classes/${form.class_id}/sections`).then(({ data }) => setModalSections(data)).catch(() => {});
    } else setModalSections([]);
  }, [form.class_id]);

  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ first_name: s.first_name, last_name: s.last_name, age: String(s.age), class_id: String(s.class_id), section_id: String(s.section_id), roll_no: s.roll_no || '' });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.age || !form.class_id || !form.section_id)
      return Alert.alert('Validation', 'All fields except roll number are required.');
    setSaving(true);
    try {
      const payload = { ...form, age: parseInt(form.age, 10) };
      if (editing) { await api.put(`/admin/students/${editing.id}`, payload); }
      else          { await api.post('/admin/students', payload); }
      setModal(false); load();
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const handleDelete = (s) => {
    Alert.alert('Delete Student', `Delete ${s.first_name} ${s.last_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/admin/students/${s.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Could not delete'); }
      }},
    ]);
  };

  const handleResetPw = async () => {
    if (!newPw || newPw.length < 6) return Alert.alert('Validation', 'Password must be at least 6 characters.');
    setSaving(true);
    try {
      await api.post(`/admin/students/${pwTarget.id}/reset-password`, { new_password: newPw });
      Alert.alert('Done', 'Password reset successfully'); setPwModal(false); setNewPw('');
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const F = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={filter.class_id} onValueChange={v => setFilter({ class_id: v, section_id: '' })} style={styles.picker}>
            <Picker.Item label="All Classes" value="" />
            {classes.map(c => <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />)}
          </Picker>
        </View>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={filter.section_id} onValueChange={v => setFilter(p => ({ ...p, section_id: v }))} style={styles.picker} enabled={!!filter.class_id}>
            <Picker.Item label="All Sections" value="" />
            {sections.map(s => <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />)}
          </Picker>
        </View>
      </View>

      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={students}
            keyExtractor={s => String(s.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No students found.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
                  <Text style={styles.sub}>{item.class_name} — Sec {item.section_name}{item.roll_no ? `  •  #${item.roll_no}` : ''}</Text>
                  {item.has_account > 0 && <Text style={styles.accountBadge}>Portal account ✓</Text>}
                </View>
                <View style={styles.actions}>
                  <Pressable style={[styles.btn, { backgroundColor: '#EEF2FF' }]} onPress={() => openEdit(item)}>
                    <Text style={[styles.btnText, { color: C.primary }]}>Edit</Text>
                  </Pressable>
                  {item.has_account > 0 && (
                    <Pressable style={[styles.btn, { backgroundColor: '#FFFBEB' }]} onPress={() => { setPwTarget(item); setNewPw(''); setPwModal(true); }}>
                      <Text style={[styles.btnText, { color: '#D97706' }]}>🔑</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.btn, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDelete(item)}>
                    <Text style={[styles.btnText, { color: '#EF4444' }]}>🗑</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}

      <Pressable style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Student</Text>
      </Pressable>

      {/* Add/Edit Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Student' : 'Add Student'}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>First Name *</Text>
                <TextInput style={S.input} placeholder="First Name" value={form.first_name} onChangeText={v => F('first_name', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Last Name *</Text>
                <TextInput style={S.input} placeholder="Last Name" value={form.last_name} onChangeText={v => F('last_name', v)} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Age *</Text>
                <TextInput style={S.input} placeholder="Age" keyboardType="numeric" value={form.age} onChangeText={v => F('age', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Roll No</Text>
                <TextInput style={S.input} placeholder="e.g. G1A-01" value={form.roll_no} onChangeText={v => F('roll_no', v)} />
              </View>
            </View>
            <Text style={S.label}>Class *</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={form.class_id} onValueChange={v => F('class_id', v)} style={styles.picker}>
                <Picker.Item label="Select class…" value="" />
                {classes.map(c => <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />)}
              </Picker>
            </View>
            <Text style={[S.label, { marginTop: 6 }]}>Section *</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={form.section_id} onValueChange={v => F('section_id', v)} style={styles.picker} enabled={!!form.class_id}>
                <Picker.Item label="Select section…" value="" />
                {modalSections.map(s => <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />)}
              </Picker>
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={pwModal} transparent animationType="fade" onRequestClose={() => setPwModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Student Password</Text>
            <Text style={styles.modalSub}>{pwTarget?.first_name} {pwTarget?.last_name} (portal account)</Text>
            <Text style={S.label}>New Password *</Text>
            <TextInput style={S.input} placeholder="Min 6 characters" secureTextEntry value={newPw} onChangeText={setNewPw} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPwModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#D97706' }]} onPress={handleResetPw} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Reset</Text>}
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
  filterBar:   { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  pickerWrap:  { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, overflow: 'hidden', backgroundColor: C.cardAlt },
  picker:      { height: 44 },
  card:        { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  avatar:      { width: 44, height: 44, borderRadius: 13, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:  { color: '#059669', fontWeight: '800', fontSize: 14 },
  name:        { fontSize: 15, fontWeight: '700', color: C.textDark },
  sub:         { fontSize: 12, color: C.textLight, marginTop: 1 },
  accountBadge:{ fontSize: 10, color: '#059669', fontWeight: '700', marginTop: 2 },
  actions:     { flexDirection: 'row', gap: 6 },
  btn:         { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  btnText:     { fontSize: 12, fontWeight: '700' },
  empty:       { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:         { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#059669', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: '#059669', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:  { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  modalSub:    { fontSize: 13, color: C.textMed, marginBottom: 16 },
  row:         { flexDirection: 'row', gap: 10 },
  modalBtns:   { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:    { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:   { backgroundColor: C.border },
  saveBtn:     { backgroundColor: C.primary },
  cancelBtnText:{ color: C.textMed, fontWeight: '700' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
