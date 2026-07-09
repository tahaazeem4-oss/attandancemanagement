// LectureListScreen ─ Teacher / Admin
// Shows all lectures for this school with search + filter controls.
// Filters (class, section, subject, year, month, type) are applied CLIENT-SIDE
// after a single fetch, so pickers respond instantly without extra API calls.
// Delete button is shown only to the user who uploaded the lecture.
// Accessible from: AdminHomeScreen → Lectures card, TeacherHomeScreen → Lectures.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import PickerField from '../components/PickerField';
import { C } from '../config/theme';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import { showDestructiveConfirm } from '../lib/confirmDialog';

const TYPE_COLOR = { classwork: '#4F46E5', homework: '#D97706' };
const TYPE_BG    = { classwork: '#EEF2FF', homework: '#FFFBEB' };
const TYPE_LABEL = { classwork: '📖 Class Work', homework: '📝 Homework' };

const MONTH_NAMES = {
  '01': 'January', '02': 'February', '03': 'March',    '04': 'April',
  '05': 'May',     '06': 'June',     '07': 'July',     '08': 'August',
  '09': 'September','10': 'October', '11': 'November', '12': 'December',
};

const BASE_URL = api.defaults.baseURL;

export default function LectureListScreen({ navigation }) {
  const { user } = useAuth();

  const belongsToCurrentTeacher = useCallback((lecture) => {
    if (!user || user.role !== 'teacher') return true;

    // Primary ownership check (preferred once API returns teacher_id)
    if (lecture?.teacher_id != null) {
      return String(lecture.teacher_id) === String(user.id);
    }

    // Fallback for legacy rows where teacher_id is missing in payload.
    const uploader = String(lecture?.uploaded_by || '').trim().toLowerCase();
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
    const email = String(user.email || '').trim().toLowerCase();
    return uploader !== '' && (uploader === fullName || uploader === email);
  }, [user]);

  const [classes,     setClasses]     = useState([]);
  const [sections,    setSections]    = useState([]);
  const [lectures,    setLectures]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(null);
  const [savingEdit,  setSavingEdit]  = useState(false);
  const [editingLecture, setEditingLecture] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editType, setEditType] = useState('classwork');
  const [editDate, setEditDate] = useState('');
  const [editMessage, setEditMessage] = useState('');

  const [search,        setSearch]        = useState('');
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [filterCls,     setFilterCls]     = useState('');
  const [filterSec,     setFilterSec]     = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterMonth,   setFilterMonth]   = useState('');
  const [filterYear,    setFilterYear]    = useState('');

  // ── Derived filter options (computed from loaded data) ─────────────────
  // Unique sorted subject names from loaded lectures
  const subjects = useMemo(() =>
    Array.from(new Set(lectures.map(l => l.subject_name).filter(Boolean))).sort()
  , [lectures]);

  // Years that actually have lectures, newest first
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(lectures.map(l => l.date?.slice(0, 4)).filter(Boolean))).sort().reverse();
    return [{ label: 'Any Year', value: '' }, ...years.map(y => ({ label: y, value: y }))];
  }, [lectures]);

  // Months that have lectures — scoped to the selected year (if any)
  const availableMonths = useMemo(() => {
    const pool = filterYear
      ? lectures.filter(l => l.date?.slice(0, 4) === filterYear)
      : lectures;
    const months = Array.from(new Set(pool.map(l => l.date?.slice(5, 7)).filter(Boolean))).sort();
    return [{ label: 'Any Month', value: '' }, ...months.map(m => ({ label: MONTH_NAMES[m] || m, value: m }))];
  }, [lectures, filterYear]);

  // Auto-clear month when changing year makes the chosen month unavailable
  useEffect(() => {
    if (filterMonth && !availableMonths.some(m => m.value === filterMonth)) {
      setFilterMonth('');
    }
  }, [availableMonths]);

  // ── Client-side filter ──────────────────────────────────────────
  // Applies all active filters to the full lectures array in memory.
  // No extra API call is needed — runs on every state change instantly.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lectures.filter(l => {
      if (q && !l.lecture_name?.toLowerCase().includes(q) && !l.subject_name?.toLowerCase().includes(q)) return false;
      if (filterCls     && String(l.class_id)   !== String(filterCls))  return false;
      if (filterSec     && String(l.section_id) !== String(filterSec))  return false;
      if (filterSubject && l.subject_name       !== filterSubject)       return false;
      if (filterType    && l.type               !== filterType)          return false;
      if (filterYear    && l.date?.slice(0, 4)  !== filterYear)          return false;
      if (filterMonth   && l.date?.slice(5, 7)  !== filterMonth)         return false;
      return true;
    });
  }, [lectures, search, filterCls, filterSec, filterSubject, filterType, filterYear, filterMonth]);

  // ── Fetch classes once (for filter pickers) ────────────────────────
  useEffect(() => {
    api.get('/lectures/classes')
      .then(({ data }) => setClasses(data))
      .catch(() => {});
  }, []);

  // When the class filter changes, update the sections list and reset section
  useEffect(() => {
    const cls = classes.find(c => String(c.id) === String(filterCls));
    setSections(cls?.sections || []);
    setFilterSec('');
  }, [filterCls, classes]);

  // ── Fetch all lectures for this school (no params — filtered client-side) ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/lectures');
      const list = Array.isArray(data) ? data : [];
      const scoped = user?.role === 'teacher'
        ? list.filter(belongsToCurrentTeacher)
        : list;
      setLectures(scoped);
    } catch {
      Alert.alert('Error', 'Could not load lectures');
    } finally {
      setLoading(false);
    }
  }, [user, belongsToCurrentTeacher]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openLecture = async (lecture) => {
    const url = lecture.file_url;
    if (!url) {
      Alert.alert('Error', 'No file URL available');
      return;
    }
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Cannot open file on this device');
    }
  };

  const confirmDelete = (lecture) => {
    showDestructiveConfirm({
      title: 'Delete Lecture',
      message: `Are you sure you want to delete "${lecture.lecture_name}"? This action cannot be undone.`,
      onConfirm: () => doDelete(lecture.id),
    });
  };

  const doDelete = async (id) => {
    setDeleting(id);
    try {
      await api.delete(`/lectures/${id}`);
      setLectures(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not delete');
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (lecture) => {
    setEditingLecture(lecture);
    setEditName(lecture.lecture_name || '');
    setEditSubject(lecture.subject_name || '');
    setEditType(lecture.type || 'classwork');
    setEditDate((lecture.date || '').slice(0, 10));
    setEditMessage(lecture.message || '');
  };

  const cancelEdit = () => {
    setEditingLecture(null);
    setEditName('');
    setEditSubject('');
    setEditType('classwork');
    setEditDate('');
    setEditMessage('');
  };

  const saveEdit = async () => {
    if (!editingLecture?.id) return;
    if (!editName.trim()) return Alert.alert('Required', 'Enter topic / title');
    if (!editSubject.trim()) return Alert.alert('Required', 'Enter subject');
    if (!editDate.trim()) return Alert.alert('Required', 'Enter date (YYYY-MM-DD)');

    setSavingEdit(true);
    try {
      const { data } = await api.put(`/lectures/${editingLecture.id}`, {
        lecture_name: editName.trim(),
        subject_name: editSubject.trim(),
        type: editType,
        date: editDate.trim(),
        message: editMessage.trim() || null,
      });

      setLectures(prev => prev.map(l => (l.id === editingLecture.id ? { ...l, ...data } : l)));
      cancelEdit();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update lecture');
    } finally {
      setSavingEdit(false);
    }
  };

  const renderItem = ({ item }) => {
    const canManage = user?.role !== 'teacher' || belongsToCurrentTeacher(item);

    return (
      <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.typePill, { backgroundColor: TYPE_BG[item.type] }]}>
          <Text style={[styles.typePillTxt, { color: TYPE_COLOR[item.type] }]}>{TYPE_LABEL[item.type]}</Text>
        </View>
        <Text style={styles.cardDate}>📅 {item.date?.slice(0, 10)}</Text>
      </View>
      <Text style={styles.lectureName} numberOfLines={2}>{item.lecture_name}</Text>
      <Text style={styles.meta}>📚 {item.subject_name}</Text>
      <Text style={styles.meta}>
        🏫 {item.class_name} — {item.section_name ? `Sec ${item.section_name}` : 'All Sections'}
      </Text>
      {item.uploaded_by && <Text style={styles.uploader}>Uploaded by: {item.uploaded_by}</Text>}
      <View style={styles.cardActions}>
        <Pressable style={styles.viewBtn} onPress={() => openLecture(item)}>
          <Text style={styles.viewBtnTxt}>⬇ View / Download</Text>
        </Pressable>
        {canManage && (
          <>
            <Pressable style={styles.editBtn} onPress={() => startEdit(item)}>
              <Text style={styles.editBtnTxt}>✏️</Text>
            </Pressable>
            <Pressable style={styles.delBtn} onPress={() => confirmDelete(item)} disabled={deleting === item.id}>
              {deleting === item.id
                ? <ActivityIndicator size="small" color="#DC2626" />
                : <Text style={styles.delBtnTxt}>🗑</Text>}
            </Pressable>
          </>
        )}
      </View>
      </View>
    );
  };

  const ListHeader = (
    <View style={styles.filterCard}>
      <View style={styles.searchHeaderRow}>
        <TextInput
          style={styles.searchInputCompact}
          placeholder="Search by title or subject"
          placeholderTextColor={C.textLight}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        <Pressable
          style={({ pressed }) => [styles.filterToggleBtn, pressed && { opacity: 0.8 }]}
          onPress={() => setFiltersOpen(v => !v)}
        >
          <Text style={styles.filterToggleTxt}>{filtersOpen ? 'Hide' : 'Filters'}</Text>
        </Pressable>
      </View>

      {filtersOpen && (
        <View style={styles.advancedFiltersWrap}>
          <Text style={styles.filterLabel}>Class</Text>
          <PickerField
            label="Class"
            value={filterCls}
            onChange={setFilterCls}
            placeholder="All Classes"
            items={[{ label: 'All Classes', value: '' }, ...classes.map(c => ({ label: c.class_name, value: String(c.id) }))]}
          />

          <Text style={styles.filterLabel}>Section</Text>
          <PickerField
            label="Section"
            value={filterSec}
            onChange={setFilterSec}
            placeholder="All Sections"
            disabled={!filterCls}
            items={[{ label: 'All Sections', value: '' }, ...sections.map(s => ({ label: `Sec ${s.section_name}`, value: String(s.id) }))]}
          />

          <Text style={styles.filterLabel}>Subject</Text>
          <PickerField
            label="Subject"
            value={filterSubject}
            onChange={setFilterSubject}
            placeholder="All Subjects"
            items={[{ label: 'All Subjects', value: '' }, ...subjects.map(s => ({ label: s, value: s }))]}
          />

          <Text style={styles.filterLabel}>Year</Text>
          <PickerField
            label="Year"
            value={filterYear}
            onChange={setFilterYear}
            placeholder="Any Year"
            items={availableYears}
          />

          <Text style={styles.filterLabel}>Month</Text>
          <PickerField
            label="Month"
            value={filterMonth}
            onChange={setFilterMonth}
            placeholder="Any Month"
            items={availableMonths}
          />

          <Text style={styles.filterLabel}>Type</Text>
          <View style={styles.chipRow}>
            {[
              { value: '',          label: 'All' },
              { value: 'classwork', label: '📖 Classwork' },
              { value: 'homework',  label: '📝 Homework' },
            ].map(t => (
              <Pressable
                key={t.value}
                style={[styles.chip, filterType === t.value && styles.chipActive]}
                onPress={() => setFilterType(t.value)}
              >
                <Text style={[styles.chipTxt, filterType === t.value && styles.chipTxtActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              setFilterCls('');
              setFilterSec('');
              setFilterSubject('');
              setFilterMonth('');
              setFilterYear('');
              setFilterType('');
            }}
          >
            <Text style={styles.clearBtnTxt}>Clear Filters</Text>
          </Pressable>
        </View>
      )}

      {!loading && (
        <Text style={styles.resultCount}>
          {filtered.length} lecture{filtered.length !== 1 ? 's' : ''} found
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <AppHeader title={user?.role === 'teacher' ? 'My Lectures' : 'All Lectures'} navigation={navigation} />

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ flex: 1, marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={l => String(l.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTxt}>No lectures found</Text>
              <Text style={styles.emptySub}>Try adjusting your filters</Text>
            </View>
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Modal
        visible={!!editingLecture}
        transparent
        animationType="fade"
        onRequestClose={cancelEdit}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit {editType === 'homework' ? 'Homework' : 'Classwork'}</Text>

            <Text style={styles.filterLabel}>Topic / Title</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Topic / Title"
              placeholderTextColor={C.textLight}
            />

            <Text style={styles.filterLabel}>Subject</Text>
            <TextInput
              style={styles.modalInput}
              value={editSubject}
              onChangeText={setEditSubject}
              placeholder="Subject"
              placeholderTextColor={C.textLight}
            />

            <Text style={styles.filterLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.textLight}
            />

            <Text style={styles.filterLabel}>Type</Text>
            <View style={styles.chipRow}>
              {[
                { value: 'classwork', label: '📖 Classwork' },
                { value: 'homework', label: '📝 Homework' },
              ].map(t => (
                <Pressable
                  key={t.value}
                  style={[styles.chip, editType === t.value && styles.chipActive]}
                  onPress={() => setEditType(t.value)}
                >
                  <Text style={[styles.chipTxt, editType === t.value && styles.chipTxtActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Message</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextarea]}
              value={editMessage}
              onChangeText={setEditMessage}
              placeholder="Optional message"
              placeholderTextColor={C.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={cancelEdit}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalSaveBtn, savingEdit && { opacity: 0.7 }]} onPress={saveEdit} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveTxt}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header:      { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { flex: 1, color: '#E0E7FF', fontSize: 19, fontWeight: '900' },
  uploadBtn:   { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  uploadBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 13 },

  filterCard: {
    backgroundColor: C.card, marginHorizontal: 14, marginTop: 14, marginBottom: 8,
    borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
  },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInputCompact: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
  },
  filterToggleBtn: {
    backgroundColor: C.primaryLight,
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  filterToggleTxt: { color: C.primary, fontSize: 13, fontWeight: '800' },
  advancedFiltersWrap: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: C.textMed, marginBottom: 5, marginTop: 10 },
  searchInput: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1.5, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.text,
  },
  pickerBox: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, overflow: 'hidden' },
  picker:    { height: 52, color: C.text },

  chipRow:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip:          { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  chipActive:    { backgroundColor: C.primaryLight, borderColor: C.primary },
  chipTxt:       { fontSize: 13, fontWeight: '600', color: C.textMed },
  chipTxtActive: { color: C.primary, fontWeight: '800' },
  clearBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearBtnTxt: { fontSize: 12, color: '#334155', fontWeight: '700' },
  resultCount:   { fontSize: 12, color: C.textLight, marginTop: 12, textAlign: 'right' },

  listContent: { paddingBottom: 40 },

  card: {
    backgroundColor: C.card, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#94A3B8', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typePill:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  typePillTxt: { fontSize: 11, fontWeight: '800' },
  cardDate:    { fontSize: 12, color: C.textMed },
  lectureName: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4 },
  meta:        { fontSize: 12, color: C.textMed, marginTop: 2 },
  uploader:    { fontSize: 11, color: C.textLight, marginTop: 4, fontStyle: 'italic' },

  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  viewBtn:     { flex: 1, backgroundColor: C.primaryLight, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  viewBtnTxt:  { color: C.primary, fontWeight: '700', fontSize: 13 },
  editBtn:     { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  editBtnTxt:  { fontSize: 16 },
  delBtn:      { backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  delBtnTxt:   { fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },
  modalTextarea: {
    minHeight: 90,
    paddingTop: 10,
  },
  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: C.bg,
  },
  modalCancelTxt: {
    fontWeight: '700',
    color: C.textMed,
  },
  modalSaveBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: C.primary,
  },
  modalSaveTxt: {
    fontWeight: '800',
    color: '#fff',
  },

  empty:     { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt:  { fontSize: 17, fontWeight: '800', color: C.textMed },
  emptySub:  { fontSize: 13, color: C.textLight, marginTop: 4 },
});
