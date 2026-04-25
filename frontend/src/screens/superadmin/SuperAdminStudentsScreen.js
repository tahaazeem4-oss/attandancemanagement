import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal, ScrollView,
  StyleSheet, ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { C, S } from '../../config/theme';

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
function DropdownBtn({ label, value, onPress, placeholder = 'Tap to select' }) {
  return (
    <Pressable
      style={({ pressed }) => [dd.btn, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={dd.label}>{label}</Text>
        <Text style={[dd.value, !value && dd.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </View>
      <Text style={dd.arrow}>⌄</Text>
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

// ── Class/Section Picker ──────────────────────────────────────
function ClassSectionPicker({ classes, classId, sectionId, onClassChange, onSectionChange }) {
  const selectedClass = classes.find(c => c.id === classId);
  const sections = selectedClass?.sections || [];

  return (
    <View>
      <Text style={S.label}>Class *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {classes.map(cls => (
          <Pressable
            key={cls.id}
            style={[picker.pill, classId === cls.id && picker.pillActive]}
            onPress={() => { onClassChange(cls.id); onSectionChange(null); }}
          >
            <Text style={[picker.pillTxt, classId === cls.id && picker.pillTxtActive]}>{cls.class_name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {classId && (
        <>
          <Text style={S.label}>Section *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {sections.map(sec => (
              <Pressable
                key={sec.id}
                style={[picker.pill, sectionId === sec.id && picker.pillActive]}
                onPress={() => onSectionChange(sec.id)}
              >
                <Text style={[picker.pillTxt, sectionId === sec.id && picker.pillTxtActive]}>{sec.section_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

// ── Add Student Modal ─────────────────────────────────────────
function AddStudentModal({ visible, schoolId, adminId, classes, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', age: '', roll_no: '', class_id: null, section_id: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setForm({ first_name: '', last_name: '', age: '', roll_no: '', class_id: null, section_id: null }); setError(''); }
  }, [visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('First and last name are required.'); return; }
    if (!form.age || isNaN(parseInt(form.age))) { setError('Valid age is required.'); return; }
    if (!form.class_id) { setError('Please select a class.'); return; }
    if (!form.section_id) { setError('Please select a section.'); return; }
    setLoading(true); setError('');
    try {
      await api.post(`/super-admin/schools/${schoolId}/students`, {
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        age:        parseInt(form.age),
        class_id:   form.class_id,
        section_id: form.section_id,
        roll_no:    form.roll_no.trim() || null,
        admin_id:   adminId || null,
      });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add student.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <View style={modal.headerRow}>
            <Text style={modal.title}>Add Student</Text>
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
            <View style={modal.row2}>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Age *</Text>
                <TextInput style={S.input} value={form.age} onChangeText={v => setF('age', v)} placeholder="e.g. 12" placeholderTextColor={C.textLight} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Roll No</Text>
                <TextInput style={S.input} value={form.roll_no} onChangeText={v => setF('roll_no', v)} placeholder="e.g. 101" placeholderTextColor={C.textLight} />
              </View>
            </View>
            <ClassSectionPicker
              classes={classes}
              classId={form.class_id}
              sectionId={form.section_id}
              onClassChange={v => setF('class_id', v)}
              onSectionChange={v => setF('section_id', v)}
            />
            <Pressable style={[tm.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={tm.primaryBtnTxt}>Add Student</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Edit Student Modal ────────────────────────────────────────
function EditStudentModal({ visible, schoolId, student, classes, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', age: '', roll_no: '', class_id: null, section_id: null });
  const [newPwd, setNewPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (student) {
      setForm({
        first_name: student.first_name || '',
        last_name:  student.last_name  || '',
        age:        String(student.age || ''),
        roll_no:    student.roll_no    || '',
        class_id:   student.class_id   || null,
        section_id: student.section_id || null,
      });
    }
    setError(''); setNewPwd('');
  }, [student, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('First and last name are required.'); return; }
    if (!form.age || isNaN(parseInt(form.age))) { setError('Valid age is required.'); return; }
    if (!form.class_id) { setError('Please select a class.'); return; }
    if (!form.section_id) { setError('Please select a section.'); return; }
    setLoading(true); setError('');
    try {
      await api.put(`/super-admin/schools/${schoolId}/students/${student.id}`, {
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        age:        parseInt(form.age),
        class_id:   form.class_id,
        section_id: form.section_id,
        roll_no:    form.roll_no.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to update student.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPwd || newPwd.length < 6) { setError('New password must be at least 6 characters.'); return; }
    setPwdLoading(true); setError('');
    try {
      await api.post(`/super-admin/schools/${schoolId}/students/${student.id}/reset-password`, { new_password: newPwd });
      setNewPwd('');
      Alert.alert('Success', 'Student portal password has been reset.');
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
            <Text style={modal.title}>Edit Student</Text>
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
            <View style={modal.row2}>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Age *</Text>
                <TextInput style={S.input} value={form.age} onChangeText={v => setF('age', v)} keyboardType="numeric" placeholderTextColor={C.textLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>Roll No</Text>
                <TextInput style={S.input} value={form.roll_no} onChangeText={v => setF('roll_no', v)} placeholderTextColor={C.textLight} />
              </View>
            </View>
            <ClassSectionPicker
              classes={classes}
              classId={form.class_id}
              sectionId={form.section_id}
              onClassChange={v => setF('class_id', v)}
              onSectionChange={v => setF('section_id', v)}
            />
            <Pressable style={[tm.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={tm.primaryBtnTxt}>Save Changes</Text>}
            </Pressable>

            <View style={modal.divider} />
            <Text style={modal.sectionLabel}>Reset Portal Password</Text>
            <TextInput style={S.input} value={newPwd} onChangeText={setNewPwd} placeholder="New password (min 6)" placeholderTextColor={C.textLight} secureTextEntry />
            <Pressable style={[tm.outlineBtn, pwdLoading && { opacity: 0.7 }]} onPress={handleResetPassword} disabled={pwdLoading}>
              {pwdLoading ? <ActivityIndicator color={C.primary} size="small" /> : <Text style={tm.outlineBtnTxt}>Reset Password</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function SuperAdminStudentsScreen() {
  const [schools,          setSchools]          = useState([]);
  const [selectedSchool,   setSelectedSchool]   = useState(null);
  const [admins,           setAdmins]           = useState([]);
  const [selectedAdmin,    setSelectedAdmin]    = useState(null);
  const [classes,          setClasses]          = useState([]);
  const [selectedClass,    setSelectedClass]    = useState(null);
  const [selectedSection,  setSelectedSection]  = useState(null);
  const [students,         setStudents]         = useState([]);
  const [listSearch,       setListSearch]       = useState('');
  const [loading,          setLoading]          = useState(false);
  const [schoolsLoading,   setSchoolsLoading]   = useState(true);
  const [schoolPicker,     setSchoolPicker]     = useState(false);
  const [adminPicker,      setAdminPicker]      = useState(false);
  const [classPicker,      setClassPicker]      = useState(false);
  const [sectionPicker,    setSectionPicker]    = useState(false);
  const [addModal,         setAddModal]         = useState(false);
  const [editStudent,      setEditStudent]      = useState({ open: false, student: null });
  const [deleteStudent,    setDeleteStudent]    = useState({ open: false, student: null });
  const [deleting,         setDeleting]         = useState(false);

  useEffect(() => {
    api.get('/super-admin/schools')
      .then(({ data }) => setSchools(data))
      .catch(() => Alert.alert('Error', 'Could not load schools'))
      .finally(() => setSchoolsLoading(false));
  }, []);

  const loadStudents = useCallback((schoolId, classId, sectionId) => {
    if (!schoolId) return;
    setLoading(true);
    const params = {};
    if (classId)   params.class_id   = classId;
    if (sectionId) params.section_id = sectionId;
    api.get(`/super-admin/schools/${schoolId}/students`, { params })
      .then(({ data }) => setStudents(data))
      .catch(() => Alert.alert('Error', 'Could not load students'))
      .finally(() => setLoading(false));
  }, []);

  const selectSchool = useCallback((school) => {
    setSelectedSchool(school);
    setSelectedAdmin(null);
    setSelectedClass(null);
    setSelectedSection(null);
    setAdmins([]); setClasses([]); setStudents([]);
    setListSearch('');
    Promise.all([
      api.get(`/super-admin/schools/${school.id}/admins`),
      api.get(`/super-admin/schools/${school.id}/classes`),
    ]).then(([aRes, cRes]) => {
      setAdmins(aRes.data);
      setClasses(cRes.data);
    }).catch(() => Alert.alert('Error', 'Could not load school data'));
  }, []);

  const selectAdmin = useCallback((admin) => {
    setSelectedAdmin(admin);
    setSelectedClass(null);
    setSelectedSection(null);
    setStudents([]);
    setListSearch('');
    loadStudents(selectedSchool.id, null, null);
  }, [selectedSchool, loadStudents]);

  const selectClass = (cls) => {
    setSelectedClass(cls);
    setSelectedSection(null);
    loadStudents(selectedSchool.id, cls.id, null);
  };

  const selectSection = (section) => {
    setSelectedSection(section);
    loadStudents(selectedSchool.id, selectedClass?.id, section.id);
  };

  const handleDelete = async () => {
    if (!deleteStudent.student) return;
    setDeleting(true);
    try {
      await api.delete(`/super-admin/schools/${selectedSchool.id}/students/${deleteStudent.student.id}`);
      setDeleteStudent({ open: false, student: null });
      loadStudents(selectedSchool.id, selectedClass?.id, selectedSection?.id);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not delete student');
    } finally {
      setDeleting(false);
    }
  };

  const adminPickerItems = useMemo(() =>
    admins.map(a => ({ ...a, name: `${a.first_name} ${a.last_name}` })),
    [admins]
  );

  const classPickerItems = useMemo(() => [
    { id: null, class_name: 'All Classes' },
    ...classes,
  ], [classes]);

  const sectionPickerItems = useMemo(() => [
    { id: null, section_name: 'All Sections' },
    ...(selectedClass?.sections || []),
  ], [selectedClass]);

  const filteredStudents = useMemo(() => {
    if (!listSearch.trim()) return students;
    const q = listSearch.toLowerCase();
    return students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.class_name || '').toLowerCase().includes(q) ||
      (s.roll_no || '').toString().includes(q)
    );
  }, [students, listSearch]);

  const initials = (s) => `${s.first_name[0]}${s.last_name[0]}`.toUpperCase();

  const adminLabel   = selectedAdmin   ? `${selectedAdmin.first_name} ${selectedAdmin.last_name}` : null;
  const classLabel   = selectedClass   ? selectedClass.class_name : null;
  const sectionLabel = selectedSection ? selectedSection.section_name : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <LinearGradient colors={['#0F172A', '#1E293B', '#334155']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.headerTitle}>Manage Students</Text>
        <Text style={styles.headerSub}>School → Campus → Class → Section</Text>

        {schoolsLoading
          ? <ActivityIndicator color="#94A3B8" style={{ marginTop: 14 }} />
          : (
            <DropdownBtn
              label="School"
              value={selectedSchool?.name}
              placeholder="Tap to select a school"
              onPress={() => setSchoolPicker(true)}
            />
          )}

        {selectedSchool && (
          <DropdownBtn
            label="Campus / Admin"
            value={adminLabel}
            placeholder="Tap to select campus admin"
            onPress={() => setAdminPicker(true)}
          />
        )}

        {selectedAdmin && (
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <DropdownBtn
                label="Class"
                value={classLabel}
                placeholder="All Classes"
                onPress={() => setClassPicker(true)}
              />
            </View>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1 }}>
              <DropdownBtn
                label="Section"
                value={sectionLabel}
                placeholder={selectedClass ? 'All Sections' : '—'}
                onPress={() => selectedClass && setSectionPicker(true)}
              />
            </View>
          </View>
        )}
      </LinearGradient>

      {/* Toolbar: search + add */}
      {selectedAdmin && (
        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search students..."
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

      {/* Count bar */}
      {selectedAdmin && !loading && (
        <View style={styles.countBar}>
          <Text style={styles.countTxt}>
            {filteredStudents.length} of {students.length} student{students.length !== 1 ? 's' : ''}
            {selectedClass ? ` · ${selectedClass.class_name}` : ''}
            {selectedSection ? ` · ${selectedSection.section_name}` : ''}
            {` · ${adminLabel}`}
          </Text>
        </View>
      )}

      {/* Student List */}
      {!selectedSchool
        ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏫</Text>
            <Text style={styles.emptyTitle}>No school selected</Text>
            <Text style={styles.emptyTxt}>Tap the school dropdown above to get started</Text>
          </View>
        )
        : !selectedAdmin
          ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>No campus selected</Text>
              <Text style={styles.emptyTxt}>Tap "Campus / Admin" to select a campus</Text>
            </View>
          )
          : loading
            ? <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
            : (
              <FlatList
                data={filteredStudents}
                keyExtractor={item => String(item.id)}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 24 }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyIcon}>🎒</Text>
                    <Text style={styles.emptyTitle}>{listSearch ? 'No matches' : 'No students yet'}</Text>
                    <Text style={styles.emptyTxt}>{listSearch ? 'Try a different search term' : 'Tap + Add to add the first student'}</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.card}>
                    <LinearGradient colors={['#FFF7ED', '#FFEDD5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                      <Text style={styles.avatarTxt}>{initials(item)}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{item.first_name} {item.last_name}</Text>
                      <Text style={styles.cardSub}>{item.class_name} · Section {item.section_name}</Text>
                      {!!item.roll_no && <Text style={styles.cardSub}>Roll #{item.roll_no}</Text>}
                    </View>
                    <View style={styles.cardActions}>
                      <Pressable style={styles.editBtn} onPress={() => setEditStudent({ open: true, student: item })}>
                        <Text style={styles.editBtnTxt}>Edit</Text>
                      </Pressable>
                      <Pressable style={styles.deleteBtn} onPress={() => setDeleteStudent({ open: true, student: item })}>
                        <Text style={styles.deleteBtnTxt}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            )}

      {/* Pickers */}
      <SearchPickerModal
        visible={schoolPicker}
        title="Select School"
        items={schools}
        labelKey="name"
        onSelect={selectSchool}
        onClose={() => setSchoolPicker(false)}
        emptyText="No schools found"
      />
      <SearchPickerModal
        visible={adminPicker}
        title="Select Campus / Admin"
        items={adminPickerItems}
        labelKey="name"
        onSelect={(admin) => { selectAdmin(admin); setAdminPicker(false); }}
        onClose={() => setAdminPicker(false)}
        emptyText="No campus admins found"
      />
      <SearchPickerModal
        visible={classPicker}
        title="Filter by Class"
        items={classPickerItems}
        labelKey="class_name"
        onSelect={(cls) => { if (cls.id === null) { setSelectedClass(null); setSelectedSection(null); loadStudents(selectedSchool.id, null, null); } else { selectClass(cls); } setClassPicker(false); }}
        onClose={() => setClassPicker(false)}
        emptyText="No classes found"
      />
      <SearchPickerModal
        visible={sectionPicker}
        title="Filter by Section"
        items={sectionPickerItems}
        labelKey="section_name"
        onSelect={(sec) => {
          if (sec.id === null) {
            setSelectedSection(null);
            loadStudents(selectedSchool.id, selectedClass?.id, null);
          } else {
            selectSection(sec);
          }
          setSectionPicker(false);
        }}
        onClose={() => setSectionPicker(false)}
        emptyText="No sections found"
      />

      {/* Modals */}
      <AddStudentModal
        visible={addModal}
        schoolId={selectedSchool?.id}
        adminId={selectedAdmin?.id}
        classes={classes}
        onClose={() => setAddModal(false)}
        onSaved={() => { setAddModal(false); loadStudents(selectedSchool.id, selectedClass?.id, selectedSection?.id); }}
      />
      <EditStudentModal
        visible={editStudent.open}
        schoolId={selectedSchool?.id}
        student={editStudent.student}
        classes={classes}
        onClose={() => setEditStudent({ open: false, student: null })}
        onSaved={() => { setEditStudent({ open: false, student: null }); loadStudents(selectedSchool.id, selectedClass?.id, selectedSection?.id); }}
      />
      <ConfirmModal
        visible={deleteStudent.open}
        title="Remove Student"
        message={`Remove ${deleteStudent.student?.first_name} ${deleteStudent.student?.last_name}? This cannot be undone.`}
        actionLabel="Remove"
        loading={deleting}
        onCancel={() => setDeleteStudent({ open: false, student: null })}
        onConfirm={handleDelete}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  headerTitle:  { color: '#F1F5F9', fontSize: 20, fontWeight: '800' },
  headerSub:    { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  filterRow:    { flexDirection: 'row', marginTop: 0 },
  toolbar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border },
  searchBox:    { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, height: 38, borderWidth: 1, borderColor: C.border },
  searchIcon:   { fontSize: 14, marginRight: 6 },
  searchInput:  { flex: 1, fontSize: 14, color: C.textDark },
  searchClear:  { fontSize: 13, color: C.textMed, padding: 2 },
  addBtn:       { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  countBar:     { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: C.bg, borderBottomWidth: 1, borderColor: C.border },
  countTxt:     { fontSize: 12, color: C.textMed, fontWeight: '600' },
  empty:        { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 40, marginBottom: 10 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  emptyTxt:     { color: C.textMed, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card:         { backgroundColor: C.card, borderRadius: 14, marginVertical: 4, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 2, shadowColor: C.shadow, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  avatar:       { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:    { color: '#EA580C', fontWeight: '800', fontSize: 13 },
  cardName:     { fontSize: 14, fontWeight: '700', color: C.textDark },
  cardSub:      { fontSize: 12, color: C.textMed, marginTop: 1 },
  cardActions:  { flexDirection: 'row', gap: 6 },
  editBtn:      { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnTxt:   { color: '#4F46E5', fontWeight: '700', fontSize: 12 },
  deleteBtn:    { backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnTxt: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
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
});

const picker = StyleSheet.create({
  pill:        { backgroundColor: '#F1F5F9', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: C.border },
  pillActive:  { backgroundColor: C.primary, borderColor: C.primary },
  pillTxt:     { color: C.textMed, fontSize: 13, fontWeight: '600' },
  pillTxtActive: { color: '#fff' },
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

const sp = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title:         { fontSize: 17, fontWeight: '800', color: C.textDark },
  closeBtn:      { padding: 4 },
  closeTxt:      { fontSize: 18, color: C.textMed },
  searchRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: C.border },
  searchIcon:    { fontSize: 14, marginRight: 8 },
  searchInput:   { flex: 1, fontSize: 14, color: C.textDark },
  clearTxt:      { fontSize: 13, color: C.textMed, padding: 2 },
  list:          { paddingBottom: 24 },
  empty:         { alignItems: 'center', paddingVertical: 32 },
  emptyTxt:      { color: C.textMed, fontSize: 14 },
  item:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderColor: C.border, gap: 12 },
  itemPressed:   { backgroundColor: C.bg },
  itemAvatar:    { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  itemAvatarTxt: { color: '#4F46E5', fontWeight: '800', fontSize: 13 },
  itemTxt:       { flex: 1, fontSize: 15, color: C.textDark, fontWeight: '500' },
  itemArrow:     { fontSize: 20, color: C.textLight },
});

const dd = StyleSheet.create({
  btn:         { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  label:       { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value:       { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  placeholder: { color: '#64748B' },
  arrow:       { fontSize: 18, color: '#94A3B8', marginLeft: 8 },
});

