// LectureListScreen ─ Teacher / Admin
// Shows all lectures for this school with search + filter controls.
// Filters (class, section, subject, year, month, type) are applied CLIENT-SIDE
// after a single fetch, so pickers respond instantly without extra API calls.
// Delete button is shown only to the user who uploaded the lecture.
// Accessible from: AdminHomeScreen → Lectures card, TeacherHomeScreen → Lectures.
import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing    from 'expo-sharing';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';
import { C } from '../config/theme';
import { AuthContext } from '../context/AuthContext';

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
  const { user } = useContext(AuthContext);

  const [classes,     setClasses]     = useState([]);
  const [sections,    setSections]    = useState([]);
  const [lectures,    setLectures]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState(null);
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
    setDownloading(lecture.id);
    try {
      const token    = api.defaults.headers.common['Authorization']?.replace('Bearer ', '');
      const url      = `${BASE_URL}/lectures/${lecture.id}/file`;
      const filename = `${lecture.lecture_name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;
      const localUri = FileSystem.cacheDirectory + filename;

      const { status } = await FileSystem.downloadAsync(url, localUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (status !== 200) { Alert.alert('Error', 'Could not download file'); return; }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, { mimeType: 'application/pdf', dialogTitle: lecture.lecture_name, UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Saved', localUri);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setDownloading(null);
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
        <Pressable style={styles.viewBtn} onPress={() => openLecture(item)} disabled={downloading === item.id}>
          {downloading === item.id
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Text style={styles.viewBtnTxt}>⬇ View / Download</Text>}
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
      <View style={styles.pickerBox}>
        <Picker selectedValue={filterCls} onValueChange={setFilterCls} style={styles.picker} dropdownIconColor={C.textMed}>
          <Picker.Item label="All Classes" value="" color={C.text} />
          {classes.map(c => <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} color={C.text} />)}
        </Picker>
      </View>

      <Text style={styles.filterLabel}>Section</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={filterSec} onValueChange={setFilterSec} style={styles.picker} dropdownIconColor={C.textMed} enabled={!!filterCls}>
          <Picker.Item label="All Sections" value="" color={C.text} />
          {sections.map(s => <Picker.Item key={s.id} label={`Sec ${s.section_name}`} value={String(s.id)} color={C.text} />)}
        </Picker>
      </View>

      <Text style={styles.filterLabel}>Subject</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={filterSubject} onValueChange={setFilterSubject} style={styles.picker} dropdownIconColor={C.textMed}>
          <Picker.Item label="All Subjects" value="" color={C.text} />
          {subjects.map(s => <Picker.Item key={s} label={s} value={s} color={C.text} />)}
        </Picker>
      </View>

      <Text style={styles.filterLabel}>Year</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={filterYear} onValueChange={setFilterYear} style={styles.picker} dropdownIconColor={C.textMed}>
          {availableYears.map(y => <Picker.Item key={y.value} label={y.label} value={y.value} color={C.text} />)}
        </Picker>
      </View>

      <Text style={styles.filterLabel}>Month</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={filterMonth} onValueChange={setFilterMonth} style={styles.picker} dropdownIconColor={C.textMed}>
          {availableMonths.map(m => <Picker.Item key={m.value} label={m.label} value={m.value} color={C.text} />)}
        </Picker>
      </View>

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
      <StatusBar barStyle="light-content" backgroundColor="#1E1B4B" />

      <LinearGradient
        colors={['#1E1B4B', '#312E81', '#4338CA']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backTxt}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>📚 All Lectures</Text>
          <Pressable style={styles.uploadBtn} onPress={() => navigation.navigate('UploadLecture')}>
            <Text style={styles.uploadBtnTxt}>⬆ Upload</Text>
          </Pressable>
        </View>
      </LinearGradient>

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
  backBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  backTxt:     { color: '#fff', fontWeight: '700', fontSize: 13 },
  headerTitle: { flex: 1, color: '#E0E7FF', fontSize: 19, fontWeight: '900' },
  uploadBtn:   { backgroundColor: '#4ADE80', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  uploadBtnTxt:{ color: '#064E3B', fontWeight: '800', fontSize: 13 },

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
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
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
