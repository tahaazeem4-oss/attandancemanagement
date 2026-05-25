import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal, StyleSheet,
  Alert, ActivityIndicator, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { C, S } from '../config/theme';
import AppHeader from './AppHeader';
import { useAuth } from '../context/AuthContext';
import PickerField from './PickerField';
import ImportExportBar from './ImportExportBar';
import EntityEmptyState from './EntityEmptyState';
import ManagerSearchAddRow from './ManagerSearchAddRow';
import ModalFooterActions from './ModalFooterActions';
import { showDestructiveConfirm } from '../lib/confirmDialog';
import { buildImportExportScope } from '../lib/importExportScope';

const EMPTY_FORM = { email: '', password: '', first_name: '', last_name: '', phone: '', school_id: '' };

export default function ParentsManagerScreen({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';
  const isSuper = mode === 'superadmin';
  const { user } = useAuth();
  const mySchoolId = user?.school_id;

  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [campuses, setCampuses] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [selectedCampuses, setSelectedCampuses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterCampus, setFilterCampus] = useState('');

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const [linkModal, setLinkModal] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linking2, setLinking2] = useState(false);
  const [campusModal, setCampusModal] = useState(false);
  const [campusParent, setCampusParent] = useState(null);
  const [campusSaving, setCampusSaving] = useState(false);

  const [childModal, setChildModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [selClass, setSelClass] = useState(null);
  const [selSection, setSelSection] = useState(null);
  const [nameQ, setNameQ] = useState('');
  const [stuLoading, setStuLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [childCampusId, setChildCampusId] = useState(null);

  const dedupeParentsById = useCallback((list) => {
    const map = new Map();
    for (const p of (list || [])) {
      const id = Number(p?.id);
      if (!Number.isFinite(id)) continue;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, {
          ...p,
          campus_names: Array.isArray(p?.campus_names) ? [...new Set(p.campus_names)] : [],
          campus_ids: Array.isArray(p?.campus_ids) ? [...new Set(p.campus_ids.map(Number).filter(Boolean))] : [],
        });
      } else {
        const mergedCampusNames = [...new Set([...(existing.campus_names || []), ...((p?.campus_names || []))])];
        const mergedCampusIds = [...new Set([...(existing.campus_ids || []), ...((p?.campus_ids || []).map(Number).filter(Boolean))])];
        map.set(id, { ...existing, ...p, campus_names: mergedCampusNames, campus_ids: mergedCampusIds });
      }
    }
    return [...map.values()];
  }, []);

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
          // Specific campus selected — load parents for that campus
          const { data } = await api.get(`/super-admin/schools/${filterCampus}/parents`);
          setParents(dedupeParentsById(data?.parents || data || []));
        } else if (filterOrg) {
          // Org selected but no specific campus — load all parents across the org
          const { data } = await api.get(`/super-admin/organizations/${filterOrg}/parents`);
          setParents(dedupeParentsById(Array.isArray(data) ? data : []));
        } else {
          // All orgs + all campuses — aggregate parents across all campuses.
          const responses = await Promise.all(
            allCampuses.map(campus =>
              api.get(`/super-admin/schools/${campus.id}/parents`).catch(() => ({ data: [] })),
            ),
          );
          const merged = responses.flatMap(r => (r.data?.parents || r.data || []));
          setParents(dedupeParentsById(merged));
        }
      } else if (isOrg) {
        const params = filterCampus ? { campus_id: filterCampus } : {};
        const [pRes, cRes] = await Promise.all([
          api.get('/org-admin/parents', { params }),
          api.get('/org-admin/campuses'),
        ]);
        setParents(pRes.data || []);
        setCampuses(cRes.data || []);
      } else {
        const { data } = await api.get('/admin/parents');
        setParents(data.parents || []);
      }
    } catch {
      Alert.alert('Error', 'Could not load parents');
    } finally {
      setLoading(false);
    }
  }, [isOrg, isSuper, filterCampus, filterOrg]);

  useEffect(() => {
    if (!isSuper) return;
    setFilterCampus('');
  }, [isSuper, filterOrg]);

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

  const F = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const initials = p => `${(p.first_name || '?')[0].toUpperCase()}${(p.last_name || '')[0] ? p.last_name[0].toUpperCase() : ''}`;

  const getCampusIdsFromParent = p => {
    if (!p) return [];
    if (Array.isArray(p.campus_ids) && p.campus_ids.length) {
      return p.campus_ids.map(Number).filter(Boolean);
    }
    return p.school_id ? [Number(p.school_id)] : [];
  };

  const toggleCampus = id => {
    setSelectedCampuses(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, school_id: filterCampus || '' });
    setShowPw(false);
    if (isSuper && filterCampus) {
      setSelectedCampuses([Number(filterCampus)]);
    } else {
      setSelectedCampuses([]);
    }
    setModal(true);
  };

  const normalizePhoneForForm = phone => {
    if (!phone) return '';
    const m = phone.match(/^\+92(\d{10})$/);
    return m ? '0' + m[1] : phone;
  };

  const openEdit = p => {
    setEditing(p);
    setForm({
      email: p.email || '',
      password: '',
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      phone: normalizePhoneForForm(p.phone),
      school_id: String(p.school_id || filterCampus || ''),
    });
    if (isOrg) {
      const existingIds = campuses.filter(c => p.campus_names?.includes(c.name)).map(c => c.id);
      setSelectedCampuses(existingIds.length ? existingIds : p.school_id ? [p.school_id] : []);
    } else if (isSuper) {
      setSelectedCampuses(getCampusIdsFromParent(p));
    }
    setShowPw(false);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.email) return Alert.alert('Validation', 'Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return Alert.alert('Validation', 'Please enter a valid email address (e.g. parent@example.com).');
    }
    if (!form.phone) return Alert.alert('Validation', 'Phone is required.');
    if (!/^03[0-9]{9}$/.test(form.phone.trim()) && !/^\+92[0-9]{10}$/.test(form.phone.trim())) {
      return Alert.alert('Validation', 'Phone must be 03XXXXXXXXX or +92XXXXXXXXXX format.');
    }
    if (!editing && !form.password) return Alert.alert('Validation', 'Password is required for new parents.');
    if (isOrg && !selectedCampuses.length) return Alert.alert('Validation', 'Please select at least one campus.');
    if (isSuper && !selectedCampuses.length) return Alert.alert('Validation', 'Please select at least one campus.');

    setSaving(true);
    try {
      if (isSuper) {
        const schoolId = selectedCampuses[0] || (editing ? (editing.school_id || form.school_id || filterCampus) : (form.school_id || filterCampus));
        if (editing) {
          await api.put(`/super-admin/schools/${schoolId}/parents/${editing.id}`, {
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
            password: form.password || undefined,
            campus_ids: selectedCampuses,
          });
        } else {
          await api.post(`/super-admin/schools/${schoolId}/parents`, {
            email: form.email,
            password: form.password,
            first_name: form.first_name,
            last_name: form.last_name,
            phone: form.phone,
            campus_ids: selectedCampuses,
          });
        }
      } else if (isOrg) {
        if (editing) {
          await api.put(`/org-admin/parents/${editing.id}`, {
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
            campus_ids: selectedCampuses,
          });
        } else {
          await api.post('/org-admin/parents', { ...form, campus_ids: selectedCampuses });
        }
      } else if (editing) {
        const upd = {
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
        };
        if (form.password) upd.password = form.password;
        await api.put(`/admin/parents/${editing.id}`, upd);
      } else {
        await api.post('/admin/parents', form);
      }
      setModal(false);
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = p => {
    const targetLabel = p.email || `${p.first_name} ${p.last_name}`;
    showDestructiveConfirm({
      title: 'Delete Parent',
      message: `Are you sure you want to delete ${targetLabel}? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const path = isSuper
            ? `/super-admin/schools/${p.school_id || filterCampus}/parents/${p.id}`
            : isOrg
              ? `/org-admin/parents/${p.id}`
              : `/admin/parents/${p.id}`;
          await api.delete(path);
          await load();
        } catch (err) {
          Alert.alert('Error', err?.response?.data?.message || 'Could not delete');
        }
      },
    });
  };

  const handleLinkExisting = async () => {
    const email = linkEmail.trim().toLowerCase();
    if (!email) return Alert.alert('Validation', 'Enter the parent email address.');
    setLinking2(true);
    try {
      await api.post('/admin/parents/link-existing', { email });
      setLinkModal(false);
      setLinkEmail('');
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not link parent.');
    } finally {
      setLinking2(false);
    }
  };

  const openCampusManager = p => {
    setCampusParent(p);
    setSelectedCampuses(getCampusIdsFromParent(p));
    setCampusModal(true);
  };

  const renderCampusChips = () => (
    <View style={styles.chipRow}>
      {campuses.map(c => {
        const sel = selectedCampuses.includes(c.id);
        return (
          <TouchableOpacity key={c.id} style={[styles.chip, sel && styles.chipActive]} onPress={() => toggleCampus(c.id)}>
            {sel && <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 4 }} />}
            <Text style={[styles.chipTxt, sel && styles.chipTxtActive]}>{c.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const handleSaveCampuses = async () => {
    if (!campusParent) return;
    if (!selectedCampuses.length) return Alert.alert('Validation', 'Please select at least one campus.');
    setCampusSaving(true);
    try {
      const schoolId = selectedCampuses[0] || campusParent.school_id;
      await api.put(`/super-admin/schools/${schoolId}/parents/${campusParent.id}`, {
        first_name: campusParent.first_name || '',
        last_name: campusParent.last_name || '',
        email: campusParent.email,
        phone: campusParent.phone || '',
        campus_ids: selectedCampuses,
      });
      setCampusModal(false);
      setCampusParent(null);
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update campuses');
    } finally {
      setCampusSaving(false);
    }
  };

  const openChildren = async p => {
    setSelectedParent(p);
    setChildren([]);
    setClasses([]);
    setSections([]);
    setStudents([]);
    setSelClass(null);
    setSelSection(null);
    setNameQ('');
    const defaultCampusId = Number(filterCampus || p.school_id || (Array.isArray(p.campus_ids) ? p.campus_ids[0] : null) || 0) || null;
    setChildCampusId(defaultCampusId);
    setChildModal(true);
    setChildrenLoading(true);
    try {
      const childPath = isSuper ? `/super-admin/parents/${p.id}/children` : `/admin/parents/${p.id}/children`;
      const classReq = isSuper
        ? (defaultCampusId ? api.get(`/super-admin/schools/${defaultCampusId}/classes`) : Promise.resolve({ data: [] }))
        : api.get('/classes');
      const [childRes, classRes] = await Promise.all([
        api.get(childPath),
        classReq,
      ]);
      setChildren(childRes.data.children || []);
      setClasses(Array.isArray(classRes.data) ? classRes.data : classRes.data.classes || []);
    } catch {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setChildrenLoading(false);
    }
  };

  const onSelectClass = async cls => {
    setSelClass(cls);
    setSelSection(null);
    setStudents([]);
    if (isSuper) {
      setSections(Array.isArray(cls.sections) ? cls.sections : []);
      return;
    }
    setSections([]);
    try {
      const { data } = await api.get(`/classes/${cls.id}/sections`);
      setSections(Array.isArray(data) ? data : data.sections || []);
    } catch {
      Alert.alert('Error', 'Failed to load sections');
    }
  };

  const onSelectSection = async sec => {
    setSelSection(sec);
    setStudents([]);
    setStuLoading(true);
    try {
      const req = isSuper
        ? api.get(`/super-admin/schools/${childCampusId}/students`, { params: { class_id: selClass.id, section_id: sec.id } })
        : api.get('/admin/students', { params: { class_id: selClass.id, section_id: sec.id } });
      const { data } = await req;
      setStudents(Array.isArray(data) ? data : data.students || []);
    } catch {
      Alert.alert('Error', 'Failed to load students');
    } finally {
      setStuLoading(false);
    }
  };

  const onLink = async student => {
    setLinking(true);
    try {
      const linkPath = isSuper
        ? `/super-admin/parents/${selectedParent.id}/link-child`
        : `/admin/parents/${selectedParent.id}/link-child`;
      const childPath = isSuper
        ? `/super-admin/parents/${selectedParent.id}/children`
        : `/admin/parents/${selectedParent.id}/children`;
      await api.post(linkPath, { student_id: student.id, relationship: 'parent' });
      const { data } = await api.get(childPath);
      setChildren(data.children || []);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to link');
    } finally {
      setLinking(false);
    }
  };

  const onUnlink = (studentId, name) => {
    Alert.alert('Remove Child', `Remove ${name} from this parent?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const unlinkPath = isSuper
              ? `/super-admin/parents/${selectedParent.id}/children/${studentId}`
              : `/admin/parents/${selectedParent.id}/children/${studentId}`;
            await api.delete(unlinkPath);
            setChildren(prev => prev.filter(c => c.student_id !== studentId));
          } catch {
            Alert.alert('Error', 'Failed to unlink');
          }
        },
      },
    ]);
  };

  const isLinked = id => children.some(c => c.student_id === id);

  const filteredStudents = students.filter(s => {
    if (!nameQ.trim()) return true;
    const q = nameQ.toLowerCase();
    return String(s.first_name || '').toLowerCase().includes(q) || String(s.last_name || '').toLowerCase().includes(q);
  });

  const filteredParents = parents.filter(p => {
    const q = search.toLowerCase();
    return (
      String(p.first_name || '').toLowerCase().includes(q) ||
      String(p.last_name || '').toLowerCase().includes(q) ||
      String(p.email || '').toLowerCase().includes(q) ||
      String(p.phone || '').toLowerCase().includes(q) ||
      (p.campus_names || []).some(n => String(n || '').toLowerCase().includes(q)) ||
      String(p.campus_name || p.school_name || '').toLowerCase().includes(q)
    );
  });

  const orgFilterItems = [{ label: 'All Organizations', value: '' }, ...organizations.map(o => ({ label: o.name, value: String(o.id) }))];
  const campusFilterItems = [{ label: 'All Campuses', value: '' }, ...campuses.map(c => ({ label: c.name, value: String(c.id) }))];
  const orgIeScope = buildImportExportScope({
    mode: 'orgadmin',
    campusId: filterCampus,
    requireCampusForScopedRoles: false,
  });
  const superIeScope = buildImportExportScope({
    mode: 'superadmin',
    campusId: filterCampus,
    requireCampusForScopedRoles: true,
  });

  return (
    <View style={styles.container}>
      <AppHeader title="Parents" navigation={navigation} />

      <ManagerSearchAddRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search parents..."
        onAddPress={openAdd}
      />
      {isSuper ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField label="" value={filterOrg} onChange={setFilterOrg} items={orgFilterItems} placeholder="Filter by organization" />
        </View>
      ) : null}
      {(isOrg || isSuper) ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <PickerField label="" value={filterCampus} onChange={setFilterCampus} items={campusFilterItems} placeholder="Filter by campus" />
        </View>
      ) : null}
      {isOrg ? (
        <ImportExportBar
          templatePath="/org-admin/import-export/parents/template"
          templateParams={orgIeScope.params}
          importPath="/org-admin/import-export/parents/import"
          importFields={orgIeScope.params}
          exportPath="/org-admin/import-export/parents/export"
          exportParams={orgIeScope.params}
          exportFilename="parents_export.xlsx"
          templateFilename="parents_template.xlsx"
          onImportDone={load}
        />
      ) : null}
      {isSuper ? (
        superIeScope.showBar ? (
          <ImportExportBar
            templatePath="/org-admin/import-export/parents/template"
            templateParams={superIeScope.params}
            importPath="/org-admin/import-export/parents/import"
            importFields={superIeScope.params}
            exportPath="/org-admin/import-export/parents/export"
            exportParams={superIeScope.params}
            exportFilename="parents_export.xlsx"
            templateFilename="parents_template.xlsx"
            onImportDone={load}
          />
        ) : null
      ) : null}
      {!isOrg && !isSuper ? (
        <ImportExportBar
          templatePath="/import-export/parents/template"
          templateFilename="parents_template.xlsx"
          importPath="/import-export/parents/import"
          importFields={{}}
          exportPath="/import-export/parents/export"
          exportFilename="parents_export.xlsx"
          onImportDone={load}
        />
      ) : null}
      {!isOrg && !isSuper ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Pressable style={styles.linkExistingBtn} onPress={() => { setLinkEmail(''); setLinkModal(true); }}>
            <Ionicons name="link-outline" size={16} color={C.primary} />
            <Text style={styles.linkExistingTxt}>Link Existing Parent</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filteredParents}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={
            <EntityEmptyState
              icon="people-circle-outline"
              title={isSuper && !filterOrg && !filterCampus ? "Select an organization or campus" : "No parent accounts yet"}
              subtitle={isSuper && !filterOrg && !filterCampus ? "Choose an organization or campus from the filters above to view parents" : "Add or import parents to continue"}
            />
          }
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]} onPress={() => openEdit(item)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.first_name || ''} {item.last_name || ''}</Text>
                <Text style={styles.sub}>{item.email}</Text>
                {item.phone ? <Text style={styles.sub}>{normalizePhoneForForm(item.phone)}</Text> : null}
                {(item.campus_names || []).length > 0 && (
                  <View style={styles.badgeRow}>
                    {item.campus_names.map((n, i) => (
                      <View key={i} style={styles.badge}><Text style={styles.badgeTxt}>🏫 {n}</Text></View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.actionBtns}>
                {isSuper ? (
                  <TouchableOpacity onPress={() => openCampusManager(item)} style={styles.actionBtn}>
                    <Ionicons name="business-outline" size={17} color="#7C3AED" />
                  </TouchableOpacity>
                ) : null}
                {!isOrg ? (
                  <TouchableOpacity onPress={() => openChildren(item)} style={styles.actionBtn}><Ionicons name="people-outline" size={17} color={C.primary} /></TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}><Ionicons name="pencil-outline" size={17} color="#2563EB" /></TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, styles.actionBtnDanger]}><Ionicons name="trash-outline" size={17} color="#C2410C" /></TouchableOpacity>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={linkModal} transparent animationType="slide" onRequestClose={() => setLinkModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Link Existing Parent</Text>
            <Text style={styles.helpText}>If a parent exists in another campus, enter their email to link access for this campus.</Text>
            <Text style={S.label}>Parent Email *</Text>
            <TextInput style={S.input} placeholder="parent@email.com" value={linkEmail} onChangeText={setLinkEmail} keyboardType="email-address" autoCapitalize="none" />
            <ModalFooterActions onCancel={() => setLinkModal(false)} onConfirm={handleLinkExisting} confirmText="Link" loading={linking2} />
          </View>
        </View>
      </Modal>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Parent' : 'Add Parent'}</Text>

              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={v => F('email', v)} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.label}>{editing ? 'New Password (leave blank to keep)' : 'Password *'}</Text>
              <View style={styles.passwordWrap}>
                <TextInput style={[styles.input, styles.passwordInput]} value={form.password} onChangeText={v => F('password', v)} secureTextEntry={!showPw} />
                <Pressable onPress={() => setShowPw(p => !p)} style={styles.eyeToggle} hitSlop={8}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
                </Pressable>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput style={styles.input} value={form.first_name} onChangeText={v => F('first_name', v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput style={styles.input} value={form.last_name} onChangeText={v => F('last_name', v)} />
                </View>
              </View>

              <Text style={styles.label}>Phone * (03XXXXXXXXX)</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={v => F('phone', v)} keyboardType="phone-pad" placeholder="03XXXXXXXXX" maxLength={11} />

              {isOrg && (
                <>
                  <Text style={styles.label}>Campuses * (select one or more)</Text>
                  {renderCampusChips()}
                </>
              )}

              {isSuper && (
                <>
                  <Text style={styles.label}>Campuses * (select one or more)</Text>
                  {renderCampusChips()}
                </>
              )}

              {editing && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>Danger Zone</Text>
                  <Pressable style={[styles.modalBtn, styles.dangerModalBtn, { marginTop: 8 }]} onPress={() => { const cur = editing; setModal(false); handleDelete(cur); }}>
                    <Text style={styles.dangerModalBtnText}>Delete Parent</Text>
                  </Pressable>
                </>
              )}

              <ModalFooterActions onCancel={() => setModal(false)} onConfirm={handleSave} loading={saving} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={campusModal} transparent animationType="slide" onRequestClose={() => setCampusModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Manage Campuses</Text>
            <Text style={styles.helpText}>
              {campusParent ? `Update campus access for ${campusParent.first_name || ''} ${campusParent.last_name || ''}`.trim() : 'Update campus access'}
            </Text>
            <Text style={styles.label}>Campuses * (select one or more)</Text>
            {renderCampusChips()}
            <ModalFooterActions
              onCancel={() => { setCampusModal(false); setCampusParent(null); }}
              onConfirm={handleSaveCampuses}
              confirmText="Save Campuses"
              loading={campusSaving}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={childModal} transparent animationType="slide" onRequestClose={() => setChildModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.childrenSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedParent ? `${selectedParent.first_name || ''} ${selectedParent.last_name || ''}`.trim() || selectedParent.email : ''} - Children</Text>
              <Pressable onPress={() => setChildModal(false)}><Ionicons name="close" size={26} color={C.textDark} /></Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              <Text style={styles.sectionLabel}>Linked Children</Text>
              {childrenLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />
              ) : children.length === 0 ? (
                <Text style={styles.empty2}>No children linked yet</Text>
              ) : (
                children.map(c => {
                  const isOwnCampus = isSuper ? true : c.school_id === mySchoolId;
                  return (
                    <View key={c.student_id} style={styles.childRow}>
                      <View style={[styles.childAvatar, !isOwnCampus && { backgroundColor: '#F1F5F9' }]}>
                        <Text style={styles.avatarText}>{(c.first_name || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{c.first_name} {c.last_name}</Text>
                        <Text style={styles.sub}>{c.relationship || 'parent'}{!isOwnCampus ? ' - Other campus' : ''}</Text>
                      </View>
                      {isOwnCampus ? (
                        <Pressable onPress={() => onUnlink(c.student_id, `${c.first_name} ${c.last_name}`)}>
                          <Ionicons name="close-circle" size={22} color="#C2410C" />
                        </Pressable>
                      ) : (
                        <View style={styles.lockedBadge}>
                          <Ionicons name="lock-closed" size={12} color="#94A3B8" />
                          <Text style={styles.lockedBadgeTxt}>Locked</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Search and Add Student</Text>

              <Text style={styles.filterLabel}>Class</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {classes.map(cls => {
                  const active = selClass && selClass.id === cls.id;
                  return (
                    <TouchableOpacity key={cls.id} style={[styles.chip, active && styles.chipActive]} onPress={() => onSelectClass(cls)}>
                      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{cls.class_name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selClass ? (
                <>
                  <Text style={styles.filterLabel}>Section</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {sections.map(sec => {
                      const active = selSection && selSection.id === sec.id;
                      return (
                        <TouchableOpacity key={sec.id} style={[styles.chip, active && styles.chipActive]} onPress={() => onSelectSection(sec)}>
                          <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{sec.section_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {selSection ? (
                <>
                  <TextInput style={[styles.input, { marginBottom: 8 }]} placeholder="Search by name..." value={nameQ} onChangeText={setNameQ} />
                  {stuLoading ? (
                    <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
                  ) : filteredStudents.length === 0 ? (
                    <Text style={styles.empty2}>No students found</Text>
                  ) : (
                    filteredStudents.map(s => {
                      const linked = isLinked(s.id);
                      return (
                        <View key={s.id} style={styles.stuRow}>
                          <View style={styles.childAvatar}><Text style={styles.avatarText}>{(s.first_name || '?')[0].toUpperCase()}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.name}>{s.first_name} {s.last_name}</Text>
                            <Text style={styles.sub}>{s.roll_no ? `ID: ${s.roll_no}` : `DB ID: ${s.id}`}</Text>
                          </View>
                          {linked ? (
                            <View style={styles.linkedBadge}><Text style={styles.linkedBadgeTxt}>Linked</Text></View>
                          ) : (
                            <Pressable style={[styles.linkBtn, linking && { opacity: 0.6 }]} onPress={() => onLink(s)} disabled={linking}>
                              {linking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.linkBtnTxt}>+ Link</Text>}
                            </Pressable>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              ) : null}
            </ScrollView>
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
  card: { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  avatar: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  childAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  avatarText: { color: C.primary, fontWeight: '800', fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700', color: C.textDark },
  sub: { fontSize: 12, color: C.textLight, marginTop: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  badge: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  actionBtnDanger: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
  linkExistingBtn: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  linkExistingTxt: { color: C.primary, fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  empty2: { fontSize: 13, color: C.textLight, textAlign: 'center', marginVertical: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  childrenSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 10, maxHeight: '92%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, flex: 1, marginRight: 8 },
  helpText: { color: '#64748B', fontSize: 13, marginBottom: 14, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeToggle: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: C.textMed, marginBottom: 6 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerModalBtn: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
  cancelBtn: { backgroundColor: C.border },
  saveBtn: { backgroundColor: C.primary },
  cancelBtnText: { color: C.textMed, fontWeight: '700' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  dangerModalBtnText: { color: '#9A3412', fontWeight: '800' },
  childRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  stuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8, flexDirection: 'row', alignItems: 'center' },
  chipActive: { backgroundColor: C.primary },
  chipTxt: { fontSize: 13, fontWeight: '600', color: C.textMed },
  chipTxtActive: { color: '#fff' },
  linkBtn: { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  linkBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  linkedBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  linkedBadgeTxt: { fontSize: 12, fontWeight: '600', color: '#059669' },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  lockedBadgeTxt: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
});