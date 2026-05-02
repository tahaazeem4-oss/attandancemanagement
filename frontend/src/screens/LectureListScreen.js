// LectureListScreen ─ Teacher / Admin
// Shows all lectures for this school with search + filter controls.
// Filters (class, section, subject, year, month, type) are applied CLIENT-SIDE
// after a single fetch, so pickers respond instantly without extra API calls.
// Delete button is shown only to the user who uploaded the lecture.
// Accessible from: AdminHomeScreen → Lectures card, TeacherHomeScreen → Lectures.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Linking } from 'react-native';
import api from '../services/api';
import PickerField from '../components/PickerField';
import { C } from '../config/theme';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';

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

  const [classes,     setClasses]     = useState([]);
  const [sections,    setSections]    = useState([]);
  const [lectures,    setLectures]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(null);

  const [search,        setSearch]        = useState('');
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
      setLectures(data);
    } catch {
      Alert.alert('Error', 'Could not load lectures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openLecture = async (lecture) => {
    const token = api.defaults.headers.common['Authorization']?.replace('Bearer ', '');
    const url   = `${BASE_URL}/lectures/${lecture.id}/file?_token=${encodeURIComponent(token)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Cannot open file on this device');
    }
  };

  const confirmDelete = (lecture) => {
    Alert.alert(
      'Delete Lecture',
      `Delete "${lecture.lecture_name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => doDelete(lecture.id) },
      ]
    );
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

  const renderItem = ({ item }) => (
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
        {(item.teacher_id === user?.id || (user?.role === 'admin' && item.teacher_id == null)) && (
          <Pressable style={styles.delBtn} onPress={() => confirmDelete(item)} disabled={deleting === item.id}>
            {deleting === item.id
              ? <ActivityIndicator size="small" color="#DC2626" />
              : <Text style={styles.delBtnTxt}>🗑</Text>}
          </Pressable>
        )}
      </View>
    </View>
  );

  const ListHeader = (
    <View style={styles.filterCard}>
      <Pressable
        style={{ backgroundColor: C.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 14 }}
        onPress={() => navigation.navigate('UploadLecture')}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>⬆ Upload Lecture</Text>
      </Pressable>
      <Text style={styles.filterLabel}>Search</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Lecture name or subject…"
        placeholderTextColor={C.textLight}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />

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

      {!loading && (
        <Text style={styles.resultCount}>
          {filtered.length} lecture{filtered.length !== 1 ? 's' : ''} found
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <AppHeader title="All Lectures" navigation={navigation} />

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
  delBtn:      { backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  delBtnTxt:   { fontSize: 16 },

  empty:     { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt:  { fontSize: 17, fontWeight: '800', color: C.textMed },
  emptySub:  { fontSize: 13, color: C.textLight, marginTop: 4 },
});
