import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, ScrollView, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C, S } from '../config/theme';
import ImportExportBar from './ImportExportBar';
import AppHeader from './AppHeader';
import PickerField from './PickerField';
import EntityEmptyState from './EntityEmptyState';
import ManagerSearchAddRow from './ManagerSearchAddRow';
import ModalFooterActions from './ModalFooterActions';
import { showDestructiveConfirm } from '../lib/confirmDialog';
import { buildImportExportScope, getImportExportBase } from '../lib/importExportScope';

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', phone: '', assignments: [], school_id: '', teacher_role: 'subject_teacher' };

const ROLE = {
  class_teacher: { label: 'Class Teacher', bg: '#ECFDF5', color: '#065F46' },
  floor_incharge: { label: 'Floor Incharge', bg: '#F5F3FF', color: '#5B21B6' },
  subject_teacher: { label: 'Subject Teacher', bg: '#FFFBEB', color: '#92400E' },
};

const ROLE_ITEMS = [
  { label: 'Class Teacher', value: 'class_teacher' },
  { label: 'Floor Incharge', value: 'floor_incharge' },
  { label: 'Subject Teacher', value: 'subject_teacher' },
];

const deriveRoleFromAssignments = (assignments = []) => {
  const n = Array.isArray(assignments) ? assignments.length : 0;
  if (n === 0) return 'subject_teacher';
  if (n === 1) return 'class_teacher';
  return 'floor_incharge';
};

function MultiAssignmentPicker({ classes, assignments, onChange }) {
  const [picking, setPicking] = useState(false);
  const [pickClass, setPickClass] = useState(null);
  const sections = pickClass ? (classes.find(c => c.id === pickClass)?.sections || []) : [];

  const add = (classId, sectionId) => {
    const cls = classes.find(c => c.id === classId);
    const sec = cls?.sections?.find(s => s.id === sectionId);
    if (!cls || !sec) return;
    if (assignments.some(a => a.class_id === classId && a.section_id === sectionId)) return;
    onChange([...assignments, { class_id: classId, section_id: sectionId, class_name: cls.class_name, section_name: sec.section_name }]);
    setPickClass(null);
    setPicking(false);
  };

  const remove = idx => onChange(assignments.filter((_, i) => i !== idx));

  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={S.label}>Class / Section Assignments</Text>
      <View style={{ gap: 6, marginBottom: 8 }}>
        {assignments.length === 0 && (
          <View style={mp.emptyTag}>
            <Text style={mp.emptyTagTxt}>No class/section assigned yet</Text>
          </View>
        )}
        {assignments.map((a, i) => (
          <View key={i} style={mp.tag}>
            <Text style={mp.tagTxt}>{a.class_name}  -  Sec {a.section_name}</Text>
            <Pressable onPress={() => remove(i)} hitSlop={8}>
              <Text style={mp.tagX}>X</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {picking ? (
        <View style={mp.pickerBox}>
          <Text style={[S.label, { marginBottom: 6 }]}>Select Class</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {classes.map(cls => (
              <Pressable key={cls.id} style={[mp.pill, pickClass === cls.id && mp.pillActive]} onPress={() => setPickClass(cls.id)}>
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
          <Text style={mp.addBtnTxt}>+ Add Class / Section</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function TeachersManagerScreen({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';
  const isSuper = mode === 'superadmin';

  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterCampus, setFilterCampus] = useState('');

  const [modal, setModal] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [newPw, setNewPw] = useState('');
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuper) {
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

        if (filterCampus) {
          const { data } = await api.get(`/super-admin/schools/${filterCampus}/teachers`);
          setTeachers(data || []);
        } else {
          // "All campuses" for super admin: aggregate teachers across scoped campuses.
          const scopedCampuses = filteredCampuses || [];
          if (!scopedCampuses.length) {
            setTeachers([]);
          } else {
            const responses = await Promise.all(
              scopedCampuses.map(campus =>
                api.get(`/super-admin/schools/${campus.id}/teachers`).catch(() => ({ data: [] })),
              ),
            );
            setTeachers(responses.flatMap(r => r.data || []));
          }
        }
      } else if (isOrg) {
        const params = filterCampus ? { campus_id: filterCampus } : {};
        const [tRes, cRes] = await Promise.all([
          api.get('/org-admin/teachers', { params }),
          api.get('/org-admin/campuses'),
        ]);
        setTeachers(tRes.data || []);
        setCampuses(cRes.data || []);
      } else {
        const [tRes, cRes] = await Promise.all([
          api.get('/admin/teachers'),
          api.get('/admin/classes'),
        ]);
        setTeachers(tRes.data || []);
        setClasses(cRes.data || []);
      }
    } catch {
      Alert.alert('Error', 'Could not load data');
    } finally {
      setLoading(false);
    }
  }, [isOrg, isSuper, filterCampus, filterOrg]);

  useEffect(() => {
    if (!isSuper) return;
    setFilterCampus('');
  }, [isSuper, filterOrg]);

  useEffect(() => {
    if (!(isSuper || isOrg)) return;
    if (!form.school_id) {
      setClasses([]);
      return;
    }

    if (isSuper) {
      api.get(`/super-admin/schools/${form.school_id}/classes`)
        .then(({ data }) => setClasses(data || []))
        .catch(() => setClasses([]));
    } else if (isOrg) {
      api.get('/org-admin/classes', { params: { campus_id: form.school_id } })
        .then(({ data }) => setClasses(data || []))
        .catch(() => setClasses([]));
    }
  }, [isSuper, isOrg, form.school_id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNewPw('');
    setShowCreatePw(false);
    setShowResetPw(false);
    setModal(true);
  };

  const openEdit = item => {
    setEditing(item);
    setForm({
      first_name: item.first_name || '',
      last_name: item.last_name || '',
      email: item.email || '',
      password: '',
      phone: item.phone || '',
      assignments: item.assignments || [],
      school_id: String(item.school_id || ''),
      teacher_role: item.teacher_role || deriveRoleFromAssignments(item.assignments || []),
    });
    setNewPw('');
    setShowCreatePw(false);
    setShowResetPw(false);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      return Alert.alert('Validation', 'First name, last name and email are required.');
    }
    if (!editing && !form.password) {
      return Alert.alert('Validation', 'Password is required for new teachers.');
    }
    if ((isOrg || isSuper) && !editing && !form.school_id) {
      return Alert.alert('Validation', 'Please select a campus.');
    }

    setSaving(true);
    try {
      if (isSuper) {
        const schoolId = editing ? (editing.school_id || form.school_id) : form.school_id;
        if (!schoolId) {
          setSaving(false);
          return Alert.alert('Validation', 'Please select a campus.');
        }

        if (editing) {
          await api.put(`/super-admin/schools/${schoolId}/teachers/${editing.id}`, {
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
            assignments: form.assignments,
            teacher_role: form.teacher_role,
          });
        } else {
          await api.post(`/super-admin/schools/${schoolId}/teachers`, {
            ...form,
            assignments: form.assignments,
            teacher_role: form.teacher_role,
          });
        }
      } else if (isOrg) {
        if (editing) {
          await api.put(`/org-admin/teachers/${editing.id}`, {
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
            assignments: form.assignments,
            teacher_role: form.teacher_role,
          });
        } else {
          await api.post('/org-admin/teachers', {
            ...form,
            school_id: parseInt(form.school_id, 10),
            assignments: form.assignments,
            teacher_role: form.teacher_role,
          });
        }
      } else if (editing) {
        await api.put(`/admin/teachers/${editing.id}`, {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          assignments: form.assignments,
          teacher_role: form.teacher_role,
        });
      } else {
        await api.post('/admin/teachers', { ...form, assignments: form.assignments, teacher_role: form.teacher_role });
      }
      setModal(false);
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save teacher');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = item => {
    showDestructiveConfirm({
      title: 'Delete Teacher',
      message: `Are you sure you want to delete ${item.first_name} ${item.last_name}? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const path = isSuper
            ? `/super-admin/schools/${item.school_id}/teachers/${item.id}`
            : isOrg
              ? `/org-admin/teachers/${item.id}`
              : `/admin/teachers/${item.id}`;
          await api.delete(path);
          await load();
        } catch (err) {
          Alert.alert('Error', err?.response?.data?.message || 'Could not delete');
        }
      },
    });
  };

  const handleResetPw = async target => {
    if (!newPw || newPw.length < 6) {
      return Alert.alert('Validation', 'Password must be at least 6 characters.');
    }
    setSaving(true);
    try {
      const id = target?.id || editing?.id;
      const schoolId = target?.school_id || editing?.school_id || form.school_id;
      const path = isSuper
        ? `/super-admin/schools/${schoolId}/teachers/${id}/reset-password`
        : isOrg
          ? `/org-admin/teachers/${id}/reset-password`
          : `/admin/teachers/${id}/reset-password`;
      await api.post(path, { new_password: newPw });
      Alert.alert('Done', 'Password reset successfully');
      setNewPw('');
      if (isOrg || isSuper) setResetModal(null);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not reset password');
    } finally {
      setSaving(false);
    }
  };

  const F = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const visible = teachers.filter(t => {
    const q = search.toLowerCase();
    return (
      String(t.first_name || '').toLowerCase().includes(q) ||
      String(t.last_name || '').toLowerCase().includes(q) ||
      String(t.email || '').toLowerCase().includes(q) ||
      String(t.phone || '').toLowerCase().includes(q) ||
      String(t.campus_name || '').toLowerCase().includes(q) ||
      String(t.school_name || '').toLowerCase().includes(q) ||
      String(t.org_name || '').toLowerCase().includes(q)
    );
  });

  const orgItems = [{ label: 'All Organizations', value: '' }, ...organizations.map(o => ({ label: o.name, value: String(o.id) }))];
  const campusItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];
  const ieBase = getImportExportBase(mode);
  const ieScope = buildImportExportScope({
    mode,
    campusId: filterCampus,
    requireCampusForScopedRoles: true,
  });

  return (
    <View style={styles.container}>
      <AppHeader title="Teachers" navigation={navigation} />

      <ManagerSearchAddRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search teachers..."
        onAddPress={openAdd}
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
        ieScope.showBar ? (
          <ImportExportBar
            templatePath={`${ieBase}/teachers/template`}
            templateParams={ieScope.params}
            importPath={`${ieBase}/teachers/import`}
            importFields={ieScope.params}
            exportPath={`${ieBase}/teachers/export`}
            exportParams={ieScope.params}
            exportFilename="teachers_export.xlsx"
            templateFilename="teachers_template.xlsx"
            onImportDone={load}
          />
        ) : null
      ) : (
        <ImportExportBar
          templatePath={`${ieBase}/teachers/template`}
          templateFilename="teachers_template.xlsx"
          importPath={`${ieBase}/teachers/import`}
          exportPath={`${ieBase}/teachers/export`}
          exportFilename="teachers_export.xlsx"
          onImportDone={load}
        />
      )}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={t => String(t.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={<EntityEmptyState icon="people-outline" title="No teachers found" subtitle="Add a teacher to begin assignments" />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]} onPress={() => openEdit(item)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(item.first_name?.[0] || '') + (item.last_name?.[0] || '')}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
                  {item.teacher_role && ROLE[item.teacher_role] && (
                    <View style={[styles.rolePill, { backgroundColor: ROLE[item.teacher_role].bg }]}>
                      <Text style={[styles.rolePillTxt, { color: ROLE[item.teacher_role].color }]}>{ROLE[item.teacher_role].label}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sub}>{item.email}</Text>
                {item.phone ? <Text style={styles.sub}>{item.phone}</Text> : null}
                {!!(item.campus_name || item.school_name) && <View style={styles.badge}><Text style={styles.badgeTxt}>{item.campus_name || item.school_name}</Text></View>}
              </View>
              <View style={styles.actionBtns}>
                <TouchableOpacity onPress={() => { setResetModal(item); setNewPw(''); setShowResetPw(false); }} style={styles.actionBtn}>
                  <Ionicons name="key-outline" size={17} color="#F59E0B" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                  <Ionicons name="pencil-outline" size={17} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, styles.actionBtnDanger]}>
                  <Ionicons name="trash-outline" size={17} color="#C2410C" />
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Teacher' : 'Add Teacher'}</Text>
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
              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => F('email', v)} />
              <Text style={styles.label}>Phone</Text>
              <TextInput style={styles.input} keyboardType="phone-pad" value={form.phone} onChangeText={v => F('phone', v)} />

              {!editing && (
                <>
                  <Text style={styles.label}>Password *</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput style={[styles.input, styles.passwordInput]} secureTextEntry={!showCreatePw} value={form.password} onChangeText={v => F('password', v)} />
                    <Pressable onPress={() => setShowCreatePw(p => !p)} style={styles.eyeToggle} hitSlop={8}>
                      <Ionicons name={showCreatePw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                    </Pressable>
                  </View>
                </>
              )}

              {(isOrg || isSuper) && !editing && (
                <>
                  <Text style={styles.label}>Campus *</Text>
                  <PickerField label="" value={form.school_id} onChange={v => F('school_id', v)} items={campuses.map(c => ({ label: c.name, value: String(c.id) }))} placeholder="Select campus" />
                </>
              )}

              <Text style={styles.label}>Teacher Role *</Text>
              <PickerField
                label=""
                value={form.teacher_role}
                onChange={v => F('teacher_role', v)}
                items={ROLE_ITEMS}
                placeholder="Select role"
              />

              <MultiAssignmentPicker classes={classes} assignments={form.assignments} onChange={v => F('assignments', v)} />

              {editing && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Reset Password</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput style={[styles.input, styles.passwordInput]} placeholder="New password (min 6)" secureTextEntry={!showResetPw} value={newPw} onChangeText={setNewPw} />
                    <Pressable onPress={() => setShowResetPw(p => !p)} style={styles.eyeToggle} hitSlop={8}>
                      <Ionicons name={showResetPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                    </Pressable>
                  </View>
                  <Pressable style={[styles.modalBtn, { backgroundColor: '#D97706', marginTop: 8 }]} onPress={() => handleResetPw(editing)} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Reset Password</Text>}
                  </Pressable>

                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Danger Zone</Text>
                  <Pressable style={[styles.modalBtn, styles.dangerModalBtn, { marginTop: 8 }]} onPress={() => { const cur = editing; setModal(false); handleDelete(cur); }}>
                    <Text style={styles.dangerModalBtnText}>Delete Teacher</Text>
                  </Pressable>
                </>
              )}

              <ModalFooterActions onCancel={() => setModal(false)} onConfirm={handleSave} loading={saving} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!resetModal} animationType="slide" transparent onRequestClose={() => setResetModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard2}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.sub}>{resetModal?.first_name} {resetModal?.last_name}</Text>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput style={[styles.input, styles.passwordInput]} value={newPw} onChangeText={setNewPw} secureTextEntry={!showResetPw} placeholder="Enter new password" />
              <Pressable onPress={() => setShowResetPw(p => !p)} style={styles.eyeToggle} hitSlop={8}>
                <Ionicons name={showResetPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <ModalFooterActions
              onCancel={() => setResetModal(null)}
              onConfirm={() => handleResetPw(resetModal)}
              confirmText="Reset"
              loading={saving}
            />
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
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  avatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: C.primary, fontWeight: '800', fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700', color: C.textDark },
  sub: { fontSize: 12, color: C.textLight, marginTop: 1 },
  rolePill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  rolePillTxt: { fontSize: 10, fontWeight: '700' },
  eyeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  actionBtnDanger: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
  badge: { marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  empty: { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab: { position: 'absolute', bottom: 24, right: 20, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalCard2: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeToggle: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerModalBtn: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
  cancelBtn: { backgroundColor: C.border },
  saveBtn: { backgroundColor: C.primary },
  cancelBtnText: { color: C.textMed, fontWeight: '700' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  dangerModalBtnText: { color: '#9A3412', fontWeight: '800' },
  cancelBtn2: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelTxt: { color: '#64748B', fontWeight: '600' },
  saveBtn2: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700' },
});

const mp = StyleSheet.create({
  emptyTag: { backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, alignItems: 'center' },
  emptyTagTxt: { color: '#92400E', fontSize: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tagTxt: { fontSize: 13, fontWeight: '600', color: C.primary, flex: 1 },
  tagX: { fontSize: 14, color: C.textMed, fontWeight: '700', marginLeft: 8 },
  pickerBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  pill: { backgroundColor: '#F1F5F9', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: C.border },
  pillActive: { backgroundColor: C.primary, borderColor: C.primary },
  pillTxt: { color: C.textMed, fontSize: 13, fontWeight: '600' },
  pillTxtActive: { color: '#fff' },
  addBtn: { borderStyle: 'dashed', borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  addBtnTxt: { color: C.primary, fontWeight: '700', fontSize: 13 },
  cancelBtn: { marginTop: 8, padding: 8, alignItems: 'center' },
  cancelBtnTxt: { color: C.textMed, fontSize: 13 },
});