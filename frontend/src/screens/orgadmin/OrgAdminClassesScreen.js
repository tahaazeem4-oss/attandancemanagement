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

export default function OrgAdminClassesScreen({ navigation }) {
  const [classes, setClasses] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [classModal, setClassModal] = useState(false);
  const [sectionModal, setSectionModal] = useState(null); // holds class object
  const [editingClass, setEditingClass] = useState(null);
  const [className, setClassName] = useState('');
  const [classSchool, setClassSchool] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [editingSection, setEditingSection] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = filterCampus ? { campus_id: filterCampus } : {};
    api.get('/org-admin/classes', { params })
      .then(({ data }) => setClasses(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterCampus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data)).catch(() => {});
  }, []);

  const filtered = classes.filter(c => {
    const q = search.toLowerCase();
    return c.class_name?.toLowerCase().includes(q) || c.campus_name?.toLowerCase().includes(q);
  });

  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];

  const openAddClass = () => { setEditingClass(null); setClassName(''); setClassSchool(''); setClassModal(true); };
  const openEditClass = (item) => { setEditingClass(item); setClassName(item.class_name || ''); setClassSchool(String(item.school_id) || ''); setClassModal(true); };

  const handleSaveClass = async () => {
    if (!className.trim()) return Alert.alert('Validation', 'Class name is required.');
    if (!editingClass && !classSchool) return Alert.alert('Validation', 'Please select a campus.');
    setSaving(true);
    try {
      if (editingClass) {
        await api.put(`/org-admin/classes/${editingClass.id}`, { class_name: className });
      } else {
        await api.post('/org-admin/classes', { class_name: className, school_id: parseInt(classSchool) });
      }
      setClassModal(false);
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save class.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = (item) => {
    Alert.alert('Delete Class', `Delete "${item.class_name}"? All sections will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/org-admin/classes/${item.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Could not delete.'); }
      }},
    ]);
  };

  const openSectionModal = (cls) => { setSectionModal(cls); setSectionName(''); setEditingSection(null); };

  const handleSaveSection = async () => {
    if (!sectionName.trim()) return Alert.alert('Validation', 'Section name is required.');
    setSaving(true);
    try {
      if (editingSection) {
        await api.put(`/org-admin/sections/${editingSection.id}`, { section_name: sectionName });
      } else {
        await api.post('/org-admin/sections', { section_name: sectionName, class_id: sectionModal.id });
      }
      setSectionName('');
      setEditingSection(null);
      load();
      // Refresh sectionModal with fresh data
      const { data } = await api.get('/org-admin/classes', { params: { campus_id: sectionModal.school_id } });
      const updated = data.find(c => c.id === sectionModal.id);
      if (updated) setSectionModal(updated);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save section.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = (sec) => {
    Alert.alert('Delete Section', `Delete section "${sec.section_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/org-admin/sections/${sec.id}`);
          load();
          const { data } = await api.get('/org-admin/classes', { params: { campus_id: sectionModal.school_id } });
          const updated = data.find(c => c.id === sectionModal.id);
          if (updated) setSectionModal(updated); else setSectionModal(null);
        } catch (err) {
          Alert.alert('Error', err?.response?.data?.message || 'Could not delete section.');
        }
      }},
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        <Ionicons name="library-outline" size={20} color="#7C3AED" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.class_name}</Text>
        {item.campus_name ? <Text style={styles.meta}>{item.campus_name}</Text> : null}
        <View style={styles.sectionRow}>
          {(item.sections || []).map(s => (
            <View key={s.id} style={styles.secChip}>
              <Text style={styles.secChipTxt}>{s.section_name}</Text>
            </View>
          ))}
          {!(item.sections?.length) && <Text style={styles.noSec}>No sections</Text>}
        </View>
      </View>
      <View style={styles.actionBtns}>
        <TouchableOpacity onPress={() => openSectionModal(item)} style={styles.actionBtn}>
          <Ionicons name="layers-outline" size={17} color="#7C3AED" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openEditClass(item)} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={17} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteClass(item)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={17} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Classes" navigation={navigation} />
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput style={styles.searchInput} placeholder="Search classes..." placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity onPress={openAddClass} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusItems} placeholder="Filter by campus" />
      </View>
      <ImportExportBar
        templatePath="/org-admin/import-export/classes/template"
        importPath="/org-admin/import-export/classes/import"
        exportPath="/org-admin/import-export/classes/export"
        exportParams={filterCampus ? { campus_id: filterCampus } : {}}
        exportFilename="classes_export.xlsx"
        templateFilename="classes_template.xlsx"
        onImportDone={load}
      />
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
        : <FlatList data={filtered} keyExtractor={i => String(i.id)} renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
            ListEmptyComponent={<Text style={styles.empty}>No classes found.</Text>} />
      }

      {/* Add/Edit Class Modal */}
      <Modal visible={classModal} animationType="slide" transparent onRequestClose={() => setClassModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingClass ? 'Edit Class' : 'Add Class'}</Text>
            <Text style={styles.label}>Class Name *</Text>
            <TextInput style={styles.input} value={className} onChangeText={setClassName} placeholder="e.g. Class 5" />
            {!editingClass && <>
              <Text style={styles.label}>Campus *</Text>
              <PickerField label="" value={classSchool} onChange={setClassSchool}
                items={campuses.map(c => ({ label: c.name, value: String(c.id) }))} placeholder="Select campus" />
            </>}
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setClassModal(false)} style={styles.cancelBtn}><Text style={styles.cancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSaveClass} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sections Modal */}
      <Modal visible={!!sectionModal} animationType="slide" transparent onRequestClose={() => setSectionModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Sections — {sectionModal?.class_name}</Text>
            <ScrollView style={{ maxHeight: 250 }}>
              {(sectionModal?.sections || []).map(s => (
                <View key={s.id} style={styles.secRow}>
                  {editingSection?.id === s.id ? (
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0, padding: 8 }]} value={sectionName} onChangeText={setSectionName} />
                  ) : (
                    <Text style={styles.secRowTxt}>{s.section_name}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {editingSection?.id === s.id ? (
                      <TouchableOpacity onPress={handleSaveSection} style={styles.iconBtn} disabled={saving}>
                        <Ionicons name="checkmark" size={16} color="#22C55E" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => { setEditingSection(s); setSectionName(s.section_name); }} style={styles.iconBtn}>
                        <Ionicons name="pencil-outline" size={16} color="#2563EB" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDeleteSection(s)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {!(sectionModal?.sections?.length) && <Text style={styles.noSec}>No sections yet.</Text>}
            </ScrollView>
            {!editingSection && <>
              <Text style={styles.label}>Add Section</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[styles.input, { flex: 1 }]} value={sectionName} onChangeText={setSectionName} placeholder="Section name" />
                <TouchableOpacity onPress={handleSaveSection} style={[styles.saveBtn, { paddingHorizontal: 16 }]} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Add</Text>}
                </TouchableOpacity>
              </View>
            </>}
            <TouchableOpacity onPress={() => { setSectionModal(null); setEditingSection(null); setSectionName(''); }} style={[styles.cancelBtn, { marginTop: 12 }]}>
              <Text style={styles.cancelTxt}>Close</Text>
            </TouchableOpacity>
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
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: C.textDark },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  sectionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  secChip: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  secChipTxt: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },
  noSec: { fontSize: 11, color: '#94A3B8' },
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
  saveBtn: { padding: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700' },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  secRowTxt: { fontSize: 14, color: C.textDark },
  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
});
