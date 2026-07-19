// frontend/src/features/aiTutor/screens/TeacherAiMaterialsScreen.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import api from '../../../services/api';
import { deleteMaterial, listMaterials, uploadMaterial } from '../api/aiTutorApi';
import ScreenIntroCard from '../../../components/ScreenIntroCard';
import { C, S } from '../../../config/theme';

const STATUS_COLORS = {
  uploaded: '#9CA3AF', processing: '#F59E0B', ready: '#10B981', failed: '#EF4444', archived: '#6B7280',
};
const ALLOWED_EXT = new Set(['pdf', 'docx', 'pptx', 'txt']);
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

function getUploadErrorMessage(error) {
  const message = error?.response?.data?.message || error?.message || 'Upload failed. Please try again.';

  if (/Network request failed/i.test(message)) {
    return 'The file could not be sent. Please pick the file again and retry.';
  }
  if (/unsupported file extension|unsupported mime type/i.test(message)) {
    return 'Use a PDF, DOCX, PPTX, or TXT file.';
  }
  if (/file too large/i.test(message)) {
    return 'The selected file is larger than 25 MB.';
  }
  if (/subject_id required/i.test(message)) {
    return 'Select a subject before uploading.';
  }
  if (/campus_id required|invalid campus|subject does not belong to campus/i.test(message)) {
    return 'Your school scope could not be verified. Sign in again and retry.';
  }

  return message;
}

async function normalizePickedAsset(asset) {
  const name = asset?.name || 'material-upload';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const type = asset?.mimeType || 'application/octet-stream';
  const size = typeof asset?.size === 'number' ? asset.size : null;

  if (!ALLOWED_EXT.has(ext)) {
    throw new Error('Use a PDF, DOCX, PPTX, or TXT file.');
  }
  if (size && size > MAX_SIZE_BYTES) {
    throw new Error('The selected file is larger than 25 MB.');
  }

  if (Platform.OS === 'web' && asset?.file) {
    return { filePart: asset.file, ext, size: asset.file.size || size };
  }

  let uri = asset?.uri;
  if (!uri) throw new Error('The selected file is missing a usable URI.');

  if (!String(uri).startsWith('file://')) {
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const cachedUri = `${FileSystem.cacheDirectory}ai_material_${Date.now()}_${safeName}`;
    await FileSystem.copyAsync({ from: uri, to: cachedUri });
    uri = cachedUri;
  }

  return {
    filePart: { uri, name, type },
    ext,
    size,
  };
}

export default function TeacherAiMaterialsScreen({ navigation, route }) {
  const paramCampus = route?.params?.campusId;
  const paramSubject = route?.params?.subjectId;
  const paramClass = route?.params?.classId;
  const paramSection = route?.params?.sectionId;

  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjectId, setSubjectId] = useState(paramSubject || null);
  const [classSel, setClassSel] = useState(
    paramClass ? { class_id: paramClass, section_id: paramSection || null } : null
  );

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);

  useEffect(() => {
    api.get('/subjects')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data.filter((s) => s && s.id != null) : [];
        setSubjects(list);
        if (!paramSubject && list.length === 1) setSubjectId(list[0].id);
      })
      .catch(() => setSubjects([]));
    api.get('/teachers/classes')
      .then(({ data }) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setClasses([]));
  }, [paramSubject]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (paramCampus) params.campus_id = paramCampus;
      if (subjectId) params.subject_id = subjectId;
      if (classSel?.class_id) params.class_id = classSel.class_id;
      const { data } = await listMaterials(params);
      setItems(data?.documents || []);
    } finally { setLoading(false); }
  }, [paramCampus, subjectId, classSel?.class_id]);

  useEffect(() => { refresh(); }, [refresh]);

  const pickAndUpload = async () => {
    if (!title.trim()) {
      setUploadMessage({ tone: 'error', text: 'Add a title before uploading.' });
      return;
    }
    if (!subjectId) {
      setUploadMessage({ tone: 'error', text: 'Select a subject before choosing a file.' });
      return;
    }

    setUploadMessage(null);

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;

      const asset = res.assets[0];
      const normalized = await normalizePickedAsset(asset);

      const form = new FormData();
      form.append('file', normalized.filePart);
      form.append('title', title.trim());
      if (topic.trim()) form.append('topic', topic.trim());
      form.append('subject_id', String(subjectId));
      if (classSel?.class_id) form.append('class_id', String(classSel.class_id));
      if (classSel?.section_id) form.append('section_id', String(classSel.section_id));
      if (paramCampus) form.append('campus_id', String(paramCampus));

      setUploading(true);
      setUploadMessage({ tone: 'info', text: `Uploading ${asset.name || 'file'}...` });

      const { data } = await uploadMaterial(form);
      const uploadedDoc = data?.document;
      if (uploadedDoc) {
        setItems((prev) => [uploadedDoc, ...prev.filter((item) => item.id !== uploadedDoc.id)]);
      }
      setTitle('');
      setTopic('');
      setUploadMessage({ tone: 'success', text: 'Material uploaded and queued for ingestion. It should appear below immediately.' });
      await refresh();
    } catch (e) {
      const message = getUploadErrorMessage(e);
      setUploadMessage({ tone: 'error', text: message });
      Alert.alert('Upload failed', message);
    } finally {
      setUploading(false);
    }
  };

  const subjectName = useMemo(
    () => subjects.find((s) => s.id === subjectId)?.name || 'Select subject',
    [subjects, subjectId]
  );

  const onDelete = (id) => {
    Alert.alert('Delete material?', 'This removes the file and its embeddings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteMaterial(id); refresh(); } },
    ]);
  };

  const classLabel = classSel
    ? (classes.find((c) => c.class_id === classSel.class_id && c.section_id === classSel.section_id)
        ? `${classes.find((c) => c.class_id === classSel.class_id && c.section_id === classSel.section_id).class_name} · ${classes.find((c) => c.class_id === classSel.class_id && c.section_id === classSel.section_id).section_name}`
        : 'Selected')
    : 'All classes (campus-wide)';

  const uploadMessageStyle = uploadMessage?.tone === 'error'
    ? styles.messageError
    : uploadMessage?.tone === 'success'
      ? styles.messageSuccess
      : styles.messageInfo;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <ScreenIntroCard
              title="Teacher AI Materials"
              description="Upload and organize the documents AI Tutor uses for answers. Keep subject and class scope accurate so students only get relevant material."
              icon="cloud-upload-outline"
              tone="violet"
            />

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Filter Scope</Text>
              <Text style={styles.supportingText}>Pick the subject first, then optionally narrow the material to a class and section.</Text>

              <Text style={styles.label}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRail}>
                {subjects.map((s) => (
                  <TouchableOpacity key={s.id} style={[styles.chip, subjectId === s.id && styles.chipOn]} onPress={() => setSubjectId(s.id)}>
                    <Text style={[styles.chipText, subjectId === s.id && styles.chipTextOn]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
                {subjects.length === 0 && <Text style={styles.hint}>No subjects available.</Text>}
              </ScrollView>

              <Text style={styles.label}>Scope</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRail}>
                <TouchableOpacity style={[styles.chip, !classSel && styles.chipOn]} onPress={() => setClassSel(null)}>
                  <Text style={[styles.chipText, !classSel && styles.chipTextOn]}>All classes</Text>
                </TouchableOpacity>
                {classes.map((c) => {
                  const active = classSel?.class_id === c.class_id && classSel?.section_id === c.section_id;
                  return (
                    <TouchableOpacity key={`${c.class_id}-${c.section_id}`} style={[styles.chip, active && styles.chipOn]} onPress={() => setClassSel({ class_id: c.class_id, section_id: c.section_id })}>
                      <Text style={[styles.chipText, active && styles.chipTextOn]}>{c.class_name} · {c.section_name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.scopeSummary}>
                <Text style={styles.scopeLabel}>Current scope</Text>
                <Text style={styles.scopeValue}>{subjectName} · {classLabel}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Upload Material</Text>
              <Text style={styles.supportingText}>Use a clear title and optional topic so students can quickly find the right file in AI Tutor.</Text>
              <TextInput style={styles.input} placeholder="Title (e.g. Chapter 4 Summary)" placeholderTextColor={C.textLight} value={title} onChangeText={setTitle} />
              <TextInput style={styles.input} placeholder="Topic / Chapter (optional)" placeholderTextColor={C.textLight} value={topic} onChangeText={setTopic} />
              {uploadMessage ? (
                <View style={[styles.messageBox, uploadMessageStyle]}>
                  {uploading ? <ActivityIndicator size="small" color={uploadMessage.tone === 'error' ? '#B91C1C' : C.primary} /> : null}
                  <Text style={[styles.messageText, uploadMessage.tone === 'error' && styles.messageTextError]}>{uploadMessage.text}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={[styles.btn, uploading && styles.btnDisabled]} onPress={pickAndUpload} disabled={uploading}>
                <Text style={styles.btnText}>{uploading ? 'Uploading...' : 'Choose File and Upload'}</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>PDF, DOCX, PPTX, TXT · up to 25 MB</Text>
            </View>

            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Uploaded Materials</Text>
              {!loading ? <Text style={styles.counterText}>{items.length} file{items.length === 1 ? '' : 's'}</Text> : null}
            </View>
          </>
        )}
        ListEmptyComponent={loading ? null : <Text style={styles.empty}>No materials yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.rowCard}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>{(item.topic ? `${item.topic} · ` : '')}{(item.file_ext || '').toUpperCase()} · {Math.round((item.file_size_bytes || 0) / 1024)} KB</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] || '#6B7280'}18` }]}>
                  <Text style={[styles.status, { color: STATUS_COLORS[item.status] || '#6B7280' }]}>{item.status}</Text>
                </View>
              </View>
              {item.error_message ? <Text style={styles.err}>{item.error_message}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.delBtn}>
              <Text style={styles.delText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingBottom: 34, paddingHorizontal: 16 },
  card: {
    ...S.card,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textDark },
  counterText: { fontSize: 12, color: C.textMed, fontWeight: '700' },
  supportingText: { fontSize: 12, color: C.textMed, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  label: { ...S.label, marginBottom: 8 },
  chipRail: { marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.cardAlt, marginRight: 8, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.textMed, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  scopeSummary: { backgroundColor: C.primaryLight, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, padding: 12, marginTop: 4 },
  scopeLabel: { fontSize: 11, color: C.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  scopeValue: { fontSize: 12, color: C.textDark, fontWeight: '700', marginTop: 4 },
  input: { ...S.input },
  btn: { ...S.btn },
  btnDisabled: { opacity: 0.65 },
  btnText: { ...S.btnText },
  messageBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  messageInfo: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  messageSuccess: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  messageError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  messageText: { flex: 1, fontSize: 12, color: C.textDark, lineHeight: 18, fontWeight: '600' },
  messageTextError: { color: '#B91C1C' },
  hint: { fontSize: 12, color: C.textMed, marginTop: 8, lineHeight: 18 },
  rowCard: { ...S.card, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMain: { flex: 1 },
  rowTitle: { fontWeight: '700', color: C.textDark, fontSize: 15 },
  rowMeta: { color: C.textMed, fontSize: 12, marginTop: 4, lineHeight: 18 },
  statusRow: { marginTop: 10, flexDirection: 'row' },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  status: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  err: { color: '#B91C1C', fontSize: 12, marginTop: 8, lineHeight: 18 },
  delBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FEE2E2', borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
  delText: { color: '#B91C1C', fontWeight: '800' },
  empty: { color: C.textMed, textAlign: 'center', marginTop: 24, fontSize: 14 },
});
