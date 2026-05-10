import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import api from '../../services/api';
import { C, S } from '../../config/theme';
import PickerField from '../../components/PickerField';
import ImportExportBar from '../../components/ImportExportBar';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/AppHeader';

const EMPTY_FORM = { first_name: '', last_name: '', age: '', class_id: '', section_id: '', roll_no: '' };

export default function AdminStudentsScreen({ navigation }) {
  const [students,  setStudents]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [sections,  setSections]  = useState([]);
  const [filter,    setFilter]    = useState({ class_id: '', section_id: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [newPw,     setNewPw]     = useState('');
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

  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setNewPw(''); setModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ first_name: s.first_name, last_name: s.last_name, age: String(s.age), class_id: String(s.class_id), section_id: String(s.section_id), roll_no: s.roll_no || '' });
    setNewPw('');
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
      await api.post(`/admin/students/${editing.id}/reset-password`, { new_password: newPw });
      Alert.alert('Done', 'Password reset successfully');
      setNewPw('');
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const F = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedClassObj = classes.find(c => String(c.id) === String(filter.class_id));
  const selectedSectionObj = sections.find(s => String(s.id) === String(filter.section_id));

  return (
    <View style={styles.container}>
      <AppHeader title="Students" navigation={navigation} />
      <ImportExportBar
        templatePath="/import-export/students/template"
        templateFilename="students_template.xlsx"
        importPath="/import-export/students/import"
        exportPath="/import-export/students/export"
        exportFilename="students_export.xlsx"
        onImportDone={load}
      />
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <View style={styles.filterHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.filterTitle}>Student Filters</Text>
            <Text style={styles.filterSubTitle}>
              {selectedClassObj?.class_name || 'All Classes'}
              {selectedSectionObj ? `  •  Section ${selectedSectionObj.section_name}` : '  •  All Sections'}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.filterToggleBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setFiltersOpen(v => !v)}
          >
            <Text style={styles.filterToggleTxt}>{filtersOpen ? 'Hide' : 'Filters'}</Text>
          </Pressable>
        </View>

        {filtersOpen && (
          <View style={styles.filterPanel}>
            <Text style={styles.fieldLabel}>Class</Text>
            <PickerField
              label="Class"
              value={filter.class_id}
              onChange={v => setFilter({ class_id: v, section_id: '' })}
              placeholder="All Classes"
              items={[{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))]}
            />

            <Text style={styles.fieldLabel}>Section</Text>
            <PickerField
              label="Section"
              value={filter.section_id}
              onChange={v => setFilter(p => ({ ...p, section_id: v }))}
              placeholder="All Sections"
              disabled={!filter.class_id}
              items={[{ label: 'All Sections', value: '' }, ...sections.map(s => ({ label: `Section ${s.section_name}`, value: String(s.id) }))]}
            />

            <Pressable
              style={({ pressed }) => [styles.clearFilterBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setFilter({ class_id: '', section_id: '' })}
            >
              <Text style={styles.clearFilterTxt}>Clear Filters</Text>
            </Pressable>
          </View>
        )}
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
              <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]} onPress={() => openEdit(item)}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
                  <Text style={styles.sub}>{item.class_name} — Sec {item.section_name}{item.roll_no ? `  •  #${item.roll_no}` : ''}</Text>
                  {item.has_account > 0 && <Text style={styles.accountBadge}>Portal account ✓</Text>}
                </View>
                <View style={styles.eyeBtn}>
                  <Ionicons name="eye-outline" size={16} color={C.primary} />
                </View>
              </Pressable>
            )}
          />
        )}

      <Pressable style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Student</Text>
      </Pressable>

      {/* Add/Edit Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
              <PickerField
                label="Class"
                value={form.class_id}
                onChange={v => F('class_id', v)}
                placeholder="Select class…"
                items={[{ label: 'Select class…', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))]}
              />
              <Text style={[S.label, { marginTop: 6 }]}>Section *</Text>
              <PickerField
                label="Section"
                value={form.section_id}
                onChange={v => F('section_id', v)}
                placeholder="Select section…"
                disabled={!form.class_id}
                items={[{ label: 'Select section…', value: '' }, ...modalSections.map(s => ({ label: `Section ${s.section_name}`, value: String(s.id) }))]}
              />

              {editing && (
                <View style={styles.idMapBox}>
                  <Text style={styles.idMapTitle}>Mapped Account</Text>
                  <View style={styles.idMapRow}>
                    <Text style={styles.idMapText}>Email: {editing.account_email || 'No portal account mapped'}</Text>
                  </View>
                </View>
              )}

              {editing && editing.has_account > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Reset Password</Text>
                  <TextInput style={S.input} placeholder="New password (min 6)" secureTextEntry value={newPw} onChangeText={setNewPw} />
                  <Pressable style={[styles.modalBtn, { backgroundColor: '#D97706', marginTop: 8 }]} onPress={handleResetPw} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Reset Password</Text>}
                  </Pressable>
                </>
              )}

              {editing && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Danger Zone</Text>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: '#DC2626', marginTop: 8 }]}
                    onPress={() => {
                      const current = editing;
                      setModal(false);
                      handleDelete(current);
                    }}
                  >
                    <Text style={styles.saveBtnText}>Delete Student</Text>
                  </Pressable>
                </>
              )}

              <View style={styles.modalBtns}>
                <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  filterBar:   { padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  filterHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterTitle: { fontSize: 14, fontWeight: '800', color: C.textDark },
  filterSubTitle: { fontSize: 12, color: C.textMed, marginTop: 2 },
  filterToggleBtn: {
    backgroundColor: '#EEF2FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterToggleTxt: { color: C.primary, fontSize: 12, fontWeight: '800' },
  filterPanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fieldLabel: { fontSize: 12, color: C.textMed, fontWeight: '700', marginBottom: 4, marginTop: 6 },
  clearFilterBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearFilterTxt: { color: '#334155', fontSize: 12, fontWeight: '700' },
  pickerWrap:  { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, overflow: 'hidden', backgroundColor: C.cardAlt },
  picker:      { height: 44 },
  card:        { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  avatar:      { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:  { color: C.primary, fontWeight: '800', fontSize: 14 },
  name:        { fontSize: 15, fontWeight: '700', color: C.textDark },
  sub:         { fontSize: 12, color: C.textLight, marginTop: 1 },
  accountBadge:{ fontSize: 10, color: '#059669', fontWeight: '700', marginTop: 2 },
  eyeBtn:      { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  empty:       { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:         { position: 'absolute', bottom: 24, right: 20, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalCard:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:  { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  modalSub:    { fontSize: 13, color: C.textMed, marginBottom: 16 },
  divider:     { height: 1, backgroundColor: C.border, marginVertical: 14 },
  idMapBox:    { marginTop: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 },
  idMapTitle:  { fontSize: 11, color: C.textMed, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  idMapRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idMapText:   { fontSize: 12, color: C.textDark, fontWeight: '700' },
  sectionLabel:{ fontSize: 12, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:         { flexDirection: 'row', gap: 10 },
  modalBtns:   { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:    { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:   { backgroundColor: C.border },
  saveBtn:     { backgroundColor: C.primary },
  cancelBtnText:{ color: C.textMed, fontWeight: '700' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
