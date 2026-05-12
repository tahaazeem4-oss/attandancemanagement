import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C, S } from '../config/theme';
import PickerField from './PickerField';
import ImportExportBar from './ImportExportBar';
import AppHeader from './AppHeader';
import EntityEmptyState from './EntityEmptyState';
import ManagerSearchAddRow from './ManagerSearchAddRow';
import ModalFooterActions from './ModalFooterActions';

const EMPTY_FORM = { first_name: '', last_name: '', age: '', class_id: '', section_id: '', roll_no: '', school_id: '' };

export default function StudentsManagerScreen({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';
  const isSuper = mode === 'superadmin';

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  const [filter, setFilter] = useState({ class_id: '', section_id: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');

  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newPw, setNewPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalSections, setModalSections] = useState([]);
  const [formClasses, setFormClasses] = useState([]);
  const [formSections, setFormSections] = useState([]);

  useEffect(() => {
    if (isSuper) {
      Promise.all([
        api.get('/super-admin/schools'),
        api.get('/super-admin/organizations').catch(() => ({ data: [] })),
      ])
        .then(([sRes, oRes]) => {
          setCampuses(sRes.data || []);
          setOrganizations(oRes.data || []);
        })
        .catch(() => {});
    } else if (isOrg) {
      api.get('/org-admin/campuses').then(({ data }) => setCampuses(data || [])).catch(() => {});
    } else {
      api.get('/classes').then(({ data }) => setClasses(data || [])).catch(() => {});
    }
  }, [isOrg, isSuper]);

  useEffect(() => {
    if (!isSuper) return;
    api.get('/super-admin/schools')
      .then(({ data }) => {
        const allCampuses = data || [];
        const filteredCampuses = filterOrg
          ? allCampuses.filter(c => String(c.org_id) === String(filterOrg))
          : allCampuses;
        setCampuses(filteredCampuses);
      })
      .catch(() => setCampuses([]));
    setFilterCampus('');
    setFilterClass('');
    setFilterSection('');
  }, [isSuper, filterOrg]);

  useEffect(() => {
    if (isSuper) {
      if (filterCampus) {
        api.get(`/super-admin/schools/${filterCampus}/classes`)
          .then(({ data }) => setClasses(data || []))
          .catch(() => setClasses([]));
      } else {
        setClasses([]);
      }
      setFilterClass('');
      setFilterSection('');
    } else if (isOrg) {
      if (filterCampus) {
        api.get('/org-admin/classes', { params: { campus_id: filterCampus } })
          .then(({ data }) => setClasses(data || []))
          .catch(() => setClasses([]));
      } else {
        setClasses([]);
      }
      setFilterClass('');
      setFilterSection('');
    }
  }, [isOrg, isSuper, filterCampus]);

  useEffect(() => {
    if (isSuper || isOrg) {
      if (filterClass) {
        const cls = classes.find(c => String(c.id) === String(filterClass));
        setSections(cls?.sections || []);
      } else {
        setSections([]);
      }
      setFilterSection('');
    }
  }, [isOrg, isSuper, filterClass, classes]);

  useEffect(() => {
    if (isOrg || isSuper) return;
    if (filter.class_id) {
      api.get(`/classes/${filter.class_id}/sections`).then(({ data }) => setSections(data || [])).catch(() => {});
    } else {
      setSections([]);
    }
  }, [isOrg, filter.class_id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuper) {
        if (!filterCampus) {
          setStudents([]);
        } else {
          const params = {};
          if (filterClass) params.class_id = filterClass;
          if (filterSection) params.section_id = filterSection;
          const { data } = await api.get(`/super-admin/schools/${filterCampus}/students`, { params });
          setStudents(data || []);
        }
      } else if (isOrg) {
        const params = {};
        if (filterCampus) params.campus_id = filterCampus;
        if (filterClass) params.class_id = filterClass;
        if (filterSection) params.section_id = filterSection;
        const { data } = await api.get('/org-admin/students', { params });
        setStudents(data || []);
      } else {
        const params = {};
        if (filter.class_id) params.class_id = filter.class_id;
        if (filter.section_id) params.section_id = filter.section_id;
        const { data } = await api.get('/admin/students', { params });
        setStudents(data || []);
      }
    } catch {
      Alert.alert('Error', 'Could not load students');
    } finally {
      setLoading(false);
    }
  }, [isOrg, isSuper, filter, filterCampus, filterClass, filterSection]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isSuper) {
      if (form.school_id) {
        api.get(`/super-admin/schools/${form.school_id}/classes`)
          .then(({ data }) => setFormClasses(data || []))
          .catch(() => setFormClasses([]));
      } else {
        setFormClasses([]);
      }
      setForm(p => ({ ...p, class_id: '', section_id: '' }));
      return;
    }

    if (isOrg) {
      if (form.school_id) {
        api.get('/org-admin/classes', { params: { campus_id: form.school_id } })
          .then(({ data }) => setFormClasses(data || []))
          .catch(() => setFormClasses([]));
      } else {
        setFormClasses([]);
      }
      setForm(p => ({ ...p, class_id: '', section_id: '' }));
      return;
    }

    if (form.class_id) {
      api.get(`/classes/${form.class_id}/sections`).then(({ data }) => setModalSections(data || [])).catch(() => {});
    } else {
      setModalSections([]);
    }
  }, [isOrg, isSuper, form.school_id, form.class_id]);

  useEffect(() => {
    if (!(isOrg || isSuper)) return;
    if (form.class_id) {
      const cls = formClasses.find(c => String(c.id) === String(form.class_id));
      setFormSections(cls?.sections || []);
    } else {
      setFormSections([]);
    }
    setForm(p => ({ ...p, section_id: '' }));
  }, [isOrg, isSuper, form.class_id, formClasses]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNewPw('');
    setShowResetPw(false);
    setModal(true);
  };

  const openEdit = item => {
    setEditing(item);
    setForm({
      first_name: item.first_name || '',
      last_name: item.last_name || '',
      age: item.age ? String(item.age) : '',
      class_id: String(item.class_id || ''),
      section_id: String(item.section_id || ''),
      roll_no: item.roll_no || '',
      school_id: String(item.school_id || ''),
    });
    setNewPw('');
    setShowResetPw(false);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) return Alert.alert('Validation', 'Name is required.');
    if (isSuper || isOrg) {
      if (!editing && !form.school_id) return Alert.alert('Validation', 'Please select a campus.');
      if (!form.class_id) return Alert.alert('Validation', 'Please select a class.');
      if (!form.section_id) return Alert.alert('Validation', 'Please select a section.');
    } else if (!form.age || !form.class_id || !form.section_id) {
      return Alert.alert('Validation', 'All fields except roll number are required.');
    }

    setSaving(true);
    try {
      if (isSuper) {
        const schoolId = editing ? (editing.school_id || form.school_id) : form.school_id;
        if (!schoolId) {
          setSaving(false);
          return Alert.alert('Validation', 'Please select a campus.');
        }

        const payload = {
          first_name: form.first_name,
          last_name: form.last_name,
          age: form.age ? parseInt(form.age, 10) : null,
          roll_no: form.roll_no || null,
          class_id: parseInt(form.class_id, 10),
          section_id: parseInt(form.section_id, 10),
        };

        if (editing) await api.put(`/super-admin/schools/${schoolId}/students/${editing.id}`, payload);
        else await api.post(`/super-admin/schools/${schoolId}/students`, payload);
      } else if (isOrg) {
        const payload = {
          first_name: form.first_name,
          last_name: form.last_name,
          age: form.age ? parseInt(form.age, 10) : null,
          roll_no: form.roll_no || null,
          school_id: parseInt(form.school_id, 10),
          class_id: parseInt(form.class_id, 10),
          section_id: parseInt(form.section_id, 10),
        };
        if (editing) await api.put(`/org-admin/students/${editing.id}`, payload);
        else await api.post('/org-admin/students', payload);
      } else {
        const payload = { ...form, age: parseInt(form.age, 10) };
        if (editing) await api.put(`/admin/students/${editing.id}`, payload);
        else await api.post('/admin/students', payload);
      }
      setModal(false);
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save student.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = item => {
    Alert.alert('Delete Student', `Delete ${item.first_name} ${item.last_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const path = isSuper
              ? `/super-admin/schools/${item.school_id}/students/${item.id}`
              : isOrg
                ? `/org-admin/students/${item.id}`
                : `/admin/students/${item.id}`;
            await api.delete(path);
            await load();
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete');
          }
        },
      },
    ]);
  };

  const handleResetPw = async () => {
    if (!newPw || newPw.length < 6) return Alert.alert('Validation', 'Password must be at least 6 characters.');
    setSaving(true);
    try {
      if (isSuper) {
        const schoolId = editing?.school_id || form.school_id;
        await api.post(`/super-admin/schools/${schoolId}/students/${editing.id}/reset-password`, { new_password: newPw });
      } else {
        await api.post(`/admin/students/${editing.id}/reset-password`, { new_password: newPw });
      }
      Alert.alert('Done', 'Password reset successfully');
      setNewPw('');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const F = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedClassObj = classes.find(c => String(c.id) === String(filter.class_id));
  const selectedSectionObj = sections.find(s => String(s.id) === String(filter.section_id));

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return (
      String(s.first_name || '').toLowerCase().includes(q) ||
      String(s.last_name || '').toLowerCase().includes(q) ||
      String(s.roll_no || '').toLowerCase().includes(q) ||
      String(s.campus_name || '').toLowerCase().includes(q) ||
      String(s.class_name || '').toLowerCase().includes(q) ||
      String(s.school_name || '').toLowerCase().includes(q) ||
      String(s.org_name || '').toLowerCase().includes(q)
    );
  });

  const orgItems = [{ label: 'All Organizations', value: '' }, ...organizations.map(o => ({ label: o.name, value: String(o.id) }))];
  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];
  const classFilterItems = [{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))];
  const sectionFilterItems = [{ label: 'All Sections', value: '' }, ...sections.map(s => ({ label: s.section_name, value: String(s.id) }))];

  return (
    <View style={styles.container}>
      <AppHeader title="Students" navigation={navigation} />

      <ManagerSearchAddRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search students..."
        onAddPress={openAdd}
      />

      {(isOrg || isSuper) ? (
        <>
          {isSuper ? (
            <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
              <PickerField label="" value={filterOrg} onChange={setFilterOrg} items={orgItems} placeholder="Filter by organization" />
            </View>
          ) : null}
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
          {(isOrg || isSuper) ? (
            filterCampus ? (
              <ImportExportBar
                templatePath="/import-export/students/template"
                templateParams={{ campus_id: filterCampus }}
                importPath="/import-export/students/import"
                importFields={{ campus_id: filterCampus }}
                exportPath="/import-export/students/export"
                exportParams={{ campus_id: filterCampus }}
                exportFilename="students_export.xlsx"
                templateFilename="students_template.xlsx"
                onImportDone={load}
              />
            ) : null
          ) : null}
        </>
      ) : (
        <>
          <ImportExportBar
            templatePath="/import-export/students/template"
            templateFilename="students_template.xlsx"
            importPath="/import-export/students/import"
            exportPath="/import-export/students/export"
            exportFilename="students_export.xlsx"
            onImportDone={load}
          />
          <View style={styles.filterBar}>
            <View style={styles.filterHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterTitle}>Student Filters</Text>
                <Text style={styles.filterSubTitle}>
                  {selectedClassObj?.class_name || 'All Classes'}
                  {selectedSectionObj ? `  -  Section ${selectedSectionObj.section_name}` : '  -  All Sections'}
                </Text>
              </View>
              <Pressable style={({ pressed }) => [styles.filterToggleBtn, pressed && { opacity: 0.8 }]} onPress={() => setFiltersOpen(v => !v)}>
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

                <Pressable style={({ pressed }) => [styles.clearFilterBtn, pressed && { opacity: 0.8 }]} onPress={() => setFilter({ class_id: '', section_id: '' })}>
                  <Text style={styles.clearFilterTxt}>Clear Filters</Text>
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={s => String(s.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={<EntityEmptyState icon="school-outline" title="No students found" subtitle="Add students or adjust filters" />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]} onPress={() => openEdit(item)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(item.first_name?.[0] || '') + (item.last_name?.[0] || '')}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
                <Text style={styles.sub}>
                  {item.class_name}{item.section_name ? ` - Sec ${item.section_name}` : ''}
                  {item.roll_no ? `  -  #${item.roll_no}` : ''}
                </Text>
                {!isOrg && !isSuper && item.has_account > 0 && <Text style={styles.accountBadge}>Portal account</Text>}
                {(item.campus_name || item.school_name) ? <View style={styles.badge}><Text style={styles.badgeTxt}>{item.campus_name || item.school_name}</Text></View> : null}
              </View>
              <View style={styles.actionBtns}>
                {!isOrg ? (
                  <TouchableOpacity onPress={() => { openEdit(item); setShowResetPw(false); setNewPw(''); }} style={styles.actionBtn}><Ionicons name="key-outline" size={17} color="#F59E0B" /></TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}><Ionicons name="pencil-outline" size={17} color="#2563EB" /></TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}><Ionicons name="trash-outline" size={17} color="#EF4444" /></TouchableOpacity>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Student' : 'Add Student'}</Text>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>First Name *</Text>
                  <TextInput style={styles.input} value={form.first_name} onChangeText={v => F('first_name', v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Last Name *</Text>
                  <TextInput style={styles.input} value={form.last_name} onChangeText={v => F('last_name', v)} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Age{isOrg ? '' : ' *'}</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={form.age} onChangeText={v => F('age', v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Roll No</Text>
                  <TextInput style={styles.input} value={form.roll_no} onChangeText={v => F('roll_no', v)} />
                </View>
              </View>

              {(isOrg || isSuper) && (
                <>
                  <Text style={styles.label}>Campus *</Text>
                  <PickerField label="" value={form.school_id} onChange={v => F('school_id', v)} items={campuses.map(c => ({ label: c.name, value: String(c.id) }))} placeholder="Select campus" />
                </>
              )}

              <Text style={styles.label}>Class *</Text>
              <PickerField
                label="Class"
                value={form.class_id}
                onChange={v => F('class_id', v)}
                placeholder="Select class"
                items={((isOrg || isSuper) ? formClasses : classes).map(c => ({ label: c.class_name, value: String(c.id) }))}
              />

              <Text style={[styles.label, { marginTop: 6 }]}>Section *</Text>
              <PickerField
                label="Section"
                value={form.section_id}
                onChange={v => F('section_id', v)}
                placeholder="Select section"
                disabled={!form.class_id}
                items={((isOrg || isSuper) ? formSections : modalSections).map(s => ({ label: (isOrg || isSuper) ? s.section_name : `Section ${s.section_name}`, value: String(s.id) }))}
              />

              {!isOrg && !isSuper && editing && (
                <View style={styles.idMapBox}>
                  <Text style={styles.idMapTitle}>Mapped Account</Text>
                  <View style={styles.idMapRow}>
                    <Text style={styles.idMapText}>Email: {editing.account_email || 'No portal account mapped'}</Text>
                  </View>
                </View>
              )}

              {editing && (isSuper || (!isOrg && editing.has_account > 0)) && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Reset Password</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput style={[styles.input, styles.passwordInput]} placeholder="New password (min 6)" secureTextEntry={!showResetPw} value={newPw} onChangeText={setNewPw} />
                    <Pressable onPress={() => setShowResetPw(p => !p)} style={styles.eyeToggle} hitSlop={8}>
                      <Ionicons name={showResetPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                    </Pressable>
                  </View>
                  <Pressable style={[styles.modalBtn, { backgroundColor: '#D97706', marginTop: 8 }]} onPress={handleResetPw} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Reset Password</Text>}
                  </Pressable>
                </>
              )}

              {editing && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Danger Zone</Text>
                  <Pressable style={[styles.modalBtn, { backgroundColor: '#DC2626', marginTop: 8 }]} onPress={() => { const cur = editing; setModal(false); handleDelete(cur); }}>
                    <Text style={styles.saveBtnText}>Delete Student</Text>
                  </Pressable>
                </>
              )}

              <ModalFooterActions onCancel={() => setModal(false)} onConfirm={handleSave} loading={saving} />
            </View>
          </ScrollView>
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
  filterBar: { padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  filterHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterTitle: { fontSize: 14, fontWeight: '800', color: C.textDark },
  filterSubTitle: { fontSize: 12, color: C.textMed, marginTop: 2 },
  filterToggleBtn: { backgroundColor: '#EEF2FF', borderColor: '#BFDBFE', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  filterToggleTxt: { color: C.primary, fontSize: 12, fontWeight: '800' },
  filterPanel: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  fieldLabel: { fontSize: 12, color: C.textMed, fontWeight: '700', marginBottom: 4, marginTop: 6 },
  clearFilterBtn: { alignSelf: 'flex-end', marginTop: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  clearFilterTxt: { color: '#334155', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  avatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: C.primary, fontWeight: '800', fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700', color: C.textDark },
  sub: { fontSize: 12, color: C.textLight, marginTop: 1 },
  accountBadge: { fontSize: 10, color: '#059669', fontWeight: '700', marginTop: 2 },
  eyeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  badge: { marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  empty: { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab: { position: 'absolute', bottom: 24, right: 20, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeToggle: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  idMapBox: { marginTop: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 },
  idMapTitle: { fontSize: 11, color: C.textMed, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  idMapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idMapText: { fontSize: 12, color: C.textDark, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn: { backgroundColor: C.border },
  saveBtn: { backgroundColor: C.primary },
  cancelBtnText: { color: C.textMed, fontWeight: '700' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});