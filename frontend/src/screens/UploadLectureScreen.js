import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';
import { C } from '../config/theme';
import PickerField from '../components/PickerField';
import AppHeader from '../components/AppHeader';

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
    message:      '',
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

  // ── Duplicate check (debounced 400ms, now by lecture_name/class/section) ──
  useEffect(() => {
    const { lecture_name, class_id } = form;
    if (!lecture_name || !class_id) { setDuplicate(null); return; }
    const timer = setTimeout(async () => {
      setCheckingDup(true);
      try {
        const { data } = await api.get('/lectures/check-duplicate', {
          params: { lecture_name, class_id, section_id: form.section_id || '' },
        });
        setDuplicate(data.exists ? data.lecture : null);
      } catch { setDuplicate(null); }
      finally  { setCheckingDup(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.lecture_name, form.class_id, form.section_id]);

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
    const { lecture_name, subject_name, type, date, class_id, message } = form;
    if (!lecture_name.trim()) return Alert.alert('Required', 'Enter a lecture / topic name');
    if (!subject_name)        return Alert.alert('Required', 'Select or add a subject');
    if (!class_id)            return Alert.alert('Required', 'Select a class');
    if (!message.trim() && !pdfFile)
      return Alert.alert('Required', 'Add a message or attach a PDF file (or both)');

    setUploading(true);
    try {
      if (duplicate) await api.delete(`/lectures/${duplicate.id}`);

      const formData = new FormData();
      if (pdfFile) {
        formData.append('file', { uri: pdfFile.uri, name: pdfFile.name, type: pdfFile.mimeType });
      }
      formData.append('lecture_name', lecture_name.trim());
      formData.append('subject_name', subject_name);
      formData.append('type',         type);
      formData.append('date',         date);
      formData.append('class_id',     String(class_id));
      formData.append('section_id',   form.section_id || '');
      if (message.trim()) formData.append('message', message.trim());

      await api.post('/lectures', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!subjects.includes(subject_name)) setSubjects(prev => [...prev, subject_name].sort());
      setDuplicate(null);
      Alert.alert(
        duplicate ? 'Replaced ✅' : 'Posted ✅',
        duplicate ? 'Lecture replaced successfully!' : 'Lecture posted successfully!',
        [
          { text: 'Post Another', onPress: () => { setForm({ lecture_name: '', subject_name: '', type: 'classwork', date: TODAY, class_id: '', section_id: '', message: '' }); setPdfFile(null); setAddingSubject(false); } },
          { text: 'Go Back', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      Alert.alert('Failed', err?.response?.data?.message || 'Please try again');
    } finally {
      setUploading(false);
    }
  };

  // ── Submit: show duplicate confirm if needed ──────────────────
  const handleSubmit = () => {
    if (duplicate) {
      Alert.alert(
        '⚠️ Already Exists',
        `A lecture for "${form.subject_name}" on ${form.date} already exists:\n\n"${duplicate.lecture_name}"\n\nDo you want to replace it?`,
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
      <AppHeader title="Post Lecture / Work" navigation={navigation} />
      <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.body}>

          {/* ── Type selector ── */}
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

          {/* ── Topic Name ── */}
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Topic / Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chapter 5 – Photosynthesis"
              placeholderTextColor={C.textLight}
              value={form.lecture_name}
              onChangeText={v => F('lecture_name', v)}
            />
          </View>

          {/* ── Subject ── */}
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Subject *</Text>
            {!addingSubject ? (
              <PickerField
                label="Subject"
                value={form.subject_name}
                onChange={v => { if (v === '__new__') { setAddingSubject(true); } else { F('subject_name', v); } }}
                placeholder="— Select Subject —"
                items={[
                  { label: '— Select Subject —', value: '' },
                  ...subjects.map(s => ({ label: s, value: s })),
                  { label: '➕  Add New Subject…', value: '__new__' },
                ]}
              />
            ) : (
              <View style={styles.newSubjectRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
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
                  <Ionicons name="close" size={18} color={C.textMed} />
                </Pressable>
              </View>
            )}
            {!!form.subject_name && !addingSubject && (
              <Text style={styles.selectedHint}>✓ {form.subject_name}</Text>
            )}
          </View>

          {/* ── Date / Class / Section ── */}
          <View style={styles.rowTwo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date *</Text>
              <PickerField label="Date" value={form.date} onChange={v => F('date', v)} placeholder="Select date" items={DATE_OPTIONS} />
            </View>
          </View>

          <View style={styles.rowTwo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Class *</Text>
              <PickerField label="Class" value={String(form.class_id)} onChange={v => F('class_id', v)} placeholder="— Class —"
                items={[{ label: '— Class —', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Section</Text>
              <PickerField label="Section" value={String(form.section_id)} onChange={v => F('section_id', v)} placeholder="All Sections"
                disabled={!form.class_id}
                items={[{ label: 'All Sections', value: '' }, ...sections.map(s => ({ label: `Sec ${s.section_name}`, value: String(s.id) }))]} />
            </View>
          </View>
          {form.class_id && !form.section_id && (
            <Text style={styles.hint}>All sections of {selectedClassName} will see this.</Text>
          )}

          {/* ── Duplicate indicator ── */}
          {checkingDup && (
            <View style={styles.dupChecking}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={styles.dupCheckingTxt}> Checking for duplicates…</Text>
            </View>
          )}
          {!checkingDup && duplicate && (
            <View style={styles.dupWarning}>
              <Ionicons name="warning-outline" size={18} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={styles.dupWarnTitle}>Already posted for this date</Text>
                <Text style={styles.dupWarnMsg}>"{duplicate.lecture_name}" — submitting will replace it.</Text>
              </View>
            </View>
          )}
          {!checkingDup && !duplicate && form.subject_name && form.date && form.class_id && (
            <View style={styles.dupOk}>
              <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
              <Text style={styles.dupOkTxt}> No duplicate — good to go</Text>
            </View>
          )}

          {/* ── Message Board ── */}
          <View style={styles.messageBoardCard}>
            <View style={styles.messageBoardHeader}>
              <Ionicons name="create-outline" size={18} color={C.primary} />
              <Text style={styles.messageBoardTitle}>Message / Instructions</Text>
            </View>
            <TextInput
              style={styles.messageBoardInput}
              placeholder={
                form.type === 'homework'
                  ? 'Write homework instructions here…\ne.g. Complete Ex. 3.1 Q1–5 from the textbook.'
                  : 'Write classwork notes or instructions here…\ne.g. Today we covered photosynthesis — revise pages 42–48.'
              }
              placeholderTextColor="#94A3B8"
              value={form.message}
              onChangeText={v => F('message', v)}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* ── PDF Attachment (Optional) ── */}
          <View style={styles.fieldBlock}>
            <View style={styles.attachmentLabelRow}>
              <Ionicons name="attach-outline" size={16} color={C.textMed} />
              <Text style={styles.label}>  PDF Attachment</Text>
              <View style={styles.optionalBadge}><Text style={styles.optionalTxt}>Optional</Text></View>
            </View>
            <Pressable style={({ pressed }) => [styles.filePicker, pressed && { opacity: 0.85 }]} onPress={pickPDF}>
              {pdfFile ? (
                <View style={styles.fileSelected}>
                  <View style={styles.fileIconWrap}>
                    <Ionicons name="document-text-outline" size={22} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>{pdfFile.name}</Text>
                    <Text style={styles.fileHint}>Tap to change file</Text>
                  </View>
                  <Pressable onPress={() => setPdfFile(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color="#94A3B8" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.fileEmpty}>
                  <Ionicons name="cloud-upload-outline" size={28} color={C.primary} />
                  <Text style={styles.fileEmptyTxt}>Tap to attach a PDF</Text>
                  <Text style={styles.fileEmptyHint}>Max 20 MB · Students can download it</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* ── Submit ── */}
          <Pressable
            style={({ pressed }) => [styles.submitBtn, uploading && { opacity: 0.7 }, duplicate && styles.submitBtnReplace, pressed && { opacity: 0.88 }]}
            onPress={handleSubmit}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.submitInner}>
                <Ionicons name={duplicate ? 'refresh-outline' : 'paper-plane-outline'} size={18} color="#fff" />
                <Text style={styles.submitTxt}>{duplicate ? '  Replace Lecture' : '  Post to Students'}</Text>
              </View>
            )}
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  body:  { padding: 16, gap: 4 },

  fieldBlock: { marginTop: 14 },
  label: { fontSize: 12, fontWeight: '700', color: C.textMed, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: C.text,
  },

  rowTwo: { flexDirection: 'row', gap: 10, marginTop: 14 },

  // Type buttons
  typeRow:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  typeBtn:       { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff', alignItems: 'center' },
  typeBtnActive: { backgroundColor: C.primaryLight, borderColor: C.primary },
  typeTxt:       { fontSize: 14, color: C.textMed, fontWeight: '600' },
  typeTxtActive: { color: C.primary, fontWeight: '800' },

  // Subject new-entry row
  newSubjectRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn:        { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  addBtnTxt:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn:     { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 11, justifyContent: 'center', alignItems: 'center' },
  selectedHint:  { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 5 },

  hint: { fontSize: 12, color: '#6366F1', marginTop: 5, lineHeight: 18 },

  // Duplicate indicators
  dupChecking:    { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  dupCheckingTxt: { fontSize: 13, color: C.textMed },
  dupWarning:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#FCD34D' },
  dupWarnTitle:   { fontSize: 13, fontWeight: '700', color: '#92400E' },
  dupWarnMsg:     { fontSize: 12, color: '#78350F', marginTop: 2, lineHeight: 18 },
  dupOk:          { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#6EE7B7' },
  dupOkTxt:       { fontSize: 12, color: '#065F46', fontWeight: '600' },

  // Message board
  messageBoardCard: {
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    overflow: 'hidden',
  },
  messageBoardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E0E7FF',
  },
  messageBoardTitle: { fontSize: 13, fontWeight: '700', color: C.primary },
  messageBoardInput: {
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: C.text, lineHeight: 22,
    minHeight: 120,
  },

  // Attachment
  attachmentLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  optionalBadge: { marginLeft: 8, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  optionalTxt:   { fontSize: 10, color: '#059669', fontWeight: '700' },

  filePicker: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CBD5E1',
    borderRadius: 12, overflow: 'hidden',
  },
  fileEmpty:     { alignItems: 'center', paddingVertical: 22, gap: 6 },
  fileEmptyTxt:  { fontSize: 14, fontWeight: '700', color: C.primary },
  fileEmptyHint: { fontSize: 12, color: '#94A3B8' },
  fileSelected:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  fileIconWrap:  { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  fileName:      { fontSize: 14, fontWeight: '700', color: C.text },
  fileHint:      { fontSize: 12, color: C.textLight, marginTop: 2 },

  // Submit
  submitBtn: {
    marginTop: 24,
    backgroundColor: C.primary,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    elevation: 4, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  submitBtnReplace: { backgroundColor: '#D97706' },
  submitInner: { flexDirection: 'row', alignItems: 'center' },
  submitTxt:   { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});
