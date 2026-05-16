// frontend/src/features/aiTutor/screens/TeacherAiMaterialsScreen.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import api from '../../../services/api';
import { deleteMaterial, listMaterials, uploadMaterial, processIngestion } from '../api/aiTutorApi';

const STATUS_COLORS = {
  uploaded: '#9CA3AF', processing: '#F59E0B', ready: '#10B981', failed: '#EF4444', archived: '#6B7280',
};

export default function TeacherAiMaterialsScreen({ route }) {
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
  const [processing, setProcessing] = useState(false);

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
    if (!title.trim()) { Alert.alert('Title required'); return; }
    if (!subjectId)   { Alert.alert('Please pick a subject'); return; }
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint', // legacy PPT
        'text/plain',
      ],
      copyToCacheDirectory: true, multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];

    const form = new FormData();
    form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' });
    form.append('title', title.trim());
    if (topic.trim()) form.append('topic', topic.trim());
    form.append('subject_id', String(subjectId));
    if (classSel?.class_id) form.append('class_id', String(classSel.class_id));
    if (classSel?.section_id) form.append('section_id', String(classSel.section_id));
    if (paramCampus) form.append('campus_id', String(paramCampus));

    setUploading(true);
    try {
      await uploadMaterial(form);
      setTitle(''); setTopic('');
      await refresh();
      Alert.alert('Uploaded', 'The file is queued for ingestion. It will become "ready" shortly.');
    } catch (e) {
      Alert.alert('Upload failed', e?.response?.data?.message || 'Try again');
    } finally { setUploading(false); }
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

  const runIngestion = async () => {
    setProcessing(true);
    try {
      const { data } = await processIngestion();
      const n = data?.processed ?? data?.count ?? 0;
      Alert.alert('Processing complete', n ? `Processed ${n} job(s).` : 'No pending jobs.');
      await refresh();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || 'Could not process pending uploads');
    } finally { setProcessing(false); }
  };

  const classLabel = classSel
    ? (classes.find((c) => c.class_id === classSel.class_id && c.section_id === classSel.section_id)
        ? `${classes.find((c) => c.class_id === classSel.class_id && c.section_id === classSel.section_id).class_name} · ${classes.find((c) => c.class_id === classSel.class_id && c.section_id === classSel.section_id).section_name}`
        : 'Selected')
    : 'All classes (campus-wide)';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.h1}>AI Study Materials</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Subject</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          {subjects.map((s) => (
            <TouchableOpacity key={s.id} style={[styles.chip, subjectId === s.id && styles.chipOn]} onPress={() => setSubjectId(s.id)}>
              <Text style={[styles.chipText, subjectId === s.id && styles.chipTextOn]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
          {subjects.length === 0 && <Text style={styles.hint}>No subjects available.</Text>}
        </ScrollView>

        <Text style={styles.label}>Scope (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          <TouchableOpacity style={[styles.chip, !classSel && styles.chipOn]} onPress={() => setClassSel(null)}>
            <Text style={[styles.chipText, !classSel && styles.chipTextOn]}>All</Text>
          </TouchableOpacity>
          {classes.map((c) => {
            const active = classSel?.class_id === c.class_id && classSel?.section_id === c.section_id;
            return (
              <TouchableOpacity key={`${c.class_id}-${c.section_id}`} style={[styles.chip, active && styles.chipOn]} onPress={() => setClassSel({ class_id: c.class_id, section_id: c.section_id })}>
                <Text style={[styles.chipText, active && styles.chipTextOn]}>{c.class_name}·{c.section_name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.subtle}>Subject: {subjectName} · {classLabel}</Text>
      </View>

      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Title (e.g. Chapter 4 Summary)" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input} placeholder="Topic / Chapter (optional)" value={topic} onChangeText={setTopic} />
        <TouchableOpacity style={[styles.btn, uploading && styles.btnDisabled]} onPress={pickAndUpload} disabled={uploading}>
          <Text style={styles.btnText}>{uploading ? 'Uploading…' : 'Choose file & upload'}</Text>
        </TouchableOpacity>
          <Text style={styles.hint}>PDF, DOCX, PPTX, PPT, TXT · up to 25 MB</Text>
        <TouchableOpacity style={[styles.btnSecondary, processing && styles.btnDisabled]} onPress={runIngestion} disabled={processing}>
          <Text style={styles.btnSecondaryText}>{processing ? 'Processing…' : 'Process pending uploads now'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>No materials yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>{(item.topic ? `${item.topic} · ` : '')}{(item.file_ext || '').toUpperCase()} · {Math.round((item.file_size_bytes || 0) / 1024)} KB</Text>
                <Text style={[styles.status, { color: STATUS_COLORS[item.status] || '#6B7280' }]}>{item.status}</Text>
                {item.error_message ? <Text style={styles.err}>{item.error_message}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.delBtn}>
                <Text style={styles.delText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14, backgroundColor: '#fff' },
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  card: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, gap: 8, marginBottom: 14 },
  label: { fontWeight: '600', color: '#374151' },
  subtle: { color: '#6B7280', fontSize: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#E5E7EB', marginRight: 6 },
  chipOn: { backgroundColor: '#2563EB' },
  chipText: { color: '#374151', fontWeight: '600', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  btn: { backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#93C5FD' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnSecondary: { marginTop: 6, backgroundColor: '#E0E7FF', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnSecondaryText: { color: '#3730A3', fontWeight: '700' },
  hint: { fontSize: 12, color: '#6B7280' },
  row: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderColor: '#F3F4F6', alignItems: 'center' },
  rowTitle: { fontWeight: '700', color: '#111827' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  status: { marginTop: 4, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  err: { color: '#B91C1C', fontSize: 12, marginTop: 2 },
  delBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FEE2E2', borderRadius: 8 },
  delText: { color: '#B91C1C', fontWeight: '700' },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 20 },
});
