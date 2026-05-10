import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import api from '../../services/api';
import { C, S } from '../../config/theme';
import AppHeader from '../../components/AppHeader';

// ── Searchable Picker Modal ───────────────────────────────────
function SearchPickerModal({ visible, title, items, labelKey = 'name', onSelect, onClose, emptyText = 'No items found' }) {
  const [query, setQuery] = useState('');

  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  const filtered = useMemo(() =>
    items.filter(i => (i[labelKey] || '').toLowerCase().includes(query.toLowerCase())),
    [items, query, labelKey]
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sp.overlay}>
        <View style={sp.sheet}>
          <View style={sp.header}>
            <Text style={sp.title}>{title}</Text>
            <Pressable onPress={onClose} style={sp.closeBtn}>
              <Text style={sp.closeTxt}>✕</Text>
            </Pressable>
          </View>
          <View style={sp.searchRow}>
            <Text style={sp.searchIcon}>🔍</Text>
            <TextInput
              style={sp.searchInput}
              placeholder="Search..."
              placeholderTextColor={C.textLight}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')}>
                <Text style={sp.clearTxt}>✕</Text>
              </Pressable>
            )}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={item => String(item.id)}
            style={sp.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={sp.empty}>
                <Text style={sp.emptyTxt}>{emptyText}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [sp.item, pressed && sp.itemPressed]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <View style={sp.itemAvatar}>
                  <Text style={sp.itemAvatarTxt}>
                    {(item[labelKey] || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={sp.itemTxt}>{item[labelKey]}</Text>
                <Text style={sp.itemArrow}>›</Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Dropdown Button ───────────────────────────────────────────
function DropdownBtn({ label, value, onPress, placeholder = 'Tap to select', light = false }) {
  return (
    <Pressable
      style={({ pressed }) => [light ? dd.btnLight : dd.btn, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={light ? dd.labelLight : dd.label}>{label}</Text>
        <Text style={[light ? dd.valueLight : dd.value, !value && (light ? dd.placeholderLight : dd.placeholder)]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </View>
      <Text style={light ? dd.arrowLight : dd.arrow}>⌄</Text>
    </Pressable>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────
function ConfirmModal({ visible, title, message, actionLabel = 'Delete', onCancel, onConfirm, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={confirm.overlay}>
        <View style={confirm.box}>
          <Text style={confirm.icon}>⚠️</Text>
          <Text style={confirm.title}>{title}</Text>
          <Text style={confirm.msg}>{message}</Text>
          <View style={confirm.row}>
            <Pressable style={confirm.cancel} onPress={onCancel} disabled={loading}>
              <Text style={confirm.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable style={confirm.action} onPress={onConfirm} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={confirm.actionTxt}>{actionLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Role config ───────────────────────────────────────────────
const ROLE = {
  class_teacher:   { label: 'Class Teacher',   bg: '#ECFDF5', color: '#065F46' },
  floor_incharge:  { label: 'Floor Incharge',  bg: '#F5F3FF', color: '#5B21B6' },
  subject_teacher: { label: 'Subject Teacher', bg: '#FFFBEB', color: '#92400E' },
};

// ── Multi-Assignment Picker ───────────────────────────────────
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
          <View style={map.emptyTag}>
            <Text style={map.emptyTagTxt}>No assignment — Subject Teacher</Text>
          </View>
        )}
        {assignments.map((a, i) => (
          <View key={i} style={map.tag}>
            <Text style={map.tagTxt}>{a.class_name}  ·  Sec {a.section_name}</Text>
            <Pressable onPress={() => remove(i)} hitSlop={8}>
              <Text style={map.tagX}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {picking ? (
        <View style={map.pickerBox}>
          <Text style={[S.label, { marginBottom: 6 }]}>Select Class</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {classes.map(cls => (
              <Pressable
                key={cls.id}
                style={[picker.pill, pickClass === cls.id && picker.pillActive]}
                onPress={() => setPickClass(cls.id)}
              >
                <Text style={[picker.pillTxt, pickClass === cls.id && picker.pillTxtActive]}>{cls.class_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {pickClass !== null && sections.length > 0 && (
            <>
              <Text style={[S.label, { marginBottom: 6 }]}>Select Section</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {sections.map(sec => (
                  <Pressable key={sec.id} style={picker.pill} onPress={() => add(pickClass, sec.id)}>
                    <Text style={picker.pillTxt}>{sec.section_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <Pressable onPress={() => { setPicking(false); setPickClass(null); }} style={map.cancelBtn}>
            <Text style={map.cancelBtnTxt}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={map.addBtn} onPress={() => setPicking(true)}>
          <Text style={map.addBtnTxt}>＋  Add Class / Section</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Add Teacher Modal ─────────────────────────────────────────
function AddTeacherModal({ visible, schoolId, classes, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', password: '', assignments: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setForm({ first_name: '', last_name: '', email: '', phone: '', password: '', assignments: [] }); setError(''); }
  }, [visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('First and last name are required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!form.password || form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError('');
    try {
      await api.post(`/super-admin/schools/${schoolId}/teachers`, {
        first_name:  form.first_name.trim(),
        last_name:   form.last_name.trim(),
        email:       form.email.trim().toLowerCase(),
        phone:       form.phone.trim() || null,
        password:    form.password,
        assignments: form.assignments,
      });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add teacher.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <View style={modal.headerRow}>
            <Text style={modal.title}>Add Teacher</Text>
            <Pressable onPress={onClose}><Text style={modal.close}>✕</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '90%' }}>
            {!!error && <Text style={modal.error}>{error}</Text>}
            <View style={modal.row2}>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>First Name *</Text>
                <TextInput style={S.input} value={form.first_name} onChangeText={v => setF('first_name', v)} placeholder="First" placeholderTextColor={C.textLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Last Name *</Text>
                <TextInput style={S.input} value={form.last_name} onChangeText={v => setF('last_name', v)} placeholder="Last" placeholderTextColor={C.textLight} />
              </View>
            </View>
            <Text style={S.label}>Email *</Text>
            <TextInput style={S.input} value={form.email} onChangeText={v => setF('email', v)} placeholder="teacher@school.com" placeholderTextColor={C.textLight} keyboardType="email-address" autoCapitalize="none" />
            <Text style={S.label}>Phone</Text>
            <TextInput style={S.input} value={form.phone} onChangeText={v => setF('phone', v)} placeholder="+92 300 0000000" placeholderTextColor={C.textLight} keyboardType="phone-pad" />
            <Text style={S.label}>Password *</Text>
            <TextInput style={S.input} value={form.password} onChangeText={v => setF('password', v)} placeholder="Min 6 characters" placeholderTextColor={C.textLight} secureTextEntry />
            <MultiAssignmentPicker
              classes={classes}
              assignments={form.assignments}
              onChange={v => setF('assignments', v)}
            />
            <Pressable style={[tm.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={tm.primaryBtnTxt}>Add Teacher</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Edit Teacher Modal ────────────────────────────────────────
function EditTeacherModal({ visible, schoolId, teacher, classes, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', assignments: [] });
  const [newPwd, setNewPwd] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [error,      setError]      = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [delLoading, setDelLoading] = useState(false);

  useEffect(() => {
    if (teacher) {
      setForm({
        first_name:  teacher.first_name || '',
        last_name:   teacher.last_name  || '',
        email:       teacher.email      || '',
        phone:       teacher.phone      || '',
        assignments: teacher.assignments || [],
      });
    }
    setError(''); setNewPwd(''); setConfirmDel(false);
  }, [teacher, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('First and last name are required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    setLoading(true); setError('');
    try {
      await api.put(`/super-admin/schools/${schoolId}/teachers/${teacher.id}`, {
        first_name:  form.first_name.trim(),
        last_name:   form.last_name.trim(),
        email:       form.email.trim().toLowerCase(),
        phone:       form.phone.trim() || null,
        assignments: form.assignments,
      });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to update teacher.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeacher = async () => {
    setDelLoading(true);
    try {
      await api.delete(`/super-admin/schools/${schoolId}/teachers/${teacher.id}`);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not delete teacher.');
      setConfirmDel(false);
    } finally {
      setDelLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPwd || newPwd.length < 6) { setError('New password must be at least 6 characters.'); return; }
    setPwdLoading(true); setError('');
    try {
      await api.post(`/super-admin/schools/${schoolId}/teachers/${teacher.id}/reset-password`, { new_password: newPwd });
      setNewPwd('');
      Alert.alert('Success', 'Password has been reset.');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to reset password.');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <View style={modal.headerRow}>
            <Text style={modal.title}>Edit Teacher</Text>
            <Pressable onPress={onClose}><Text style={modal.close}>✕</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '90%' }}>
            {!!error && <Text style={modal.error}>{error}</Text>}
            <View style={modal.row2}>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>First Name *</Text>
                <TextInput style={S.input} value={form.first_name} onChangeText={v => setF('first_name', v)} placeholderTextColor={C.textLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Last Name *</Text>
                <TextInput style={S.input} value={form.last_name} onChangeText={v => setF('last_name', v)} placeholderTextColor={C.textLight} />
              </View>
            </View>
            <Text style={S.label}>Email *</Text>
            <TextInput style={S.input} value={form.email} onChangeText={v => setF('email', v)} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={C.textLight} />
            <Text style={S.label}>Phone</Text>
            <TextInput style={S.input} value={form.phone} onChangeText={v => setF('phone', v)} keyboardType="phone-pad" placeholderTextColor={C.textLight} />
            <MultiAssignmentPicker
              classes={classes}
              assignments={form.assignments}
              onChange={v => setF('assignments', v)}
            />
            <Pressable style={[tm.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={tm.primaryBtnTxt}>Save Changes</Text>}
            </Pressable>

            <View style={modal.divider} />
            <Text style={modal.sectionLabel}>Reset Password</Text>
            <TextInput style={S.input} value={newPwd} onChangeText={setNewPwd} placeholder="New password (min 6)" placeholderTextColor={C.textLight} secureTextEntry />
            <Pressable style={[tm.outlineBtn, pwdLoading && { opacity: 0.7 }]} onPress={handleResetPassword} disabled={pwdLoading}>
              {pwdLoading ? <ActivityIndicator color={C.primary} size="small" /> : <Text style={tm.outlineBtnTxt}>Reset Password</Text>}
            </Pressable>

            <View style={modal.divider} />
            <Text style={modal.sectionLabel}>Danger Zone</Text>
            {!confirmDel
              ? (
                <Pressable style={tm.dangerBtn} onPress={() => setConfirmDel(true)}>
                  <Text style={tm.dangerBtnTxt}>Remove Teacher</Text>
                </Pressable>
              ) : (
                <View>
                  <Text style={{ color: C.textMed, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>Are you sure? This cannot be undone.</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable style={[tm.outlineBtn, { flex: 1, marginTop: 0, padding: 11 }]} onPress={() => setConfirmDel(false)} disabled={delLoading}>
                      <Text style={tm.outlineBtnTxt}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[tm.dangerBtn, { flex: 1 }]} onPress={handleDeleteTeacher} disabled={delLoading}>
                      {delLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={tm.dangerBtnTxt}>Yes, Remove</Text>}
                    </Pressable>
                  </View>
                </View>
              )
            }
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function SuperAdminTeachersScreen({ navigation }) {
  const [schools,         setSchools]         = useState([]);
  const [selectedSchool,  setSelectedSchool]  = useState(null);
  const [classes,         setClasses]         = useState([]);
  const [selectedClass,   setSelectedClass]   = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [teachers,        setTeachers]        = useState([]);
  const [listSearch,      setListSearch]      = useState('');
  const [loading,         setLoading]         = useState(false);
  const [schoolsLoading,  setSchoolsLoading]  = useState(true);
  const [schoolPicker,    setSchoolPicker]    = useState(false);
  const [classPicker,     setClassPicker]     = useState(false);
  const [sectionPicker,   setSectionPicker]   = useState(false);
  const [addModal,        setAddModal]        = useState(false);
  const [editTeacher,     setEditTeacher]     = useState({ open: false, teacher: null });

  useEffect(() => {
    api.get('/super-admin/schools')
      .then(({ data }) => setSchools(data))
      .catch(() => Alert.alert('Error', 'Could not load schools'))
      .finally(() => setSchoolsLoading(false));
  }, []);

  const loadTeachers = useCallback((schoolId, classId, sectionId) => {
    setLoading(true);
    setListSearch('');
    const params = {};
    if (classId)   params.class_id   = classId;
    if (sectionId) params.section_id = sectionId;
    api.get(`/super-admin/schools/${schoolId}/teachers`, { params })
      .then(({ data }) => setTeachers(data))
      .catch(() => Alert.alert('Error', 'Could not load teachers'))
      .finally(() => setLoading(false));
  }, []);

  const selectSchool = (school) => {
    setSelectedSchool(school);
    setSelectedClass(null);
    setSelectedSection(null);
    setClasses([]); setTeachers([]);
    setListSearch('');
    api.get(`/super-admin/schools/${school.id}/classes`)
      .then(({ data }) => setClasses(data))
      .catch(() => Alert.alert('Error', 'Could not load school data'));
    loadTeachers(school.id, null, null);
  };

  const selectClass = (cls) => {
    setSelectedClass(cls);
    setSelectedSection(null);
    loadTeachers(selectedSchool.id, cls.id, null);
  };

  const selectSection = (section) => {
    setSelectedSection(section);
    loadTeachers(selectedSchool.id, selectedClass?.id, section.id);
  };

  const filteredTeachers = useMemo(() => {
    if (!listSearch.trim()) return teachers;
    const q = listSearch.toLowerCase();
    return teachers.filter(t =>
      `${t.first_name} ${t.last_name}`.toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  }, [teachers, listSearch]);

  const initials = (t) => `${t.first_name[0]}${t.last_name[0]}`.toUpperCase();

  const classLabel   = selectedClass   ? selectedClass.class_name : null;
  const sectionLabel = selectedSection ? selectedSection.section_name : null;

  const classPickerItems = useMemo(() => [
    { id: null, class_name: 'All Classes' },
    ...classes,
  ], [classes]);

  const sectionPickerItems = useMemo(() => [
    { id: null, section_name: 'All Sections' },
    ...(selectedClass?.sections || []),
  ], [selectedClass]);

  return (
    <View style={styles.container}>

      <AppHeader title="Teachers" navigation={navigation} />

      {/* Filters */}
      <View style={styles.filterSection}>
        {schoolsLoading
          ? <ActivityIndicator color={C.primary} style={{ marginVertical: 10 }} />
          : (
            <DropdownBtn
              label="Campus"
              value={selectedSchool?.name}
              placeholder="Tap to select a campus"
              onPress={() => setSchoolPicker(true)}
              light
            />
          )}

        {selectedSchool && (
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <DropdownBtn
                label="Class"
                value={classLabel}
                placeholder="All Classes"
                onPress={() => setClassPicker(true)}
                light
              />
            </View>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1 }}>
              <DropdownBtn
                label="Section"
                value={sectionLabel}
                placeholder={selectedClass ? 'All Sections' : '—'}
                onPress={() => selectedClass && setSectionPicker(true)}
                light
              />
            </View>
          </View>
        )}

        {selectedSchool && (
          <View style={styles.searchAddRow}>
            <View style={[styles.searchBox, { flex: 1 }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search teachers..."
                placeholderTextColor={C.textLight}
                value={listSearch}
                onChangeText={setListSearch}
              />
              {!!listSearch && (
                <Pressable onPress={() => setListSearch('')}>
                  <Text style={styles.searchClear}>✕</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={styles.addBtn} onPress={() => setAddModal(true)}>
              <Text style={styles.addBtnTxt}>+ Add</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Count bar */}
      {selectedSchool && !loading && (
        <View style={styles.countBar}>
          <Text style={styles.countTxt}>
            {filteredTeachers.length} of {teachers.length} teacher{teachers.length !== 1 ? 's' : ''}
            {selectedClass ? ` · ${classLabel}` : ''}
            {selectedSection ? ` · ${sectionLabel}` : ''}
          </Text>
        </View>
      )}

      {/* List */}
      {!selectedSchool
        ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏫</Text>
            <Text style={styles.emptyTitle}>No school selected</Text>
            <Text style={styles.emptyTxt}>Tap the school dropdown above to get started</Text>
          </View>
        )
        : loading
            ? <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
            : (
              <FlatList
                data={filteredTeachers}
                keyExtractor={item => String(item.id)}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 24 }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyIcon}>👨‍🏫</Text>
                    <Text style={styles.emptyTitle}>{listSearch || selectedClass ? 'No matches' : 'No teachers yet'}</Text>
                    <Text style={styles.emptyTxt}>{listSearch || selectedClass ? 'Try a different filter' : 'Tap + Add to add the first teacher'}</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
                    onPress={() => setEditTeacher({ open: true, teacher: item })}
                  >
                    <LinearGradient colors={['#EEF2FF', '#E0E7FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                      <Text style={styles.avatarTxt}>{initials(item)}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.cardName}>{item.first_name} {item.last_name}</Text>
                        {item.teacher_role && ROLE[item.teacher_role] && (
                          <View style={[styles.rolePill, { backgroundColor: ROLE[item.teacher_role].bg }]}>
                            <Text style={[styles.rolePillTxt, { color: ROLE[item.teacher_role].color }]}>
                              {ROLE[item.teacher_role].label}
                            </Text>
                          </View>
                        )}
                      </View>
                      {item.assignments && item.assignments.length > 0
                        ? <Text style={styles.cardSub}>{item.assignments.map(a => `${a.class_name} · Sec ${a.section_name}`).join('  |  ')}</Text>
                        : <Text style={[styles.cardSub, { color: '#F59E0B' }]}>No class assigned</Text>}
                      <Text style={styles.cardSub}>{item.email}</Text>
                      {!!item.phone && <Text style={styles.cardSub}>{item.phone}</Text>}
                    </View>
                    <View style={styles.eyeBtn}>
                      <Text style={styles.eyeIcon}>Edit</Text>
                    </View>
                  </Pressable>
                )}
              />
            )}

      {/* Pickers */}
      <SearchPickerModal
        visible={schoolPicker}
        title="Select Campus"
        items={schools}
        labelKey="name"
        onSelect={selectSchool}
        onClose={() => setSchoolPicker(false)}
        emptyText="No campuses found"
      />

      <SearchPickerModal
        visible={classPicker}
        title="Select Class"
        items={classPickerItems}
        labelKey="class_name"
        onSelect={(cls) => {
          if (cls.id === null) {
            setSelectedClass(null); setSelectedSection(null);
            loadTeachers(selectedSchool.id, null, null);
          } else {
            selectClass(cls);
          }
          setClassPicker(false);
        }}
        onClose={() => setClassPicker(false)}
        emptyText="No classes found"
      />
      <SearchPickerModal
        visible={sectionPicker}
        title="Select Section"
        items={sectionPickerItems}
        labelKey="section_name"
        onSelect={(sec) => {
          if (sec.id === null) {
            setSelectedSection(null);
            loadTeachers(selectedSchool.id, selectedClass?.id, null);
          } else {
            selectSection(sec);
          }
          setSectionPicker(false);
        }}
        onClose={() => setSectionPicker(false)}
        emptyText="No sections found"
      />

      {/* Modals */}
      <AddTeacherModal
        visible={addModal}
        schoolId={selectedSchool?.id}
        classes={classes}
        onClose={() => setAddModal(false)}
        onSaved={() => { setAddModal(false); loadTeachers(selectedSchool.id, selectedClass?.id, selectedSection?.id); }}
      />
      <EditTeacherModal
        visible={editTeacher.open}
        schoolId={selectedSchool?.id}
        teacher={editTeacher.teacher}
        classes={classes}
        onClose={() => setEditTeacher({ open: false, teacher: null })}
        onSaved={() => { setEditTeacher({ open: false, teacher: null }); loadTeachers(selectedSchool.id, selectedClass?.id, selectedSection?.id); }}
      />

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  addBtn:        { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, height: 42, justifyContent: 'center' },
  addBtnTxt:     { color: '#fff', fontWeight: '700', fontSize: 13 },

  filterSection: { backgroundColor: C.card, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border },
  filterRow:     { flexDirection: 'row', marginTop: 10 },
  searchAddRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  searchBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: C.border },
  searchIcon:    { fontSize: 14, marginRight: 8 },
  searchInput:   { flex: 1, fontSize: 14, color: C.textDark },
  searchClear:   { color: C.textLight, fontSize: 14, paddingLeft: 6 },

  countBar:    { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderColor: C.border },
  countTxt:    { fontSize: 12, color: C.textMed, fontWeight: '600' },


  empty:       { alignItems: 'center', marginTop: 70, paddingHorizontal: 32 },
  emptyIcon:   { fontSize: 44, marginBottom: 12 },
  emptyTitle:  { fontSize: 16, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  emptyTxt:    { color: C.textMed, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  card:        { backgroundColor: C.card, borderRadius: 14, marginVertical: 4, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 2, shadowColor: C.shadow, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  avatar:      { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:   { color: C.primary, fontWeight: '800', fontSize: 13 },
  cardName:    { fontSize: 14, fontWeight: '700', color: C.textDark },
  cardSub:     { fontSize: 12, color: C.textMed, marginTop: 1 },
  rolePill:    { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  rolePillTxt: { fontSize: 10, fontWeight: '700' },
  eyeBtn:      { borderRadius: 8, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7 },
  eyeIcon:     { fontSize: 12, color: C.primary, fontWeight: '700' },
});

const modal = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:        { fontSize: 17, fontWeight: '800', color: C.textDark },
  close:        { fontSize: 20, color: C.textMed, padding: 4 },
  error:        { color: '#DC2626', fontSize: 13, marginBottom: 10, backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8 },
  row2:         { flexDirection: 'row', gap: 10 },
  divider:      { height: 1, backgroundColor: C.border, marginVertical: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.textMed, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const tm = StyleSheet.create({
  primaryBtn:    { backgroundColor: C.primary, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 14 },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  outlineBtn:    { borderWidth: 1.5, borderColor: C.primary, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
  outlineBtnTxt: { color: C.primary, fontWeight: '700', fontSize: 14 },
  dangerBtn:     { backgroundColor: '#DC2626', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
  dangerBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 14 },
});

const confirm = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  box:       { backgroundColor: C.card, borderRadius: 20, padding: 28, marginHorizontal: 32, alignItems: 'center' },
  icon:      { fontSize: 36, marginBottom: 10 },
  title:     { fontSize: 17, fontWeight: '800', color: C.textDark, marginBottom: 8, textAlign: 'center' },
  msg:       { fontSize: 14, color: C.textMed, textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  row:       { flexDirection: 'row', gap: 12 },
  cancel:    { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 13, alignItems: 'center' },
  cancelTxt: { color: C.textMed, fontWeight: '700', fontSize: 14 },
  action:    { flex: 1, backgroundColor: '#DC2626', borderRadius: 12, padding: 13, alignItems: 'center' },
  actionTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// Searchable picker modal styles
const sp = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border },
  title:        { fontSize: 17, fontWeight: '800', color: C.textDark },
  closeBtn:     { padding: 4 },
  closeTxt:     { fontSize: 20, color: C.textMed },
  searchRow:    { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 12, height: 44 },
  searchIcon:   { fontSize: 14, marginRight: 8 },
  searchInput:  { flex: 1, fontSize: 14, color: C.textDark },
  clearTxt:     { color: C.textLight, fontSize: 15, paddingLeft: 8 },
  list:         { paddingHorizontal: 12, paddingBottom: 20 },
  item:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#F1F5F9', gap: 12 },
  itemPressed:  { backgroundColor: '#F8FAFC' },
  itemAvatar:   { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  itemAvatarTxt:{ color: C.primary, fontWeight: '800', fontSize: 13 },
  itemTxt:      { flex: 1, fontSize: 15, color: C.textDark, fontWeight: '600' },
  itemArrow:    { color: C.textLight, fontSize: 20 },
  empty:        { alignItems: 'center', padding: 32 },
  emptyTxt:     { color: C.textMed, fontSize: 14 },
});

const picker = StyleSheet.create({
  pill:          { backgroundColor: '#F1F5F9', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: C.border },
  pillActive:    { backgroundColor: C.primary, borderColor: C.primary },
  pillTxt:       { color: C.textMed, fontSize: 13, fontWeight: '600' },
  pillTxtActive: { color: '#fff' },
});

// Multi-assignment picker styles
const map = StyleSheet.create({
  emptyTag:     { backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, alignItems: 'center' },
  emptyTagTxt:  { color: '#92400E', fontSize: 12 },
  tag:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tagTxt:       { fontSize: 13, fontWeight: '600', color: C.primary, flex: 1 },
  tagX:         { fontSize: 14, color: C.textMed, fontWeight: '700', marginLeft: 8 },
  pickerBox:    { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  addBtn:       { borderStyle: 'dashed', borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  addBtnTxt:    { color: C.primary, fontWeight: '700', fontSize: 13 },
  cancelBtn:    { marginTop: 8, padding: 8, alignItems: 'center' },
  cancelBtnTxt: { color: C.textMed, fontSize: 13 },
});

// Dropdown button styles
const dd = StyleSheet.create({
  btn:              { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  label:            { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value:            { fontSize: 15, fontWeight: '700', color: '#fff' },
  placeholder:      { color: 'rgba(255,255,255,0.45)', fontWeight: '400' },
  arrow:            { color: 'rgba(255,255,255,0.6)', fontSize: 18, marginLeft: 8 },
  btnLight:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: C.border },
  labelLight:       { fontSize: 10, fontWeight: '700', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  valueLight:       { fontSize: 14, fontWeight: '700', color: C.textDark },
  placeholderLight: { color: C.textLight, fontWeight: '400' },
  arrowLight:       { color: C.textMed, fontSize: 18, marginLeft: 8 },
});
