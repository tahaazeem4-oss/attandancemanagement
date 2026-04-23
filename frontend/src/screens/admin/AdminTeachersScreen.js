import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator, StatusBar
} from 'react-native';
import api from '../../services/api';
import { C, S } from '../../config/theme';

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', phone: '' };

export default function AdminTeachersScreen() {
  const [teachers,  setTeachers]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);  // add/edit
  const [pwModal,   setPwModal]   = useState(false);  // reset password
  const [editing,   setEditing]   = useState(null);   // teacher being edited
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [newPw,     setNewPw]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [pwTarget,  setPwTarget]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/admin/teachers'); setTeachers(data); }
    catch { Alert.alert('Error', 'Could not load teachers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (t) => { setEditing(t); setForm({ first_name: t.first_name, last_name: t.last_name, email: t.email, phone: t.phone || '', password: '' }); setModal(true); };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email) return Alert.alert('Validation', 'First name, last name and email are required.');
    if (!editing && !form.password) return Alert.alert('Validation', 'Password is required for new teachers.');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/admin/teachers/${editing.id}`, { first_name: form.first_name, last_name: form.last_name, email: form.email, phone: form.phone });
      } else {
        await api.post('/admin/teachers', form);
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
      <StatusBar barStyle="dark-content" />

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
                  <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
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
