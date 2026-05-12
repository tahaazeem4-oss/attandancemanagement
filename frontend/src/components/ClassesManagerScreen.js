import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C, S } from '../config/theme';
import AppHeader from './AppHeader';
import ImportExportBar from './ImportExportBar';
import PickerField from './PickerField';
import EntityEmptyState from './EntityEmptyState';
import ManagerSearchAddRow from './ManagerSearchAddRow';
import ModalFooterActions from './ModalFooterActions';

export default function ClassesManagerScreen({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';
  const isSuper = mode === 'superadmin';

  const [classes, setClasses] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterCampus, setFilterCampus] = useState('');

  const [classModal, setClassModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);

  const [editingClass, setEditingClass] = useState(null);
  const [className, setClassName] = useState('');
  const [classSchool, setClassSchool] = useState('');

  const [target, setTarget] = useState(null);
  const [sectionName, setSectionName] = useState('');
  const [editingSection, setEditingSection] = useState(null);

  const loadCampuses = useCallback(async () => {
    if (isSuper) {
      try {
        const [sRes, oRes] = await Promise.all([
          api.get('/super-admin/schools'),
          api.get('/super-admin/organizations').catch(() => ({ data: [] })),
        ]);
        const allCampuses = sRes.data || [];
        const filteredCampuses = filterOrg
          ? allCampuses.filter(c => String(c.org_id) === String(filterOrg))
          : allCampuses;
        setCampuses(filteredCampuses);
        setOrganizations(oRes.data || []);
      } catch {
        setCampuses([]);
        setOrganizations([]);
      }
      return;
    }

    if (!isOrg) return;
    try {
      const { data } = await api.get('/org-admin/campuses');
      setCampuses(data || []);
    } catch {
      setCampuses([]);
    }
  }, [isOrg, isSuper, filterOrg]);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuper) {
        if (!filterCampus) {
          setClasses([]);
          return [];
        }
        const { data } = await api.get(`/super-admin/schools/${filterCampus}/classes`);
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
        return list;
      }

      if (isOrg) {
        const params = filterCampus ? { campus_id: filterCampus } : {};
        const { data } = await api.get('/org-admin/classes', { params });
        setClasses(data || []);
        return data || [];
      }
      const { data } = await api.get('/admin/classes');
      const list = Array.isArray(data) ? data : [];
      setClasses(list);
      return list;
    } catch {
      Alert.alert('Error', 'Could not load classes');
      return [];
    } finally {
      setLoading(false);
    }
  }, [isOrg, isSuper, filterCampus]);

  useEffect(() => {
    if (!isSuper) return;
    setFilterCampus('');
  }, [isSuper, filterOrg]);

  useEffect(() => {
    loadCampuses();
  }, [loadCampuses]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const refreshTarget = useCallback(async (classId) => {
    const list = await loadClasses();
    const updated = list.find(c => String(c.id) === String(classId));
    setTarget(updated || null);
  }, [loadClasses]);

  const openAddClass = () => {
    setEditingClass(null);
    setClassName('');
    setClassSchool('');
    setClassModal(true);
  };

  const openEditClass = (item) => {
    setEditingClass(item);
    setClassName(item.class_name || '');
    setClassSchool(String(item.school_id || ''));
    setClassModal(true);
  };

  const openDetails = (item) => {
    setTarget(item);
    setSectionName('');
    setEditingSection(null);
    setDetailModal(true);
  };

  const handleSaveClass = async () => {
    if (!className.trim()) return Alert.alert('Validation', 'Class name is required.');
    if ((isOrg || isSuper) && !editingClass && !classSchool) return Alert.alert('Validation', 'Please select a campus.');

    setSaving(true);
    try {
      if (editingClass && isSuper) {
        const schoolId = editingClass.school_id || classSchool || filterCampus;
        await api.put(`/super-admin/schools/${schoolId}/classes/${editingClass.id}`, { class_name: className.trim() });
      } else if (editingClass) {
        const endpoint = isOrg ? `/org-admin/classes/${editingClass.id}` : `/admin/classes/${editingClass.id}`;
        await api.put(endpoint, { class_name: className.trim() });
      } else if (isSuper) {
        await api.post(`/super-admin/schools/${classSchool}/classes`, { class_name: className.trim() });
      } else if (isOrg) {
        await api.post('/org-admin/classes', { class_name: className.trim(), school_id: parseInt(classSchool, 10) });
      } else {
        await api.post('/admin/classes', { class_name: className.trim() });
      }
      setClassModal(false);
      await loadClasses();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save class.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = (item) => {
    if (!item?.id) return;
    Alert.alert('Delete Class', `Delete "${item.class_name}"? All sections/data may be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const endpoint = isSuper
              ? `/super-admin/schools/${item.school_id || filterCampus}/classes/${item.id}`
              : isOrg
                ? `/org-admin/classes/${item.id}`
                : `/admin/classes/${item.id}`;
            await api.delete(endpoint);
            setDetailModal(false);
            setTarget(null);
            await loadClasses();
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete class.');
          }
        },
      },
    ]);
  };

  const handleSaveSection = async () => {
    if (!sectionName.trim()) return Alert.alert('Validation', 'Section name is required.');
    if (!target?.id) return;

    setSaving(true);
    try {
      if (editingSection?.id && isSuper) {
        await api.put(`/super-admin/schools/${target.school_id || filterCampus}/sections/${editingSection.id}`, { section_name: sectionName.trim() });
      } else if (editingSection?.id && isOrg) {
        await api.put(`/org-admin/sections/${editingSection.id}`, { section_name: sectionName.trim() });
      } else if (isSuper) {
        await api.post(`/super-admin/schools/${target.school_id || filterCampus}/classes/${target.id}/sections`, { section_name: sectionName.trim() });
      } else if (isOrg) {
        await api.post('/org-admin/sections', { section_name: sectionName.trim(), class_id: target.id });
      } else {
        await api.post(`/admin/classes/${target.id}/sections`, { section_name: sectionName.trim() });
      }
      setSectionName('');
      setEditingSection(null);
      await refreshTarget(target.id);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save section.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = (sec) => {
    if (!sec?.id) return;
    Alert.alert('Delete Section', `Delete section "${sec.section_name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const endpoint = isSuper
              ? `/super-admin/schools/${target.school_id || filterCampus}/sections/${sec.id}`
              : isOrg
                ? `/org-admin/sections/${sec.id}`
                : `/admin/sections/${sec.id}`;
            await api.delete(endpoint);
            if (target?.id) await refreshTarget(target.id);
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete section.');
          }
        },
      },
    ]);
  };

  const orgItems = [{ label: 'All Organizations', value: '' }, ...organizations.map(o => ({ label: o.name, value: String(o.id) }))];
  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];

  const visibleClasses = (isOrg || isSuper)
    ? classes.filter(c => {
      const q = search.toLowerCase();
      return (
        String(c.class_name || '').toLowerCase().includes(q) ||
        String(c.campus_name || c.school_name || c.name || '').toLowerCase().includes(q)
      );
    })
    : classes;

  return (
    <View style={styles.container}>
      <AppHeader title="Classes" navigation={navigation} />

      <ManagerSearchAddRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search classes..."
        onAddPress={openAddClass}
      />
      {isSuper ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField label="" value={filterOrg} onChange={setFilterOrg} items={orgItems} placeholder="Filter by organization" />
        </View>
      ) : null}
      {(isOrg || isSuper) ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusItems} placeholder="Filter by campus" />
        </View>
      ) : null}
      {(isOrg || isSuper) ? (
        filterCampus ? (
          <ImportExportBar
            templatePath="/import-export/classes/template"
            templateParams={{ campus_id: filterCampus }}
            importPath="/import-export/classes/import"
            importFields={{ campus_id: filterCampus }}
            exportPath="/import-export/classes/export"
            exportParams={{ campus_id: filterCampus }}
            exportFilename="classes_export.xlsx"
            templateFilename="classes_template.xlsx"
            onImportDone={loadClasses}
          />
        ) : null
      ) : (
        <ImportExportBar
          templatePath="/import-export/classes/template"
          templateFilename="classes_template.xlsx"
          importPath="/import-export/classes/import"
          exportPath="/import-export/classes/export"
          exportFilename="classes_export.xlsx"
          onImportDone={loadClasses}
        />
      )}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={visibleClasses}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={<EntityEmptyState icon="library-outline" title="No classes found" subtitle="Create your first class to get started" />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.classCard, pressed && { opacity: 0.88 }]} onPress={() => openDetails(item)}>
              <View style={styles.classHeader}>
                <View style={styles.classIconWrap}>
                  <Ionicons name="library-outline" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.className}>{item.class_name}</Text>
                  {(isOrg || isSuper) && !!(item.campus_name || item.school_name || item.name) && <Text style={styles.meta}>{item.campus_name || item.school_name || item.name}</Text>}
                </View>
                <View style={styles.eyeBtn}>
                  <Ionicons name="eye-outline" size={16} color={C.primary} />
                </View>
              </View>
              {(item.sections || []).length > 0 && (
                <View style={styles.sectionList}>
                  {(item.sections || []).map(sec => (
                    <View key={sec.id} style={styles.sectionChip}>
                      <Text style={styles.sectionText}>{sec.section_name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      <Modal visible={classModal} animationType="slide" transparent onRequestClose={() => setClassModal(false)}>
        <View style={styles.overlayBottom}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingClass ? 'Edit Class' : 'Add Class'}</Text>
            <Text style={styles.label}>Class Name *</Text>
            <TextInput style={styles.input} value={className} onChangeText={setClassName} placeholder="e.g. Grade 6" />
            {(isOrg || isSuper) && !editingClass && (
              <>
                <Text style={styles.label}>Campus *</Text>
                <PickerField
                  label=""
                  value={classSchool}
                  onChange={setClassSchool}
                  items={campuses.map(c => ({ label: c.name, value: String(c.id) }))}
                  placeholder="Select campus"
                />
              </>
            )}
            <ModalFooterActions onCancel={() => setClassModal(false)} onConfirm={handleSaveClass} loading={saving} />
          </View>
        </View>
      </Modal>

      <Modal visible={detailModal} animationType="slide" transparent onRequestClose={() => setDetailModal(false)}>
        <View style={styles.overlayBottom}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Class Details</Text>

            <Text style={styles.label}>Class Name *</Text>
            <TextInput style={styles.input} value={target?.class_name || ''} onChangeText={v => setTarget(p => ({ ...(p || {}), class_name: v }))} />
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={async () => {
                  if (!target?.id || !target?.class_name?.trim()) return Alert.alert('Validation', 'Class name is required.');
                  try {
                    setSaving(true);
                    const endpoint = isSuper
                      ? `/super-admin/schools/${target.school_id || filterCampus}/classes/${target.id}`
                      : isOrg
                        ? `/org-admin/classes/${target.id}`
                        : `/admin/classes/${target.id}`;
                    await api.put(endpoint, { class_name: target.class_name.trim() });
                    await refreshTarget(target.id);
                  } catch (err) {
                    Alert.alert('Error', err?.response?.data?.message || 'Could not update class.');
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save Class</Text>}
              </Pressable>
            </View>

            <View style={styles.divider} />

            <Text style={styles.modalSub}>Sections</Text>
            <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: 8 }}>
              {(target?.sections || []).length === 0 ? (
                <Text style={styles.noSectionsTxt}>No sections yet.</Text>
              ) : (
                (target?.sections || []).map(sec => (
                  <View key={sec.id} style={styles.sectionRow}>
                    {(isOrg || isSuper) && editingSection?.id === sec.id ? (
                      <TextInput style={[styles.input, { flex: 1, marginBottom: 0, padding: 8 }]} value={sectionName} onChangeText={setSectionName} />
                    ) : (
                      <Text style={styles.sectionRowTxt}>{sec.section_name}</Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(isOrg || isSuper) && (
                        editingSection?.id === sec.id ? (
                          <Pressable onPress={handleSaveSection} style={styles.iconBtn} disabled={saving}>
                            <Ionicons name="checkmark" size={16} color="#22C55E" />
                          </Pressable>
                        ) : (
                          <Pressable onPress={() => { setEditingSection(sec); setSectionName(sec.section_name); }} style={styles.iconBtn}>
                            <Ionicons name="pencil-outline" size={16} color="#2563EB" />
                          </Pressable>
                        )
                      )}
                      <Pressable onPress={() => handleDeleteSection(sec)} style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 12 }]}>Add Section *</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={(isOrg || isSuper) ? 'Section name' : 'e.g. A'}
                autoCapitalize={(isOrg || isSuper) ? 'none' : 'characters'}
                value={sectionName}
                onChangeText={setSectionName}
              />
              <Pressable style={[styles.saveBtn, { paddingHorizontal: 16, justifyContent: 'center' }]} onPress={handleSaveSection} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add</Text>}
              </Pressable>
            </View>

            <View style={styles.divider} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => { setDetailModal(false); setTarget(null); setSectionName(''); setEditingSection(null); }}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#DC2626' }]} onPress={() => handleDeleteClass(target)}>
                <Text style={styles.saveText}>Delete Class</Text>
              </Pressable>
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
  classCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  classHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  classIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  className: { flex: 1, fontSize: 15, fontWeight: '800', color: C.textDark },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  eyeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  sectionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.border },
  sectionChip: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sectionText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab: { position: 'absolute', bottom: 24, right: 20, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  modalSub: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtn: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  saveBtn: { backgroundColor: C.primary, borderRadius: 10 },
  cancelText: { color: '#64748B', fontWeight: '600' },
  saveText: { color: '#fff', fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  noSectionsTxt: { color: '#94A3B8', fontSize: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sectionRowTxt: { fontSize: 14, color: C.textDark },
  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
});
