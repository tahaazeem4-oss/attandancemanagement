import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, StyleSheet, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import api from '../../services/api';
import { C, S } from '../../config/theme';
import ImportExportBar from '../../components/ImportExportBar';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/AppHeader';

export default function AdminClassesScreen({ navigation }) {
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null); // 'class' | 'section' | 'editClass'
  const [name,     setName]     = useState('');
  const [target,   setTarget]   = useState(null); // class being edited or class for new section
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/admin/classes'); setClasses(data); }
    catch { Alert.alert('Error', 'Could not load classes'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleAddClass = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Class name is required.');
    setSaving(true);
    try { await api.post('/admin/classes', { class_name: name.trim() }); setModal(null); setName(''); load(); }
    catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEditClass = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Class name is required.');
    setSaving(true);
    try { await api.put(`/admin/classes/${target.id}`, { class_name: name.trim() }); setModal(null); setName(''); load(); }
    catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteClass = (c) => {
    Alert.alert('Delete Class', `Delete "${c.class_name}" and all its sections/data?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/admin/classes/${c.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
      }},
    ]);
  };

  const handleAddSection = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Section name is required.');
    setSaving(true);
    try { await api.post(`/admin/classes/${target.id}/sections`, { section_name: name.trim() }); setModal(null); setName(''); load(); }
    catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteSection = (sec, className) => {
    Alert.alert('Delete Section', `Delete Section ${sec.section_name} from ${className}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/admin/sections/${sec.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
      }},
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
      {loading
        ? <ActivityIndicator color={C.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={classes}
            keyExtractor={c => String(c.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No classes yet.</Text>}
            renderItem={({ item: cls }) => (
              <View style={styles.classCard}>
                <View style={styles.classHeader}>
                  <View style={styles.classIconWrap}><Ionicons name="school-outline" size={18} color={C.primary} /></View>
                  <Text style={styles.className}>{cls.class_name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable style={[styles.smBtn, { backgroundColor: '#EEF2FF' }]} onPress={() => { setTarget(cls); setName(cls.class_name); setModal('editClass'); }}>
                      <Text style={[styles.smBtnText, { color: C.primary }]}>Edit</Text>
                    </Pressable>
                    <Pressable style={[styles.smBtn, { backgroundColor: '#ECFDF5' }]} onPress={() => { setTarget(cls); setName(''); setModal('section'); }}>
                      <Text style={[styles.smBtnText, { color: '#059669' }]}>+ Sec</Text>
                    </Pressable>
                    <Pressable style={[styles.smBtn, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDeleteClass(cls)}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
                {cls.sections.length > 0 && (
                  <View style={styles.sectionList}>
                    {cls.sections.map(sec => (
                      <View key={sec.id} style={styles.sectionChip}>
                        <Text style={styles.sectionText}>Section {sec.section_name}</Text>
                        <Pressable onPress={() => handleDeleteSection(sec, cls.class_name)}>
                          <Text style={styles.sectionDelete}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          />
        )}

      <Pressable style={styles.fab} onPress={() => { setName(''); setModal('class'); }}>
        <Text style={styles.fabText}>+ Add Class</Text>
      </Pressable>

      {/* Add Class Modal */}
      <Modal visible={modal === 'class'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Class</Text>
            <Text style={S.label}>Class Name *</Text>
            <TextInput style={S.input} placeholder="e.g. Grade 6" value={name} onChangeText={setName} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleAddClass} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Class Modal */}
      <Modal visible={modal === 'editClass'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Class</Text>
            <Text style={S.label}>Class Name *</Text>
            <TextInput style={S.input} value={name} onChangeText={setName} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleEditClass} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Section Modal */}
      <Modal visible={modal === 'section'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Section</Text>
            <Text style={styles.modalSub}>to {target?.class_name}</Text>
            <Text style={S.label}>Section Name *</Text>
            <TextInput style={S.input} placeholder="e.g. D" autoCapitalize="characters" value={name} onChangeText={setName} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#059669' }]} onPress={handleAddSection} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  classCard:    { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  classHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  classIconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  classIcon:    { fontSize: 18 },
  className:    { flex: 1, fontSize: 15, fontWeight: '800', color: C.textDark },
  smBtn:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smBtnText:    { fontSize: 11, fontWeight: '700' },
  sectionList:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.border },
  sectionChip:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  sectionText:  { color: C.primary, fontSize: 12, fontWeight: '700' },
  sectionDelete:{ color: '#EF4444', fontSize: 12, fontWeight: '800' },
  empty:        { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:          { position: 'absolute', bottom: 24, right: 20, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6 },
  fabText:      { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard:    { backgroundColor: C.card, borderRadius: 20, padding: 24 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  modalSub:     { fontSize: 13, color: C.textMed, marginBottom: 16 },
  modalBtns:    { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:    { backgroundColor: C.border },
  saveBtn:      { backgroundColor: C.primary },
  cancelText:   { color: C.textMed, fontWeight: '700' },
  saveText:     { color: '#fff', fontWeight: '700' },
});
