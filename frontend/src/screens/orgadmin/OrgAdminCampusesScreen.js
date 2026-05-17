import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, Alert, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import ImportExportBar from '../../components/ImportExportBar';
import ScreenIntroCard from '../../components/ScreenIntroCard';
import { showDestructiveConfirm } from '../../lib/confirmDialog';

const EMPTY_FORM = { name: '', tagline: '', initials: '' };

export default function OrgAdminCampusesScreen({ navigation }) {
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logoUri, setLogoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/org-admin/campuses')
      .then(({ data }) => setCampuses(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = campuses.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setLogoUri(null); setModalVisible(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ name: item.name || '', tagline: item.tagline || '', initials: item.initials || '' });
    setLogoUri(item.logo_url || null);
    setModalVisible(true);
  };

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission required', 'Allow access to your photo library to upload a logo.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setLogoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return Alert.alert('Validation', 'Campus name is required.');
    setSaving(true);
    try {
      let campusId = editing?.id;
      if (editing) {
        await api.put(`/org-admin/campuses/${editing.id}`, form);
      } else {
        const { data } = await api.post('/org-admin/campuses', form);
        campusId = data.id;
      }
      // Upload logo if a new local URI was selected
      if (logoUri && !logoUri.startsWith('http') && campusId) {
        const formData = new FormData();
        const filename = logoUri.split('/').pop() || 'logo.jpg';
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append('logo', { uri: logoUri, name: filename, type: mime });
        await api.post(`/org-admin/campuses/${campusId}/logo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setModalVisible(false);
      load();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save campus.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    showDestructiveConfirm({
      title: 'Delete Campus',
      message: `Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.delete(`/org-admin/campuses/${item.id}`);
          load();
        } catch (err) {
          Alert.alert('Error', err?.response?.data?.message || 'Could not delete.');
        }
      },
    });
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {item.logo_url
        ? <Image source={{ uri: item.logo_url }} style={styles.logoImg} />
        : <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="business-outline" size={22} color="#2563EB" />
          </View>
      }
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        {item.tagline ? <Text style={styles.sub}>{item.tagline}</Text> : null}
        <View style={styles.statsRow}>
          <Text style={styles.stat}><Text style={styles.statNum}>{item.teacher_count ?? 0}</Text> Teachers</Text>
          <Text style={styles.statSep}>·</Text>
          <Text style={styles.stat}><Text style={styles.statNum}>{item.student_count ?? 0}</Text> Students</Text>
          <Text style={styles.statSep}>·</Text>
          <Text style={styles.stat}><Text style={styles.statNum}>{item.class_count ?? 0}</Text> Classes</Text>
        </View>
      </View>
      <View style={styles.actionBtns}>
        <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={18} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, styles.actionBtnDanger]}>
          <Ionicons name="trash-outline" size={18} color="#C2410C" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Campuses" navigation={navigation} />
      <ScreenIntroCard
        title="Campuses"
        description="Manage campus details, branding, and imports here so class, teacher, student, and subject data all stay aligned to the correct campus."
        icon="business-outline"
        tone="pink"
      />
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search campuses..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <ImportExportBar
        templatePath="/org-admin/import-export/campuses/template"
        importPath="/org-admin/import-export/campuses/import"
        exportPath="/org-admin/import-export/campuses/export"
        exportFilename="campuses_export.xlsx"
        templateFilename="campuses_template.xlsx"
        onImportDone={load}
      />
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
        : <FlatList
            data={filtered}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
            ListEmptyComponent={<Text style={styles.empty}>No campuses found.</Text>}
          />
      }

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Campus' : 'Add Campus'}</Text>
            <ScrollView>
              {/* Logo picker */}
              <Text style={styles.label}>Campus Logo</Text>
              <TouchableOpacity onPress={pickLogo} style={styles.logoPicker}>
                {logoUri
                  ? <Image source={{ uri: logoUri }} style={styles.logoPreview} />
                  : <View style={styles.logoPlaceholder}>
                      <Ionicons name="camera-outline" size={28} color="#94A3B8" />
                      <Text style={styles.logoPlaceholderTxt}>Tap to select logo</Text>
                    </View>
                }
              </TouchableOpacity>
              <Text style={styles.label}>Campus Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Main Campus"
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
              />
              <Text style={styles.label}>Tagline</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Excellence in Education"
                value={form.tagline}
                onChangeText={v => setForm(f => ({ ...f, tagline: v }))}
              />
              <Text style={styles.label}>Initials (2–3 letters)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. MC"
                value={form.initials}
                onChangeText={v => setForm(f => ({ ...f, initials: v.toUpperCase() }))}
                maxLength={4}
                autoCapitalize="characters"
              />
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Save</Text>}
              </TouchableOpacity>
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
  addBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 10, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: C.textDark, marginBottom: 2 },
  sub: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  stat: { fontSize: 11, color: '#64748B' },
  statNum: { fontWeight: '700', color: C.textDark },
  statSep: { fontSize: 11, color: '#CBD5E1' },
  actionBtns: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F8FAFC' },
  actionBtnDanger: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
  logoImg: { width: 44, height: 44, borderRadius: 12 },
  logoPicker: { alignSelf: 'center', marginVertical: 8 },
  logoPreview: { width: 90, height: 90, borderRadius: 16, borderWidth: 2, borderColor: C.primary },
  logoPlaceholder: { width: 90, height: 90, borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  logoPlaceholderTxt: { fontSize: 10, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 14, color: C.textDark, borderWidth: 1, borderColor: '#E2E8F0' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelTxt: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700' },
});
