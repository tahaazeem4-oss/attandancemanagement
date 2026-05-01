import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, FlatList,
  StyleSheet, Alert, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';
import { C } from '../config/theme';

// ── Constants ─────────────────────────────────────────────────
const TARGETS = [
  { value: 'school',  label: '🏫 Whole School',    desc: 'All students see this' },
  { value: 'class',   label: '📚 Entire Class',     desc: 'All sections of a class' },
  { value: 'section', label: '👥 One Section',      desc: 'Specific class & section' },
  { value: 'student', label: '👤 One Student',      desc: 'Targeted to one student' },
];

const CATEGORIES = [
  { value: 'general',      label: '📢 General',      color: '#475569' },
  { value: 'holiday',      label: '🎉 Holiday',      color: '#059669' },
  { value: 'announcement', label: '📣 Announcement', color: '#2563EB' },
  { value: 'homework',     label: '📝 Homework',     color: '#D97706' },
  { value: 'exam',         label: '📋 Exam',         color: '#7C3AED' },
  { value: 'complaint',    label: '⚠️ Complaint',    color: '#DC2626' },
];

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SendNotificationScreen({ navigation }) {
  // Class data for pickers
  const [classes,   setClasses]   = useState([]);
  const [sections,  setSections]  = useState([]);
  const [students,  setStudents]  = useState([]);

  // Form state
  const [target,    setTarget]    = useState('school');
  const [classId,   setClassId]   = useState('');
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [category,  setCategory]  = useState('general');
  const [title,     setTitle]     = useState('');
  const [message,   setMessage]   = useState('');

  // Loading states
  const [loadingCls,  setLoadingCls]  = useState(true);
  const [loadingStu,  setLoadingStu]  = useState(false);
  const [sending,     setSending]     = useState(false);
  const [deleting,    setDeleting]    = useState(null);

  // Sent history
  const [sent,        setSent]        = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  // ── Load classes ───────────────────────────────────────────
  useEffect(() => {
    api.get('/lectures/classes')   // reuse same endpoint
      .then(({ data }) => setClasses(data))
      .catch(() => {})
      .finally(() => setLoadingCls(false));
  }, []);

  // ── Update sections on class change ───────────────────────
  useEffect(() => {
    const cls = classes.find(c => String(c.id) === String(classId));
    setSections(cls?.sections || []);
    setSectionId('');
    setStudentId('');
    setStudentName('');
    setStudents([]);
  }, [classId, classes]);

  // ── Load students when section changes (for student target) ─
  useEffect(() => {
    if (target !== 'student' || !classId) { setStudents([]); return; }
    setLoadingStu(true);
    const params = { class_id: classId };
    if (sectionId) params.section_id = sectionId;
    api.get('/notifications/students', { params })
      .then(({ data }) => setStudents(data))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStu(false));
  }, [target, classId, sectionId]);

  // ── Load sent history ──────────────────────────────────────
  const loadSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      const { data } = await api.get('/notifications/sent');
      setSent(data);
    } catch {}
    finally { setLoadingSent(false); }
  }, []);

  useEffect(() => { loadSent(); }, [loadSent]);

  // ── Send ───────────────────────────────────────────────────
  const handleSend = async () => {
    if (!title.trim())   return Alert.alert('Required', 'Enter a title');
    if (!message.trim()) return Alert.alert('Required', 'Enter a message');
    if ((target === 'class' || target === 'section' || target === 'student') && !classId)
      return Alert.alert('Required', 'Select a class');
    if (target === 'section' && !sectionId)
      return Alert.alert('Required', 'Select a section');
    if (target === 'student' && !studentId)
      return Alert.alert('Required', 'Select a student');

    setSending(true);
    try {
      await api.post('/notifications', {
        target_type: target,
        class_id:    classId   || undefined,
        section_id:  sectionId || undefined,
        student_id:  studentId || undefined,
        category,
        title:   title.trim(),
        message: message.trim(),
      });

      Alert.alert('Sent ✅', 'Notification sent successfully');
      setTitle('');
      setMessage('');
      setClassId('');
      setSectionId('');
      setStudentId('');
      setStudentName('');
      setTarget('school');
      setCategory('general');
      loadSent();
    } catch (err) {
      Alert.alert('Failed', err?.response?.data?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  // ── Delete sent notification ───────────────────────────────
  const confirmDelete = (id) =>
    Alert.alert('Delete', 'Remove this notification?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(id) },
    ]);

  const doDelete = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/notifications/${id}`);
      setSent(p => p.filter(n => n.id !== id));
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed');
    } finally {
      setDeleting(null);
    }
  };

  // ── Category color helper ──────────────────────────────────
  const catInfo = (v) => CATEGORIES.find(c => c.value === v) || CATEGORIES[0];

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
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backTxt}>← Back</Text>
            </Pressable>
            <Pressable onPress={() => setShowHistory(v => !v)} style={styles.historyBtn}>
              <Text style={styles.historyBtnTxt}>
                {showHistory ? '✏️ Compose' : `📋 History (${sent.length})`}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.headerTitle}>🔔 Send Notification</Text>
          <Text style={styles.headerSub}>Notify students about holidays, exams, homework & more</Text>
        </LinearGradient>

        {/* ════════════════════════════════════════════════════ */}
        {showHistory ? (
          // ── Sent History ─────────────────────────────────
          <View style={styles.body}>
            <Text style={styles.sectionTitle}>Sent Notifications</Text>
            {loadingSent
              ? <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
              : sent.length === 0
                ? <Text style={styles.empty}>No notifications sent yet.</Text>
                : sent.map(n => {
                    const cat = catInfo(n.category);
                    const targetLabel =
                      n.target_type === 'school'  ? '🏫 Whole School'
                    : n.target_type === 'class'   ? `📚 ${n.class_name || 'Class'}`
                    : n.target_type === 'section' ? `👥 ${n.class_name} — Sec ${n.section_name}`
                    : `👤 ${n.st_first} ${n.st_last}`;

                    return (
                      <View key={n.id} style={styles.histCard}>
                        <View style={styles.histTop}>
                          <View style={[styles.catChip, { backgroundColor: cat.color + '20' }]}>
                            <Text style={[styles.catChipTxt, { color: cat.color }]}>{cat.label}</Text>
                          </View>
                          <Text style={styles.histTime}>{timeAgo(n.created_at)}</Text>
                          <Pressable onPress={() => confirmDelete(n.id)} disabled={deleting === n.id} style={styles.delBtn}>
                            {deleting === n.id
                              ? <ActivityIndicator size="small" color="#DC2626" />
                              : <Text style={styles.delBtnTxt}>🗑</Text>}
                          </Pressable>
                        </View>
                        <Text style={styles.histTitle}>{n.title}</Text>
                        <Text style={styles.histMsg} numberOfLines={2}>{n.message}</Text>
                        <Text style={styles.histTarget}>{targetLabel}</Text>
                      </View>
                    );
                  })
            }
          </View>
        ) : (
          // ── Compose Form ──────────────────────────────────
          <View style={styles.body}>

            {/* Target Type */}
            <Text style={styles.label}>Send To *</Text>
            <View style={styles.targetGrid}>
              {TARGETS.map(t => (
                <Pressable
                  key={t.value}
                  style={[styles.targetCard, target === t.value && styles.targetCardActive]}
                  onPress={() => { setTarget(t.value); setClassId(''); setSectionId(''); setStudentId(''); setStudentName(''); }}
                >
                  <Text style={[styles.targetLabel, target === t.value && styles.targetLabelActive]}>{t.label}</Text>
                  <Text style={styles.targetDesc}>{t.desc}</Text>
                </Pressable>
              ))}
            </View>

            {/* Class picker (class / section / student targets) */}
            {(target === 'class' || target === 'section' || target === 'student') && (
              <>
                <Text style={styles.label}>Class *</Text>
                {loadingCls
                  ? <ActivityIndicator color={C.primary} />
                  : (
                    <View style={styles.pickerWrap}>
                      <Picker selectedValue={String(classId)} onValueChange={setClassId} style={styles.picker}>
                        <Picker.Item label="— Select Class —" value="" />
                        {classes.map(c => <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />)}
                      </Picker>
                    </View>
                  )
                }
              </>
            )}

            {/* Section picker (section / student targets) */}
            {(target === 'section' || target === 'student') && classId && (
              <>
                <Text style={styles.label}>Section {target === 'section' ? '*' : ''}</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={String(sectionId)} onValueChange={setSectionId} style={styles.picker}>
                    <Picker.Item label={target === 'student' ? '— Any Section —' : '— Select Section —'} value="" />
                    {sections.map(s => <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />)}
                  </Picker>
                </View>
              </>
            )}

            {/* Student picker */}
            {target === 'student' && classId && (
              <>
                <Text style={styles.label}>Student *</Text>
                {loadingStu
                  ? <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} />
                  : students.length === 0
                    ? <Text style={styles.hint}>No students found. Select a class above.</Text>
                    : (
                      <View style={styles.pickerWrap}>
                        <Picker
                          selectedValue={String(studentId)}
                          onValueChange={(v, i) => {
                            setStudentId(v);
                            const s = students.find(st => String(st.id) === String(v));
                            setStudentName(s ? `${s.first_name} ${s.last_name}` : '');
                          }}
                          style={styles.picker}
                        >
                          <Picker.Item label="— Select Student —" value="" />
                          {students.map(s => (
                            <Picker.Item
                              key={s.id}
                              label={`${s.roll_no ? `#${s.roll_no}  ` : ''}${s.first_name} ${s.last_name}`}
                              value={String(s.id)}
                            />
                          ))}
                        </Picker>
                      </View>
                    )
                }
              </>
            )}

            {/* Category */}
            <Text style={styles.label}>Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.value}
                    style={[styles.catBtn, category === cat.value && { backgroundColor: cat.color + '20', borderColor: cat.color }]}
                    onPress={() => setCategory(cat.value)}
                  >
                    <Text style={[styles.catBtnTxt, category === cat.value && { color: cat.color, fontWeight: '800' }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Title */}
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. School Holiday on Friday"
              placeholderTextColor={C.textLight}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />

            {/* Message */}
            <Text style={styles.label}>Message *</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Write your message here…"
              placeholderTextColor={C.textLight}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            {/* Preview audience */}
            {(title || message) && (
              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>Preview audience:</Text>
                <Text style={styles.previewAudience}>
                  {target === 'school'  && '🏫 All students in your school'}
                  {target === 'class'   && (classId   ? `📚 All students in ${classes.find(c=>String(c.id)===String(classId))?.class_name || 'selected class'}` : '📚 (select a class)')}
                  {target === 'section' && (sectionId ? `👥 ${classes.find(c=>String(c.id)===String(classId))?.class_name} — Section ${sections.find(s=>String(s.id)===String(sectionId))?.section_name}` : '👥 (select class & section)')}
                  {target === 'student' && (studentName ? `👤 ${studentName}` : '👤 (select a student)')}
                </Text>
              </View>
            )}

            {/* Send button */}
            <Pressable style={[styles.sendBtn, sending && { opacity: 0.7 }]} onPress={handleSend} disabled={sending}>
              {sending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.sendBtnTxt}>🔔  Send Notification</Text>}
            </Pressable>

          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },

  header:       { paddingTop: 52, paddingBottom: 24, paddingHorizontal: 20 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  backBtn:      { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  backTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  historyBtn:   { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  historyBtnTxt:{ color: '#E0E7FF', fontWeight: '700', fontSize: 13 },
  headerTitle:  { color: '#E0E7FF', fontSize: 22, fontWeight: '900' },
  headerSub:    { color: '#A5B4FC', fontSize: 13, marginTop: 4 },

  body:          { padding: 20 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: C.textDark, marginBottom: 12 },
  label:         { fontSize: 13, fontWeight: '700', color: C.textMed, marginBottom: 6, marginTop: 18 },
  hint:          { fontSize: 12, color: C.textLight, marginTop: 4 },

  // Target grid (2 columns)
  targetGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  targetCard:    { flex: 1, minWidth: '45%', backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, padding: 12 },
  targetCardActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  targetLabel:   { fontSize: 14, fontWeight: '700', color: C.textMed },
  targetLabelActive: { color: C.primary },
  targetDesc:    { fontSize: 11, color: C.textLight, marginTop: 3 },

  // Picker
  pickerWrap:    { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  picker:        { height: 50, color: C.text },

  // Category chips
  catBtn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  catBtnTxt:     { fontSize: 13, color: C.textMed, fontWeight: '600' },

  // Inputs
  input:         { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text },
  textarea:      { minHeight: 110, paddingTop: 12 },

  // Preview
  previewBox:    { backgroundColor: C.primaryLight, borderRadius: 12, padding: 14, marginTop: 18 },
  previewLabel:  { fontSize: 11, fontWeight: '700', color: C.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewAudience: { fontSize: 14, color: C.primaryDark, fontWeight: '600' },

  // Send button
  sendBtn:       { marginTop: 24, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', elevation: 4, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  sendBtnTxt:    { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // History cards
  empty:         { color: C.textLight, textAlign: 'center', marginTop: 20, fontSize: 14 },
  histCard:      { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  histTop:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catChip:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  catChipTxt:    { fontSize: 11, fontWeight: '800' },
  histTime:      { fontSize: 11, color: C.textLight, flex: 1 },
  delBtn:        { padding: 4 },
  delBtnTxt:     { fontSize: 16 },
  histTitle:     { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 3 },
  histMsg:       { fontSize: 13, color: C.textMed },
  histTarget:    { fontSize: 12, color: C.primary, fontWeight: '600', marginTop: 6 },
});
