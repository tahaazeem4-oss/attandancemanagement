import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import api from '../../services/api';
import { C, S } from '../../config/theme';
import ImportExportBar from '../../components/ImportExportBar';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/AppHeader';

export default function AdminClassesScreen({ navigation }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'class' | 'detail'
  const [name, setName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshTarget = useCallback(async (classId) => {
    const list = await load();
    const updated = list.find(c => String(c.id) === String(classId));
    setTarget(updated || null);
  }, [load]);

  const handleAddClass = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Class name is required.');
    setSaving(true);
    try {
      await api.post('/admin/classes', { class_name: name.trim() });
      setModal(null);
      setName('');
      await load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClass = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Class name is required.');
    if (!target?.id) return;
    setSaving(true);
    try {
      await api.put(`/admin/classes/${target.id}`, { class_name: name.trim() });
      await refreshTarget(target.id);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = (cls) => {
    if (!cls?.id) return;
    Alert.alert('Delete Class', `Delete "${cls.class_name}" and all its sections/data?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/classes/${cls.id}`);
            setModal(null);
            setTarget(null);
            setName('');
            setSectionName('');
            await load();
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Failed');
          }
        },
      },
    ]);
  };

  const handleAddSection = async () => {
    if (!sectionName.trim()) return Alert.alert('Validation', 'Section name is required.');
    if (!target?.id) return;
    setSaving(true);
    try {
      await api.post(`/admin/classes/${target.id}/sections`, { section_name: sectionName.trim() });
      setSectionName('');
      await refreshTarget(target.id);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = (sec, className) => {
    if (!sec?.id || !target?.id) return;
    Alert.alert('Delete Section', `Delete Section ${sec.section_name} from ${className}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/sections/${sec.id}`);
            await refreshTarget(target.id);
          } catch (err) {
            Alert.alert('Error', err?.response?.data?.message || 'Failed');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Classes & Sections" navigation={navigation} />
      <ImportExportBar
        templatePath="/import-export/classes/template"
        templateFilename="classes_template.xlsx"
        importPath="/import-export/classes/import"
        exportPath="/import-export/classes/export"
        exportFilename="classes_export.xlsx"
        onImportDone={load}
      />

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={classes}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.empty}>No classes yet.</Text>}
          renderItem={({ item: cls }) => (
            <Pressable
              style={({ pressed }) => [styles.classCard, pressed && { opacity: 0.88 }]}
              onPress={() => {
                setTarget(cls);
                setName(cls.class_name);
                setSectionName('');
                setModal('detail');
              }}
            >
              <View style={styles.classHeader}>
                <View style={styles.classIconWrap}>
                  <Ionicons name="school-outline" size={18} color={C.primary} />
                </View>
                <Text style={styles.className}>{cls.class_name}</Text>
                <View style={styles.eyeBtn}>
                  <Ionicons name="eye-outline" size={16} color={C.primary} />
                </View>
              </View>
              {cls.sections.length > 0 && (
                <View style={styles.sectionList}>
                  {cls.sections.map(sec => (
                    <View key={sec.id} style={styles.sectionChip}>
                      <Text style={styles.sectionText}>Section {sec.section_name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => {
          setName('');
          setSectionName('');
          setModal('class');
        }}
      >
        <Text style={styles.fabText}>+ Add Class</Text>
      </Pressable>

      <Modal visible={modal === 'class'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Class</Text>
            <Text style={S.label}>Class Name *</Text>
            <TextInput style={S.input} placeholder="e.g. Grade 6" value={name} onChangeText={setName} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleAddClass} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modal === 'detail'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Class Details</Text>

            <Text style={S.label}>Class Name *</Text>
            <TextInput style={S.input} value={name} onChangeText={setName} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleEditClass} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save Class</Text>}
              </Pressable>
            </View>

            <View style={styles.divider} />

            <Text style={styles.modalSub}>Sections in {target?.class_name}</Text>
            <ScrollView style={{ maxHeight: 140 }} contentContainerStyle={{ gap: 8 }}>
              {(target?.sections || []).length === 0 ? (
                <Text style={styles.noSectionsTxt}>No sections yet.</Text>
              ) : (
                (target?.sections || []).map(sec => (
                  <View key={sec.id} style={styles.sectionRow}>
                    <Text style={styles.sectionRowTxt}>Section {sec.section_name}</Text>
                    <Pressable onPress={() => handleDeleteSection(sec, target?.class_name)}>
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>

            <Text style={[S.label, { marginTop: 12 }]}>Add Section *</Text>
            <TextInput
              style={S.input}
              placeholder="e.g. D"
              autoCapitalize="characters"
              value={sectionName}
              onChangeText={setSectionName}
            />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#059669' }]} onPress={handleAddSection} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add Section</Text>}
              </Pressable>
            </View>

            <View style={styles.divider} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(null)}>
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
  classCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    marginBottom: 12,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  classHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  classIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  className: { flex: 1, fontSize: 15, fontWeight: '800', color: C.textDark },
  eyeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  sectionText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: { backgroundColor: C.card, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  modalSub: { fontSize: 13, color: C.textMed, marginBottom: 12 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sectionRowTxt: { color: C.primary, fontSize: 12, fontWeight: '700' },
  noSectionsTxt: { color: C.textLight, fontSize: 12, fontStyle: 'italic' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn: { backgroundColor: C.border },
  saveBtn: { backgroundColor: C.primary },
  cancelText: { color: C.textMed, fontWeight: '700' },
  saveText: { color: '#fff', fontWeight: '700' },
});
