import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, ScrollView, StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import api from '../../services/api';
import { C, S } from '../../config/theme';
import ImportExportBar from '../../components/ImportExportBar';
import AppHeader from '../../components/AppHeader';

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', phone: '', assignments: [] };

const ROLE = {
  class_teacher:   { label: 'Class Teacher',   bg: '#ECFDF5', color: '#065F46' },
  floor_incharge:  { label: 'Floor Incharge',  bg: '#F5F3FF', color: '#5B21B6' },
  subject_teacher: { label: 'Subject Teacher', bg: '#FFFBEB', color: '#92400E' },
};

// ── Multi-Assignment Picker (inline) ─────────────────────────
function MultiAssignmentPicker({ classes, assignments, onChange }) {
  const [picking,   setPicking]   = useState(false);
  const [pickClass, setPickClass] = useState(null);
  const sections = pickClass ? (classes.find(c => c.id === pickClass)?.sections || []) : [];

  const add = (classId, sectionId) => {
    const cls = classes.find(c => c.id === classId);
    const sec = cls?.sections?.find(s => s.id === sectionId);
    if (!cls || !sec) return;
    if (assignments.some(a => a.class_id === classId && a.section_id === sectionId)) return;
    onChange([...assignments, { class_id: classId, section_id: sectionId, class_name: cls.class_name, section_name: sec.section_name }]);
    setPickClass(null); setPicking(false);
  };
  const remove = (idx) => onChange(assignments.filter((_, i) => i !== idx));

  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={S.label}>Class / Section Assignments</Text>
      <View style={{ gap: 6, marginBottom: 8 }}>
        {assignments.length === 0 && (
          <View style={mp.emptyTag}>
            <Text style={mp.emptyTagTxt}>No assignment — Subject Teacher</Text>
          </View>
        )}
        {assignments.map((a, i) => (
          <View key={i} style={mp.tag}>
            <Text style={mp.tagTxt}>{a.class_name}  ·  Sec {a.section_name}</Text>
            <Pressable onPress={() => remove(i)} hitSlop={8}>
              <Text style={mp.tagX}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {picking ? (
        <View style={mp.pickerBox}>
          <Text style={[S.label, { marginBottom: 6 }]}>Select Class</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {classes.map(cls => (
              <Pressable
                key={cls.id}
                style={[mp.pill, pickClass === cls.id && mp.pillActive]}
                onPress={() => setPickClass(cls.id)}
              >
                <Text style={[mp.pillTxt, pickClass === cls.id && mp.pillTxtActive]}>{cls.class_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {pickClass !== null && sections.length > 0 && (
            <>
              <Text style={[S.label, { marginBottom: 6 }]}>Select Section</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {sections.map(sec => (
                  <Pressable key={sec.id} style={mp.pill} onPress={() => add(pickClass, sec.id)}>
                    <Text style={mp.pillTxt}>{sec.section_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <Pressable onPress={() => { setPicking(false); setPickClass(null); }} style={mp.cancelBtn}>
            <Text style={mp.cancelBtnTxt}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={mp.addBtn} onPress={() => setPicking(true)}>
          <Text style={mp.addBtnTxt}>＋  Add Class / Section</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function AdminTeachersScreen({ navigation }) {
  const [teachers,  setTeachers]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [pwModal,   setPwModal]   = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [newPw,     setNewPw]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [pwTarget,  setPwTarget]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        api.get('/admin/teachers'),
        api.get('/admin/classes'),
      ]);
      setTeachers(tRes.data);
      setClasses(cRes.data);
    } catch { Alert.alert('Error', 'Could not load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({ first_name: t.first_name, last_name: t.last_name, email: t.email, phone: t.phone || '', password: '', assignments: t.assignments || [] });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email) return Alert.alert('Validation', 'First name, last name and email are required.');
    if (!editing && !form.password) return Alert.alert('Validation', 'Password is required for new teachers.');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/admin/teachers/${editing.id}`, { first_name: form.first_name, last_name: form.last_name, email: form.email, phone: form.phone, assignments: form.assignments });
      } else {
        await api.post('/admin/teachers', { ...form, assignments: form.assignments });
      }
      setModal(false);
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save teacher');
    } finally { setSaving(false); }
  };

  const handleDelete = (t) => {
    Alert.alert('Delete Teacher', `Delete ${t.first_name} ${t.last_name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/admin/teachers/${t.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Could not delete'); }
      }},
    ]);
  };

  const handleResetPw = async () => {
    if (!newPw || newPw.length < 6) return Alert.alert('Validation', 'Password must be at least 6 characters.');
    setSaving(true);
    try {
      await api.post(`/admin/teachers/${pwTarget.id}/reset-password`, { new_password: newPw });
      Alert.alert('Done', 'Password reset successfully');
      setPwModal(false); setNewPw('');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not reset password');
    } finally { setSaving(false); }
  };

  const F = (key, val) => setForm(p => ({ ...p, [key]: val }));

  return (
    <View style={styles.container}>
      <AppHeader title="Teachers" navigation={navigation} />
      <ImportExportBar
        templatePath="/import-export/teachers/template"
        templateFilename="teachers_template.xlsx"
        importPath="/import-export/teachers/import"
        exportPath="/import-export/teachers/export"
        exportFilename="teachers_export.xlsx"
        onImportDone={load}
      />
      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={teachers}
            keyExtractor={t => String(t.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No teachers yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
                    {item.teacher_role && ROLE[item.teacher_role] && (
                      <View style={[styles.rolePill, { backgroundColor: ROLE[item.teacher_role].bg }]}>
                        <Text style={[styles.rolePillTxt, { color: ROLE[item.teacher_role].color }]}>
                          {ROLE[item.teacher_role].label}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sub}>{item.email}</Text>
                  {item.phone ? <Text style={styles.sub}>{item.phone}</Text> : null}
                </View>
                <View style={styles.actions}>
                  <Pressable style={[styles.btn, { backgroundColor: '#EEF2FF' }]} onPress={() => openEdit(item)}>
                    <Text style={[styles.btnText, { color: C.primary }]}>Edit</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, { backgroundColor: '#FFFBEB' }]} onPress={() => { setPwTarget(item); setNewPw(''); setPwModal(true); }}>
                    <Text style={[styles.btnText, { color: '#D97706' }]}>🔑</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDelete(item)}>
                    <Text style={[styles.btnText, { color: '#EF4444' }]}>🗑</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}

      {/* FAB */}
      <Pressable style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Teacher</Text>
      </Pressable>

      {/* Add/Edit Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Teacher' : 'Add Teacher'}</Text>
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
              <Text style={S.label}>Email *</Text>
              <TextInput style={S.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => F('email', v)} />
              {!editing && (
                <>
                  <Text style={S.label}>Password *</Text>
                  <TextInput style={S.input} placeholder="Password (min 6)" secureTextEntry value={form.password} onChangeText={v => F('password', v)} />
                </>
              )}
              <Text style={S.label}>Phone</Text>
              <TextInput style={S.input} placeholder="Phone (optional)" keyboardType="phone-pad" value={form.phone} onChangeText={v => F('phone', v)} />
              <MultiAssignmentPicker
                classes={classes}
                assignments={form.assignments}
                onChange={v => F('assignments', v)}
              />
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

      {/* Reset Password Modal */}
      <Modal visible={pwModal} transparent animationType="fade" onRequestClose={() => setPwModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSub}>{pwTarget?.first_name} {pwTarget?.last_name}</Text>
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
  container:  { flex: 1, backgroundColor: C.bg },
  card:       { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  avatar:     { width: 44, height: 44, borderRadius: 13, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: C.primary, fontWeight: '800', fontSize: 14 },
  name:       { fontSize: 15, fontWeight: '700', color: C.textDark },
  sub:        { fontSize: 12, color: C.textLight, marginTop: 1 },
  rolePill:   { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  rolePillTxt:{ fontSize: 10, fontWeight: '700' },
  actions:    { flexDirection: 'row', gap: 6 },
  btn:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  btnText:    { fontSize: 12, fontWeight: '700' },
  empty:      { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:        { position: 'absolute', bottom: 24, right: 20, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText:    { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:  { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  modalSub:   { fontSize: 13, color: C.textMed, marginBottom: 16 },
  row:        { flexDirection: 'row', gap: 10 },
  modalBtns:  { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:   { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:  { backgroundColor: C.border },
  saveBtn:    { backgroundColor: C.primary },
  cancelBtnText: { color: C.textMed, fontWeight: '700' },
  saveBtnText:   { color: '#fff', fontWeight: '700' },
});

const mp = StyleSheet.create({
  emptyTag:     { backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, alignItems: 'center' },
  emptyTagTxt:  { color: '#92400E', fontSize: 12 },
  tag:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tagTxt:       { fontSize: 13, fontWeight: '600', color: C.primary, flex: 1 },
  tagX:         { fontSize: 14, color: C.textMed, fontWeight: '700', marginLeft: 8 },
  pickerBox:    { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  pill:         { backgroundColor: '#F1F5F9', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: C.border },
  pillActive:   { backgroundColor: C.primary, borderColor: C.primary },
  pillTxt:      { color: C.textMed, fontSize: 13, fontWeight: '600' },
  pillTxtActive:{ color: '#fff' },
  addBtn:       { borderStyle: 'dashed', borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  addBtnTxt:    { color: C.primary, fontWeight: '700', fontSize: 13 },
  cancelBtn:    { marginTop: 8, padding: 8, alignItems: 'center' },
  cancelBtnTxt: { color: C.textMed, fontSize: 13 },
});
