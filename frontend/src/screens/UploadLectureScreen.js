import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Alert, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';
import { C } from '../config/theme';

const TYPES = [
  { label: '📖  Class Work', value: 'classwork' },
  { label: '📝  Homework',   value: 'homework'  },
];

// ── Build date list: 90 days back → 14 days ahead ─────────────
function buildDateOptions() {
  const opts = [];
  const now  = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  for (let i = -90; i <= 14; i++) {
    const d   = new Date(now);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let label;
    if      (i ===  0) label = `Today  (${iso})`;
    else if (i === -1) label = `Yesterday  (${iso})`;
    else               label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + `  (${iso})`;
    opts.push({ label, value: iso });
  }
  return { opts, todayStr };
}
const { opts: DATE_OPTIONS, todayStr: TODAY } = buildDateOptions();

export default function UploadLectureScreen({ navigation }) {
  const [classes,       setClasses]       = useState([]);
  const [sections,      setSections]      = useState([]);
  const [subjects,      setSubjects]      = useState([]);
  const [loadingCls,    setLoadingCls]    = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectText,setNewSubjectText]= useState('');
  const [duplicate,     setDuplicate]     = useState(null); // { id, lecture_name } | null
  const [checkingDup,   setCheckingDup]   = useState(false);

  const [form, setForm] = useState({
    lecture_name: '',
    subject_name: '',
    type:         'classwork',
    date:         TODAY,
    class_id:     '',
    section_id:   '',   // '' means "All Sections"
  });

  const [pdfFile, setPdfFile] = useState(null);

  // ── Load classes + subjects ───────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/lectures/classes'),
      api.get('/lectures/subjects'),
    ])
      .then(([cls, subs]) => { setClasses(cls.data); setSubjects(subs.data); })
      .catch(() => Alert.alert('Error', 'Could not load form data'))
      .finally(() => setLoadingCls(false));
  }, []);

  // ── Update sections when class changes ────────────────────────
  useEffect(() => {
    const cls = classes.find(c => String(c.id) === String(form.class_id));
    setSections(cls?.sections || []);
    setForm(p => ({ ...p, section_id: '' }));
  }, [form.class_id, classes]);

  // ── Duplicate check (debounced 400ms) ────────────────────────
  useEffect(() => {
    const { subject_name, date, class_id } = form;
    if (!subject_name || !date || !class_id) { setDuplicate(null); return; }
    const timer = setTimeout(async () => {
      setCheckingDup(true);
      try {
        const { data } = await api.get('/lectures/check-duplicate', {
          params: { subject_name, date, class_id, section_id: form.section_id || '' },
        });
        setDuplicate(data.exists ? data.lecture : null);
      } catch { setDuplicate(null); }
      finally  { setCheckingDup(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.subject_name, form.date, form.class_id, form.section_id]);

  const F = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const confirmNewSubject = async () => {
    const s = newSubjectText.trim();
    if (!s) return;
    F('subject_name', s);
    if (!subjects.includes(s)) setSubjects(prev => [...prev, s].sort());
    setNewSubjectText(''); setAddingSubject(false);
    // Persist for admins (teachers get 403 which is silently ignored)
    try { await api.post('/subjects', { name: s }); } catch { /* not admin — ignore */ }
  };

  // ── Pick PDF ──────────────────────────────────────────────────
  const pickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPdfFile({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType || 'application/pdf' });
    } catch (err) {
      Alert.alert('Error', 'Could not pick file');
    }
  };

  // ── Do the upload (may be called directly or after duplicate confirm) ──
  const doUpload = async () => {
    const { lecture_name, subject_name, type, date, class_id } = form;
    if (!lecture_name.trim()) return Alert.alert('Required', 'Enter a lecture name');
    if (!subject_name)        return Alert.alert('Required', 'Select or add a subject');
    if (!class_id)            return Alert.alert('Required', 'Select a class');
    if (!pdfFile)             return Alert.alert('Required', 'Select a PDF file');

    setUploading(true);
    try {
      if (duplicate) await api.delete(`/lectures/${duplicate.id}`);

      const formData = new FormData();
      formData.append('file',         { uri: pdfFile.uri, name: pdfFile.name, type: pdfFile.mimeType });
      formData.append('lecture_name', lecture_name.trim());
      formData.append('subject_name', subject_name);
      formData.append('type',         type);
      formData.append('date',         date);
      formData.append('class_id',     String(class_id));
      formData.append('section_id',   form.section_id || '');

      await api.post('/lectures', formData, {
        headers: { 'Content-Type': undefined },  // let axios set multipart/form-data + boundary automatically
      });

      if (!subjects.includes(subject_name)) setSubjects(prev => [...prev, subject_name].sort());
      setDuplicate(null);
      Alert.alert(
        duplicate ? 'Replaced ✅' : 'Uploaded ✅',
        duplicate ? 'Lecture replaced successfully!' : 'Lecture uploaded successfully!',
        [
          { text: 'Upload Another', onPress: () => { setForm({ lecture_name: '', subject_name: '', type: 'classwork', date: TODAY, class_id: '', section_id: '' }); setPdfFile(null); setAddingSubject(false); } },
          { text: 'Go Back', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      Alert.alert('Upload Failed', err?.response?.data?.message || 'Please try again');
    } finally {
      setUploading(false);
    }
  };

  // ── Submit: show duplicate confirm if needed ──────────────────
  const handleSubmit = () => {
    if (duplicate) {
      Alert.alert(
        '⚠️ Already Uploaded',
        `A lecture for "${form.subject_name}" on ${form.date} already exists:\n\n"${duplicate.lecture_name}"\n\nDo you want to replace it with the new file?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: doUpload },
        ]
      );
    } else {
      doUpload();
    }
  };

  const selectedClassName = classes.find(c => String(c.id) === String(form.class_id))?.class_name;

  if (loadingCls) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1B4B" />
      <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ── Header ── */}
        <LinearGradient
          colors={['#1E1B4B', '#312E81', '#4338CA']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>📚 Upload Lecture</Text>
          <Text style={styles.headerSub}>Share notes, classwork or homework PDFs</Text>
        </LinearGradient>

        <View style={styles.body}>

          {/* Lecture Name */}
          <Text style={styles.label}>Lecture / Topic Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Chapter 5 – Photosynthesis"
            placeholderTextColor={C.textLight}
            value={form.lecture_name}
            onChangeText={v => F('lecture_name', v)}
          />

          {/* Subject */}
          <Text style={styles.label}>Subject *</Text>
          {!addingSubject ? (
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={form.subject_name}
                onValueChange={v => { if (v === '__new__') { setAddingSubject(true); } else { F('subject_name', v); } }}
                style={styles.picker}
              >
                <Picker.Item label="— Select Subject —" value="" />
                {subjects.map(s => <Picker.Item key={s} label={s} value={s} />)}
                <Picker.Item label="➕  Add New Subject…" value="__new__" />
              </Picker>
            </View>
          ) : (
            <View style={styles.newSubjectRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginTop: 0 }]}
                placeholder="Type subject name…"
                placeholderTextColor={C.textLight}
                value={newSubjectText}
                onChangeText={setNewSubjectText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={confirmNewSubject}
              />
              <Pressable style={styles.addBtn} onPress={confirmNewSubject}>
                <Text style={styles.addBtnTxt}>Add</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => { setAddingSubject(false); setNewSubjectText(''); }}>
                <Text style={styles.cancelBtnTxt}>✕</Text>
              </Pressable>
            </View>
          )}
          {!!form.subject_name && !addingSubject && (
            <Text style={styles.selectedHint}>Selected: {form.subject_name}</Text>
          )}

          {/* Type */}
          <Text style={styles.label}>Type *</Text>
          <View style={styles.typeRow}>
            {TYPES.map(t => (
              <Pressable
                key={t.value}
                style={[styles.typeBtn, form.type === t.value && styles.typeBtnActive]}
                onPress={() => F('type', t.value)}
              >
                <Text style={[styles.typeTxt, form.type === t.value && styles.typeTxtActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Date */}
          <Text style={styles.label}>Date *</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.date} onValueChange={v => F('date', v)} style={styles.picker}>
              {DATE_OPTIONS.map(d => (
                <Picker.Item key={d.value} label={d.label} value={d.value} />
              ))}
            </Picker>
          </View>

          {/* Class */}
          <Text style={styles.label}>Class *</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={String(form.class_id)}
              onValueChange={v => F('class_id', v)}
              style={styles.picker}
            >
              <Picker.Item label="— Select Class —" value="" />
              {classes.map(c => (
                <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />
              ))}
            </Picker>
          </View>

          {/* Section */}
          <Text style={styles.label}>Section</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={String(form.section_id)}
              onValueChange={v => F('section_id', v)}
              style={styles.picker}
              enabled={!!form.class_id}
            >
              <Picker.Item label="📢  All Sections" value="" />
              {sections.map(s => (
                <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />
              ))}
            </Picker>
          </View>
          {form.class_id && !form.section_id && (
            <Text style={styles.hint}>
              📢 "All Sections" makes this lecture visible to every section of {selectedClassName}.
            </Text>
          )}

          {/* Duplicate indicator */}
          {checkingDup && (
            <View style={styles.dupChecking}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={styles.dupCheckingTxt}> Checking for duplicates…</Text>
            </View>
          )}
          {!checkingDup && duplicate && (
            <View style={styles.dupWarning}>
              <Text style={styles.dupWarnIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.dupWarnTitle}>Lecture already uploaded!</Text>
                <Text style={styles.dupWarnMsg}>"{duplicate.lecture_name}" exists for this subject & date.{"\n"}Tapping Upload will replace it.</Text>
              </View>
            </View>
          )}
          {!checkingDup && !duplicate && form.subject_name && form.date && form.class_id && (
            <View style={styles.dupOk}>
              <Text style={styles.dupOkTxt}>✅  No duplicate — ready to upload</Text>
            </View>
          )}

          {/* PDF Picker */}
          <Text style={styles.label}>PDF File *</Text>
          <Pressable style={styles.filePicker} onPress={pickPDF}>
            {pdfFile ? (
              <View style={styles.fileSelected}>
                <Text style={styles.fileIcon}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={2}>{pdfFile.name}</Text>
                  <Text style={styles.fileHint}>Tap to change</Text>
                </View>
              </View>
            ) : (
              <View style={styles.fileEmpty}>
                <Text style={styles.fileEmptyIcon}>⬆</Text>
                <Text style={styles.fileEmptyTxt}>Tap to select PDF</Text>
                <Text style={styles.fileEmptyHint}>Max 20 MB</Text>
              </View>
            )}
          </Pressable>

          {/* Submit */}
          <Pressable
            style={[styles.submitBtn, uploading && { opacity: 0.7 }, duplicate && styles.submitBtnReplace]}
            onPress={handleSubmit}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitTxt}>{duplicate ? '🔄  Replace Lecture' : '⬆  Upload Lecture'}</Text>}
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },

  // Header
  header:     { paddingTop: 52, paddingBottom: 28, paddingHorizontal: 20 },
  backBtn:    { marginBottom: 16, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  backTxt:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  headerTitle:{ color: '#E0E7FF', fontSize: 22, fontWeight: '900' },
  headerSub:  { color: '#A5B4FC', fontSize: 13, marginTop: 4 },

  // Form body
  body:       { padding: 20 },
  label:      { fontSize: 13, fontWeight: '700', color: C.textMed, marginBottom: 6, marginTop: 16 },

  input: {
    backgroundColor: C.card,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text,
  },

  // Type buttons
  typeRow:    { flexDirection: 'row', gap: 10 },
  typeBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, alignItems: 'center' },
  typeBtnActive: { backgroundColor: C.primaryLight, borderColor: C.primary },
  typeTxt:    { fontSize: 14, color: C.textMed, fontWeight: '600' },
  typeTxtActive: { color: C.primary, fontWeight: '800' },

  // Subject new-entry row
  newSubjectRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn:        { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  addBtnTxt:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn:     { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  cancelBtnTxt:  { color: C.textMed, fontWeight: '700', fontSize: 14 },
  selectedHint:  { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 4 },

  // Picker
  pickerWrap: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  picker:     { height: 50, color: C.text },

  hint: { fontSize: 12, color: '#059669', marginTop: 6, lineHeight: 18 },

  // Duplicate indicators
  dupChecking:    { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: C.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.border },
  dupCheckingTxt: { fontSize: 13, color: C.textMed },
  dupWarning:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#D97706' },
  dupWarnIcon:    { fontSize: 20 },
  dupWarnTitle:   { fontSize: 13, fontWeight: '800', color: '#92400E' },
  dupWarnMsg:     { fontSize: 12, color: '#78350F', marginTop: 3, lineHeight: 18 },
  dupOk:          { marginTop: 10, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#6EE7B7' },
  dupOkTxt:       { fontSize: 12, color: '#065F46', fontWeight: '600' },

  // File picker
  filePicker: {
    backgroundColor: C.card, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: C.primary, borderRadius: 14, overflow: 'hidden',
  },
  fileEmpty:     { alignItems: 'center', padding: 28 },
  fileEmptyIcon: { fontSize: 32, marginBottom: 8 },
  fileEmptyTxt:  { fontSize: 15, fontWeight: '700', color: C.primary },
  fileEmptyHint: { fontSize: 12, color: C.textLight, marginTop: 4 },
  fileSelected:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  fileIcon:      { fontSize: 32 },
  fileName:      { fontSize: 14, fontWeight: '700', color: C.text },
  fileHint:      { fontSize: 12, color: C.textLight, marginTop: 2 },

  // Submit
  submitBtn: {
    marginTop: 28, backgroundColor: C.primary,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    elevation: 4, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  submitBtnReplace: { backgroundColor: '#D97706' },
  submitTxt:        { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
