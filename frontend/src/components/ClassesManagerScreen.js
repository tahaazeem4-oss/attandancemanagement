import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from './AppHeader';
import ImportExportBar from './ImportExportBar';
import PickerField from './PickerField';
import EntityEmptyState from './EntityEmptyState';
import ManagerSearchAddRow from './ManagerSearchAddRow';
import ModalFooterActions from './ModalFooterActions';

const EMPTY_CLASS = { class_name: '', school_id: '' };

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
  const [form, setForm] = useState({ ...EMPTY_CLASS });
  const [target, setTarget] = useState(null);
  const [sections, setSections] = useState([]);
  const [newSection, setNewSection] = useState('');
  const [editingSection, setEditingSection] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState('');

  // Load campuses and organizations
  const loadCampuses = useCallback(async () => {
    if (isSuper) {
      try {
        const [sRes, oRes] = await Promise.all([
          api.get('/super-admin/schools'),
          api.get('/super-admin/organizations').catch(() => ({ data: [] })),
        ]);
        const allCampuses = sRes.data || [];
        const filtered = filterOrg ? allCampuses.filter(c => String(c.org_id) === String(filterOrg)) : allCampuses;
        setCampuses(filtered);
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

  // Load classes
  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      let result = [];
      if (isSuper && filterCampus) {
        const { data } = await api.get(`/super-admin/schools/${filterCampus}/classes`);
        result = Array.isArray(data) ? data : [];
      } else if (isOrg) {
        const params = filterCampus ? { campus_id: filterCampus } : {};
        const { data } = await api.get('/org-admin/classes', { params });
        result = data || [];
      } else {
        const { data } = await api.get('/admin/classes');
        result = Array.isArray(data) ? data : [];
      }
      setClasses(result);
    } catch {
      Alert.alert('Error', 'Could not load classes');
      setClasses([]);
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

  // Add/Edit class
  const openAddClass = () => {
    setEditingClass(null);
    setForm({ ...EMPTY_CLASS });
    setClassModal(true);
  };

  const openEditClass = (item) => {
    setEditingClass(item);
    setForm({
      class_name: item.class_name || '',
      school_id: String(item.school_id || ''),
    });
    setClassModal(true);
  };

  const handleSaveClass = async () => {
    if (!form.class_name.trim()) {
      Alert.alert('Validation', 'Class name is required.');
      return;
    }
    if ((isOrg || isSuper) && !editingClass && !form.school_id) {
      Alert.alert('Validation', 'Please select a campus.');
      return;
    }

    setSaving(true);
    try {
      if (editingClass) {
        if (isSuper) {
          const schoolId = editingClass.school_id || form.school_id || filterCampus;
          await api.put(`/super-admin/schools/${schoolId}/classes/${editingClass.id}`, {
            class_name: form.class_name.trim(),
          });
        } else if (isOrg) {
          await api.put(`/org-admin/classes/${editingClass.id}`, {
            class_name: form.class_name.trim(),
          });
        } else {
          await api.put(`/admin/classes/${editingClass.id}`, {
            class_name: form.class_name.trim(),
          });
        }
      } else {
        if (isSuper) {
          await api.post(`/super-admin/schools/${form.school_id}/classes`, {
            class_name: form.class_name.trim(),
          });
        } else if (isOrg) {
          await api.post('/org-admin/classes', {
            class_name: form.class_name.trim(),
            school_id: parseInt(form.school_id, 10),
          });
        } else {
          await api.post('/admin/classes', {
            class_name: form.class_name.trim(),
          });
        }
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
    Alert.alert('Delete Class', `Delete "${item.class_name}"?`, [
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

  // Section management
  const openDetails = (item) => {
    setTarget(item);
    setSections(item.sections || []);
    setNewSection('');
    setEditingSection(null);
    setEditingSectionName('');
    setDetailModal(true);
  };

  const handleSaveSection = async () => {
    if (!newSection.trim()) {
      Alert.alert('Validation', 'Section name is required.');
      return;
    }
    if (!target?.id) return;

    setSaving(true);
    try {
      if (editingSection?.id) {
        if (isSuper) {
          await api.put(
            `/super-admin/schools/${target.school_id || filterCampus}/sections/${editingSection.id}`,
            { section_name: editingSectionName.trim() }
          );
        } else if (isOrg) {
          await api.put(`/org-admin/sections/${editingSection.id}`, {
            section_name: editingSectionName.trim(),
          });
        } else {
          await api.put(`/admin/sections/${editingSection.id}`, {
            section_name: editingSectionName.trim(),
          });
        }
        setEditingSection(null);
        setEditingSectionName('');
      } else {
        if (isSuper) {
          await api.post(
            `/super-admin/schools/${target.school_id || filterCampus}/classes/${target.id}/sections`,
            { section_name: newSection.trim() }
          );
        } else if (isOrg) {
          await api.post('/org-admin/sections', {
            section_name: newSection.trim(),
            class_id: target.id,
          });
        } else {
          await api.post(`/admin/classes/${target.id}/sections`, {
            section_name: newSection.trim(),
          });
        }
        setNewSection('');
      }

      // Reload target
      const endpoint = isSuper
        ? `/super-admin/schools/${target.school_id || filterCampus}/classes/${target.id}`
        : isOrg
          ? `/org-admin/classes/${target.id}`
          : `/admin/classes/${target.id}`;
      const { data } = await api.get(endpoint);
      setTarget(data);
      setSections(data.sections || []);
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
            if (target?.id) {
              const reloadEndpoint = isSuper
                ? `/super-admin/schools/${target.school_id || filterCampus}/classes/${target.id}`
                : isOrg
                  ? `/org-admin/classes/${target.id}`
                  : `/admin/classes/${target.id}`;
              const { data } = await api.get(reloadEndpoint);
              setTarget(data);
              setSections(data.sections || []);
            }
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete section.');
          }
        },
      },
    ]);
  };

  const orgItems = [
    { label: 'All Organizations', value: '' },
    ...organizations.map(o => ({ label: o.name, value: String(o.id) })),
  ];
  const campusItems = [
    { label: 'All Campuses', value: '' },
    ...campuses.map(c => ({ label: c.name, value: String(c.id) })),
  ];

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

      {isSuper && (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField
            label=""
            value={filterOrg}
            onChange={setFilterOrg}
            items={orgItems}
            placeholder="Filter by organization"
          />
        </View>
      )}

      {(isOrg || isSuper) && (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField
            label=""
            value={filterCampus}
            onChange={setFilterCampus}
            items={campusItems}
            placeholder="Filter by campus"
          />
        </View>
      )}

      {(isOrg || isSuper) ? (
        filterCampus && (
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
        )
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
        <ActivityIndicator color={C.primary} size="large" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={visibleClasses}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={
            <EntityEmptyState
              icon="library-outline"
              title="No classes found"
              subtitle="Create your first class to get started"
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              onPress={() => openDetails(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Ionicons name="library-outline" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.class_name}</Text>
                  {(isOrg || isSuper) && (item.campus_name || item.school_name || item.name) && (
                    <Text style={styles.cardMeta}>
                      {item.campus_name || item.school_name || item.name}
                    </Text>
                  )}
                </View>
              </View>
              {item.sections && item.sections.length > 0 && (
                <View style={styles.sectionsRow}>
                  {item.sections.map(sec => (
                    <View key={sec.id} style={styles.sectionTag}>
                      <Text style={styles.sectionTagText}>{sec.section_name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      {/* Add/Edit Class Modal */}
      <Modal visible={classModal} animationType="slide" transparent onRequestClose={() => setClassModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingClass ? 'Edit Class' : 'Add Class'}</Text>

            <Text style={styles.label}>Class Name *</Text>
            <TextInput
              style={styles.input}
              value={form.class_name}
              onChangeText={v => setForm(p => ({ ...p, class_name: v }))}
              placeholder="e.g. Grade 6"
            />

            {(isOrg || isSuper) && !editingClass && (
              <>
                <Text style={styles.label}>Campus *</Text>
                <PickerField
                  label=""
                  value={form.school_id}
                  onChange={v => setForm(p => ({ ...p, school_id: v }))}
                  items={campuses.map(c => ({ label: c.name, value: String(c.id) }))}
                  placeholder="Select campus"
                />
              </>
            )}

            <ModalFooterActions
              onCancel={() => setClassModal(false)}
              onConfirm={handleSaveClass}
              loading={saving}
            />
          </View>
        </View>
      </Modal>

      {/* Class Details Modal */}
      <Modal
        visible={detailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailModal(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Class Details</Text>

            <ScrollView style={styles.detailsScroll}>
              <Text style={styles.label}>Class Name</Text>
              <TextInput
                style={styles.input}
                value={target?.class_name || ''}
                placeholder="Class name"
                editable={false}
              />

              <Text style={styles.sectionHeader}>Sections</Text>
              {sections.length === 0 ? (
                <Text style={styles.emptyText}>No sections yet</Text>
              ) : (
                sections.map(sec => (
                  <View key={sec.id} style={styles.sectionRow}>
                    {editingSection?.id === sec.id ? (
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        value={editingSectionName}
                        onChangeText={setEditingSectionName}
                        autoFocus
                      />
                    ) : (
                      <Text style={styles.sectionName}>{sec.section_name}</Text>
                    )}
                    <View style={styles.sectionActions}>
                      {editingSection?.id === sec.id ? (
                        <Pressable
                          style={styles.iconBtn}
                          onPress={handleSaveSection}
                          disabled={saving}
                        >
                          <Ionicons name="checkmark" size={16} color="#22C55E" />
                        </Pressable>
                      ) : (
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => {
                            setEditingSection(sec);
                            setEditingSectionName(sec.section_name);
                          }}
                        >
                          <Ionicons name="pencil" size={16} color="#2563EB" />
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.iconBtn}
                        onPress={() => handleDeleteSection(sec)}
                      >
                        <Ionicons name="trash" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Add Section</Text>
              <View style={styles.addSectionRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={newSection}
                  onChangeText={setNewSection}
                  placeholder="Section name"
                />
                <Pressable
                  style={[styles.iconBtn, { backgroundColor: C.primary, marginLeft: 8 }]}
                  onPress={handleSaveSection}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="add" size={20} color="#fff" />
                  )}
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setDetailModal(false)}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: '#DC2626' }]}
                onPress={() => handleDeleteClass(target)}
              >
                <Text style={styles.confirmBtnText}>Delete Class</Text>
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
  card: {
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.textDark },
  cardMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  sectionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  sectionTag: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionTagText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: C.textDark,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: C.textDark, marginTop: 16, marginBottom: 8 },
  detailsScroll: { maxHeight: 300, marginBottom: 12 },
  emptyText: { color: '#94A3B8', fontSize: 13, marginBottom: 12 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  sectionName: { flex: 1, fontSize: 14, color: C.textDark },
  sectionActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSectionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  cancelBtnText: { color: '#64748B', fontWeight: '600' },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
