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

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', phone: '' };

export default function OrgAdminParentsScreen({ navigation }) {
  const [parents, setParents] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedCampuses, setSelectedCampuses] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = filterCampus ? { campus_id: filterCampus } : {};
    api.get('/org-admin/parents', { params })
      .then(({ data }) => setParents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterCampus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data)).catch(() => {});
  }, []);

  const filtered = parents.filter(p => {
    const q = search.toLowerCase();
    return (
      p.first_name?.toLowerCase().includes(q) ||
      p.last_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.campus_names?.some(n => n?.toLowerCase().includes(q))
    );
  });

  const campusFilterItems = [
    { label: 'All Campuses', value: '' },
    ...campuses.map(c => ({ label: c.name, value: String(c.id) })),
  ];

  const toggleCampus = (id) => {
    setSelectedCampuses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedCampuses([]);
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ first_name: item.first_name || '', last_name: item.last_name || '', email: item.email || '', password: '', phone: item.phone || '' });
    // Pre-select their campus names from the campuses list
    const existingIds = campuses
      .filter(c => item.campus_names?.includes(c.name))
      .map(c => c.id);
    setSelectedCampuses(existingIds.length ? existingIds : item.school_id ? [item.school_id] : []);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email)
      return Alert.alert('Validation', 'First name, last name and email are required.');
    if (!editing && !form.password)
      return Alert.alert('Validation', 'Password is required for new parents.');
    if (!selectedCampuses.length)
      return Alert.alert('Validation', 'Please select at least one campus.');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/org-admin/parents/${editing.id}`, {
          first_name: form.first_name, last_name: form.last_name,
          email: form.email, phone: form.phone,
          campus_ids: selectedCampuses,
        });
      } else {
        await api.post('/org-admin/parents', {
          ...form,
          campus_ids: selectedCampuses,
        });
      }
      setModalVisible(false);
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save parent.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Parent', `Delete "${item.first_name} ${item.last_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/org-admin/parents/${item.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Could not delete.'); }
      }},
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarTxt}>{(item.first_name?.[0] || '') + (item.last_name?.[0] || '')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.email}>{item.email}</Text>
        {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
        <View style={styles.badgeRow}>
          {(item.campus_names || [item.campus_name]).filter(Boolean).map((n, i) => (
            <View key={i} style={styles.badge}><Text style={styles.badgeTxt}>{n}</Text></View>
          ))}
        </View>
      </View>
      <View style={styles.actionBtns}>
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
      <AppHeader title="Parents" navigation={navigation} />
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput style={styles.searchInput} placeholder="Search parents..." placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusFilterItems} placeholder="Filter by campus" />
      </View>
      <ImportExportBar
        templatePath="/org-admin/import-export/parents/template"
        importPath="/org-admin/import-export/parents/import"
        exportPath="/org-admin/import-export/parents/export"
        exportFilename="parents_export.xlsx"
        templateFilename="parents_template.xlsx"
        onImportDone={load}
      />
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
        : <FlatList data={filtered} keyExtractor={i => String(i.id)} renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
            ListEmptyComponent={<Text style={styles.empty}>No parents found.</Text>} />
      }

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Parent' : 'Add Parent'}</Text>
            <ScrollView>
              <Text style={styles.label}>First Name *</Text>
              <TextInput style={styles.input} value={form.first_name} onChangeText={v => setForm(f => ({ ...f, first_name: v }))} />
              <Text style={styles.label}>Last Name *</Text>
              <TextInput style={styles.input} value={form.last_name} onChangeText={v => setForm(f => ({ ...f, last_name: v }))} />
              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} autoCapitalize="none" keyboardType="email-address" />
              <Text style={styles.label}>Phone</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
              {!editing && <>
                <Text style={styles.label}>Password *</Text>
                <TextInput style={styles.input} value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))} secureTextEntry />
              </>}
              <Text style={styles.label}>Campuses * (select one or more)</Text>
              <View style={styles.chipRow}>
                {campuses.map(c => {
                  const sel = selectedCampuses.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, sel && styles.chipActive]}
                      onPress={() => toggleCampus(c.id)}
                    >
                      {sel && <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 4 }} />}
                      <Text style={[styles.chipTxt, sel && styles.chipTxtActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontWeight: '700', color: '#10B981', fontSize: 16 },
  name: { fontSize: 14, fontWeight: '700', color: C.textDark },
  email: { fontSize: 12, color: '#64748B', marginTop: 2 },
  phone: { fontSize: 12, color: '#64748B' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  badge: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelTxt: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700' },
});
