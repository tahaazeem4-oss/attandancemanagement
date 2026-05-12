import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
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

export default function SubjectsManagerScreen({ navigation, mode }) {
  const isOrg = mode === 'orgadmin';
  const isSuper = mode === 'superadmin';

  const [organizations, setOrganizations] = useState([]);
  const [orgId, setOrgId] = useState('');
  const [campuses, setCampuses] = useState([]);
  const [campusId, setCampusId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);

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
      return;
    }

    if (!isOrg) return;
    api
      .get('/org-admin/campuses')
      .then(({ data }) => {
        setCampuses(data || []);
        if ((data || []).length === 1) setCampusId(String(data[0].id));
      })
      .catch(() => {});
  }, [isOrg, isSuper]);

  useEffect(() => {
    if (!isSuper) return;
    api.get('/super-admin/schools')
      .then(({ data }) => {
        const allCampuses = data || [];
        const filteredCampuses = orgId
          ? allCampuses.filter(c => String(c.org_id) === String(orgId))
          : allCampuses;
        setCampuses(filteredCampuses);
      })
      .catch(() => setCampuses([]));
    setCampusId('');
  }, [isSuper, orgId]);

  const load = useCallback(async () => {
    if ((isOrg || isSuper) && !campusId) {
      setSubjects([]);
      return;
    }

    setLoading(true);
    try {
      if (isSuper) {
        const { data } = await api.get(`/super-admin/schools/${campusId}/subjects`);
        setSubjects(data || []);
      } else if (isOrg) {
        const { data } = await api.get('/org-admin/subjects', { params: { campus_id: campusId } });
        setSubjects(data || []);
      } else {
        const { data } = await api.get('/subjects');
        setSubjects(data || []);
      }
    } catch (err) {
      if (!isOrg) {
        const msg = err?.response?.data?.message || '';
        if (err?.response?.status === 503 || msg.toLowerCase().includes('migration')) {
          Alert.alert(
            'Database Setup Required',
            'Run backend/migrations/add_school_subjects.sql in Supabase SQL editor, then restart backend.',
          );
        } else {
          Alert.alert('Error', 'Could not load subjects');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isOrg, isSuper, campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setFormName('');
    setModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setFormName(item.name || '');
    setModal(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) return Alert.alert('Validation', 'Enter a subject name.');
    if ((isOrg || isSuper) && !campusId) return Alert.alert('Validation', 'Select a campus first.');

    setSaving(true);
    try {
      if (editing) {
        if (isSuper) {
          await api.put(`/super-admin/schools/${campusId}/subjects/${editing.id}`, { name });
        } else if (isOrg) {
          await api.put(`/org-admin/subjects/${editing.id}`, { name, campus_id: parseInt(campusId, 10) });
        } else {
          await api.put(`/subjects/${editing.id}`, { name });
        }
        await load();
      } else {
        if (isSuper) {
          await api.post(`/super-admin/schools/${campusId}/subjects`, { name });
          await load();
        } else if (isOrg) {
          await api.post('/org-admin/subjects', { name, campus_id: parseInt(campusId, 10) });
          await load();
        } else {
          const { data } = await api.post('/subjects', { name });
          setSubjects(prev =>
            prev.find(s => s.id === data.id)
              ? prev
              : [...prev, data].sort((a, b) => String(a.name).localeCompare(String(b.name))),
          );
        }
      }
      setModal(false);
    } catch (err) {
      if (!isOrg && err?.response?.status === 503) {
        Alert.alert(
          'Database Setup Required',
          'Run backend/migrations/add_school_subjects.sql in Supabase SQL editor, then restart backend.',
        );
      } else {
        Alert.alert('Error', err?.response?.data?.message || 'Could not save subject.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    if (!isOrg && !isSuper && !item?.id) {
      Alert.alert(
        'Not Deletable Yet',
        'This subject came from lecture history. Add it once in Subjects to manage/delete it from this screen.',
      );
      return;
    }

    Alert.alert('Delete Subject', `Remove "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (isSuper) {
              await api.delete(`/super-admin/schools/${campusId}/subjects/${item.id}`);
            } else if (isOrg) {
              await api.delete(`/org-admin/subjects/${item.id}`);
            } else {
              await api.delete(`/subjects/${item.id}`);
            }
            setSubjects(prev => prev.filter(s => s.id !== item.id));
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete subject.');
          }
        },
      },
    ]);
  };

  const orgItems = [{ label: 'All Organizations', value: '' }, ...organizations.map(o => ({ label: o.name, value: String(o.id) }))];
  const campusItems = campuses.map(c => ({ label: c.name, value: String(c.id) }));
  const filteredSubjects = subjects.filter(s => String(s.name || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title="Subjects" navigation={navigation} />

      <ManagerSearchAddRow
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search subjects..."
        onAddPress={openAdd}
      />

      {!isOrg && !isSuper && (
        <ImportExportBar
          templatePath="/import-export/subjects/template"
          templateFilename="subjects_template.xlsx"
          importPath="/import-export/subjects/import"
          exportPath="/import-export/subjects/export"
          exportFilename="subjects_export.xlsx"
          onImportDone={load}
        />
      )}

      {(isOrg || isSuper) && (
        <View style={styles.pickerWrap}>
          {isSuper ? (
            <PickerField
              label=""
              value={orgId}
              onChange={setOrgId}
              items={orgItems}
              placeholder="Filter by organization"
            />
          ) : null}
          <PickerField
            label=""
            value={campusId}
            onChange={setCampusId}
            items={campusItems}
            placeholder="Select campus to manage subjects"
          />
        </View>
      )}

      {(isOrg || isSuper) && !campusId ? (
        <View style={styles.empty}>
          <Ionicons name="school-outline" size={44} color="#CBD5E1" />
          <Text style={styles.emptyTxt}>Select a campus</Text>
          <Text style={styles.emptySub}>Choose a campus above to manage its subjects</Text>
        </View>
      ) : (
        <>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
          ) : (
            <FlatList
              data={filteredSubjects}
              keyExtractor={i => String(i.id)}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <EntityEmptyState icon="book-outline" title="No subjects yet" subtitle="Add your first subject to get started" />
              }
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Ionicons name="book-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                  <Text style={styles.subjectName}>{item.name}</Text>
                  <View style={styles.actionBtns}>
                    <Pressable onPress={() => openEdit(item)} style={styles.actionBtn}>
                      <Ionicons name="pencil-outline" size={18} color="#2563EB" />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(item)}
                      style={[styles.actionBtn, !isOrg && !isSuper && !item?.id && { opacity: 0.35 }]}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </>
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Subject' : 'Add Subject'}</Text>
            <Text style={styles.label}>Subject Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mathematics"
              placeholderTextColor="#94A3B8"
              value={formName}
              onChangeText={setFormName}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {(isOrg || isSuper) ? (
              <>
                <Text style={styles.label}>Campus *</Text>
                <PickerField
                  label=""
                  value={campusId}
                  onChange={setCampusId}
                  items={campusItems}
                  placeholder="Select campus"
                />
              </>
            ) : null}
            <ModalFooterActions
              onCancel={() => setModal(false)}
              onConfirm={handleSave}
              confirmText={editing ? 'Save' : 'Add'}
              loading={saving}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  pickerWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: C.textDark,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  subjectName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.textDark },
  actionBtns: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyList: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTxt: { fontSize: 16, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
  emptySub: { fontSize: 13, color: '#CBD5E1', textAlign: 'center', paddingHorizontal: 32 },
});
