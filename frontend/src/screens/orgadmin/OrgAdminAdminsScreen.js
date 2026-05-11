import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import ImportExportBar from '../../components/ImportExportBar';
import PickerField from '../../components/PickerField';

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', school_id: '' };

export default function OrgAdminAdminsScreen({ navigation }) {
  const [admins, setAdmins] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = filterCampus ? { campus_id: filterCampus } : {};
    api.get('/org-admin/admins', { params })
      .then(({ data }) => setAdmins(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterCampus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data)).catch(() => {});
  }, []);

  const filtered = admins.filter(a => {
    const q = search.toLowerCase();
    return (
      a.first_name?.toLowerCase().includes(q) ||
      a.last_name?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.campus_name?.toLowerCase().includes(q)
    );
  });

  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setModalVisible(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ first_name: item.first_name || '', last_name: item.last_name || '', email: item.email || '', password: '', school_id: String(item.school_id) || '' });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email)
      return Alert.alert('Validation', 'First name, last name and email are required.');
    if (!editing && !form.password)
      return Alert.alert('Validation', 'Password is required for new admins.');
    if (!editing && !form.school_id)
      return Alert.alert('Validation', 'Please select a campus.');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/org-admin/admins/${editing.id}`, { first_name: form.first_name, last_name: form.last_name, email: form.email });
      } else {
        await api.post('/org-admin/admins', { ...form, school_id: parseInt(form.school_id) });
      }
      setModalVisible(false);
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save admin.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Admin', `Delete "${item.first_name} ${item.last_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/org-admin/admins/${item.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Could not delete.'); }
      }},
    ]);
  };

  const handleResetPassword = async () => {
    if (!newPassword) return Alert.alert('Validation', 'Enter a new password.');
    setSaving(true);
    try {
      await api.post(`/org-admin/admins/${resetModal.id}/reset-password`, { new_password: newPassword });
      Alert.alert('Success', 'Password reset successfully.');
      setResetModal(null);
      setNewPassword('');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not reset password.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarTxt}>{(item.first_name?.[0] || '') + (item.last_name?.[0] || '')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.email}>{item.email}</Text>
        {item.campus_name ? <View style={styles.badge}><Text style={styles.badgeTxt}>{item.campus_name}</Text></View> : null}
      </View>
      <View style={styles.actionBtns}>
        <TouchableOpacity onPress={() => { setResetModal(item); setNewPassword(''); }} style={styles.actionBtn}>
          <Ionicons name="key-outline" size={17} color="#F59E0B" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={17} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={17} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Campus Admins" navigation={navigation} />
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput style={styles.searchInput} placeholder="Search admins..." placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusItems} placeholder="Filter by campus" />
      </View>
      <ImportExportBar
        templatePath="/org-admin/import-export/admins/template"
        importPath="/org-admin/import-export/admins/import"
        exportPath="/org-admin/import-export/admins/export"
        exportFilename="admins_export.xlsx"
        templateFilename="admins_template.xlsx"
        onImportDone={load}
      />
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
        : <FlatList data={filtered} keyExtractor={i => String(i.id)} renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
            ListEmptyComponent={<Text style={styles.empty}>No admins found.</Text>} />
      }

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Admin' : 'Add Admin'}</Text>
            <ScrollView>
              <Text style={styles.label}>First Name *</Text>
              <TextInput style={styles.input} value={form.first_name} onChangeText={v => setForm(f => ({ ...f, first_name: v }))} />
              <Text style={styles.label}>Last Name *</Text>
              <TextInput style={styles.input} value={form.last_name} onChangeText={v => setForm(f => ({ ...f, last_name: v }))} />
              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} autoCapitalize="none" keyboardType="email-address" />
              {!editing && <>
                <Text style={styles.label}>Password *</Text>
                <TextInput style={styles.input} value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))} secureTextEntry />
                <Text style={styles.label}>Campus *</Text>
                <PickerField label="" value={form.school_id} onChange={v => setForm(f => ({ ...f, school_id: v }))}
                  items={campuses.map(c => ({ label: c.name, value: String(c.id) }))} placeholder="Select campus" />
              </>}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={!!resetModal} animationType="slide" transparent onRequestClose={() => setResetModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.sub}>{resetModal?.first_name} {resetModal?.last_name}</Text>
            <Text style={styles.label}>New Password</Text>
            <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Enter new password" />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setResetModal(null)} style={styles.cancelBtn}><Text style={styles.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleResetPassword} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Reset</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 4, gap: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: C.textDark },
  addBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontWeight: '700', color: '#7C3AED', fontSize: 16 },
  name: { fontSize: 14, fontWeight: '700', color: C.textDark },
  email: { fontSize: 12, color: '#64748B', marginTop: 2 },
  sub: { fontSize: 12, color: '#64748B', marginBottom: 8 },
  badge: { marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelTxt: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700' },
});
