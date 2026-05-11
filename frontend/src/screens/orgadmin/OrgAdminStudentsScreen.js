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

const EMPTY_FORM = { first_name: '', last_name: '', age: '', roll_no: '', school_id: '', class_id: '', section_id: '' };

export default function OrgAdminStudentsScreen({ navigation }) {
  const [students, setStudents] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formClasses, setFormClasses] = useState([]);
  const [formSections, setFormSections] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filterCampus) params.campus_id = filterCampus;
    if (filterClass) params.class_id = filterClass;
    if (filterSection) params.section_id = filterSection;
    api.get('/org-admin/students', { params })
      .then(({ data }) => setStudents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterCampus, filterClass, filterSection]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data)).catch(() => {});
  }, []);

  // Filter classes based on selected campus filter
  useEffect(() => {
    if (filterCampus) {
      api.get('/org-admin/classes', { params: { campus_id: filterCampus } })
        .then(({ data }) => setClasses(data))
        .catch(() => setClasses([]));
    } else {
      setClasses([]);
    }
    setFilterClass('');
    setFilterSection('');
  }, [filterCampus]);

  useEffect(() => {
    if (filterClass) {
      const cls = classes.find(c => String(c.id) === String(filterClass));
      setSections(cls?.sections || []);
    } else {
      setSections([]);
    }
    setFilterSection('');
  }, [filterClass]);

  // Form-level campus→classes cascade
  useEffect(() => {
    if (form.school_id) {
      api.get('/org-admin/classes', { params: { campus_id: form.school_id } })
        .then(({ data }) => setFormClasses(data))
        .catch(() => setFormClasses([]));
    } else {
      setFormClasses([]);
    }
    setForm(f => ({ ...f, class_id: '', section_id: '' }));
  }, [form.school_id]);

  useEffect(() => {
    if (form.class_id) {
      const cls = formClasses.find(c => String(c.id) === String(form.class_id));
      setFormSections(cls?.sections || []);
    } else {
      setFormSections([]);
    }
    setForm(f => ({ ...f, section_id: '' }));
  }, [form.class_id]);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return (
      s.first_name?.toLowerCase().includes(q) ||
      s.last_name?.toLowerCase().includes(q) ||
      s.campus_name?.toLowerCase().includes(q) ||
      s.class_name?.toLowerCase().includes(q)
    );
  });

  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];
  const classFilterItems = [{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))];
  const sectionFilterItems = [{ label: 'All Sections', value: '' }, ...sections.map(s => ({ label: s.section_name, value: String(s.id) }))];

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormClasses([]);
    setFormSections([]);
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      first_name: item.first_name || '', last_name: item.last_name || '',
      age: item.age ? String(item.age) : '', roll_no: item.roll_no || '',
      school_id: String(item.school_id) || '', class_id: String(item.class_id) || '',
      section_id: String(item.section_id) || '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) return Alert.alert('Validation', 'Name is required.');
    if (!editing && !form.school_id) return Alert.alert('Validation', 'Please select a campus.');
    if (!form.class_id) return Alert.alert('Validation', 'Please select a class.');
    if (!form.section_id) return Alert.alert('Validation', 'Please select a section.');
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name, last_name: form.last_name,
        age: form.age ? parseInt(form.age) : null,
        roll_no: form.roll_no || null,
        school_id: parseInt(form.school_id),
        class_id: parseInt(form.class_id),
        section_id: parseInt(form.section_id),
      };
      if (editing) {
        await api.put(`/org-admin/students/${editing.id}`, payload);
      } else {
        await api.post('/org-admin/students', payload);
      }
      setModalVisible(false);
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save student.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Student', `Delete "${item.first_name} ${item.last_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/org-admin/students/${item.id}`); load(); }
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
        <Text style={styles.meta}>
          {item.class_name}{item.section_name ? ` — Sec ${item.section_name}` : ''}
          {item.roll_no ? `  ·  Roll ${item.roll_no}` : ''}
        </Text>
        {item.campus_name ? <View style={styles.badge}><Text style={styles.badgeTxt}>{item.campus_name}</Text></View> : null}
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
      <AppHeader title="Students" navigation={navigation} />
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput style={styles.searchInput} placeholder="Search students..." placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
        <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusItems} placeholder="Filter by campus" />
      </View>
      {filterCampus ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
          <PickerField label="" value={filterClass} onChange={setFilterClass} items={classFilterItems} placeholder="Filter by class" />
        </View>
      ) : null}
      {filterClass ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField label="" value={filterSection} onChange={setFilterSection} items={sectionFilterItems} placeholder="Filter by section" />
        </View>
      ) : null}
      <ImportExportBar
        templatePath="/org-admin/import-export/students/template"
        importPath="/org-admin/import-export/students/import"
        exportPath="/org-admin/import-export/students/export"
        exportParams={filterCampus ? { campus_id: filterCampus } : {}}
        exportFilename="students_export.xlsx"
        templateFilename="students_template.xlsx"
        onImportDone={load}
      />
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
        : <FlatList data={filtered} keyExtractor={i => String(i.id)} renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
            ListEmptyComponent={<Text style={styles.empty}>No students found.</Text>} />
      }

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Student' : 'Add Student'}</Text>
            <ScrollView>
              <Text style={styles.label}>First Name *</Text>
              <TextInput style={styles.input} value={form.first_name} onChangeText={v => setForm(f => ({ ...f, first_name: v }))} />
              <Text style={styles.label}>Last Name *</Text>
              <TextInput style={styles.input} value={form.last_name} onChangeText={v => setForm(f => ({ ...f, last_name: v }))} />
              <Text style={styles.label}>Age</Text>
              <TextInput style={styles.input} value={form.age} onChangeText={v => setForm(f => ({ ...f, age: v }))} keyboardType="numeric" />
              <Text style={styles.label}>Roll No</Text>
              <TextInput style={styles.input} value={form.roll_no} onChangeText={v => setForm(f => ({ ...f, roll_no: v }))} />
              <Text style={styles.label}>Campus *</Text>
              <PickerField label="" value={form.school_id} onChange={v => setForm(f => ({ ...f, school_id: v }))}
                items={campuses.map(c => ({ label: c.name, value: String(c.id) }))} placeholder="Select campus" />
              <Text style={styles.label}>Class *</Text>
              <PickerField label="" value={form.class_id} onChange={v => setForm(f => ({ ...f, class_id: v }))}
                items={formClasses.map(c => ({ label: c.class_name, value: String(c.id) }))} placeholder="Select class" />
              <Text style={styles.label}>Section *</Text>
              <PickerField label="" value={form.section_id} onChange={v => setForm(f => ({ ...f, section_id: v }))}
                items={formSections.map(s => ({ label: s.section_name, value: String(s.id) }))} placeholder="Select section" />
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F9FF', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontWeight: '700', color: '#0EA5E9', fontSize: 16 },
  name: { fontSize: 14, fontWeight: '700', color: C.textDark },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  badge: { marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelTxt: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700' },
});
