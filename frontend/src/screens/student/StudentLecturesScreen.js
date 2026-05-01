// StudentLecturesScreen ─ Student / Parent portal
// Shows lectures for the student's own class (and their section or all-sections).
// No delete button — students can only view and download.
// Filters (subject, year, month, type, search) are CLIENT-SIDE after one fetch.
// Year/month pickers only show options where lectures actually exist.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing    from 'expo-sharing';
import { Picker } from '@react-native-picker/picker';
import api from '../../services/api';
import { C } from '../../config/theme';

const TYPE_COLOR = { classwork: '#4F46E5', homework: '#D97706' };
const TYPE_BG    = { classwork: '#EEF2FF', homework: '#FFFBEB' };
const TYPE_LABEL = { classwork: '📖 Classwork', homework: '📝 Homework' };

const MONTH_NAMES = {
  '01': 'January', '02': 'February', '03': 'March',    '04': 'April',
  '05': 'May',     '06': 'June',     '07': 'July',     '08': 'August',
  '09': 'September','10': 'October', '11': 'November', '12': 'December',
};

const BASE_URL = api.defaults.baseURL;

export default function StudentLecturesScreen({ navigation }) {
  const [lectures,      setLectures]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [filterMonth,   setFilterMonth]   = useState('');
  const [filterYear,    setFilterYear]    = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [downloading,   setDownloading]   = useState(null);

  const subjects = useMemo(() =>
    ['', ...Array.from(new Set(lectures.map(l => l.subject_name).filter(Boolean))).sort()]
  , [lectures]);

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(lectures.map(l => l.date?.slice(0, 4)).filter(Boolean))).sort().reverse();
    return [{ label: 'All Years', value: '' }, ...years.map(y => ({ label: y, value: y }))];
  }, [lectures]);

  const availableMonths = useMemo(() => {
    const pool = filterYear
      ? lectures.filter(l => l.date?.slice(0, 4) === filterYear)
      : lectures;
    const months = Array.from(new Set(pool.map(l => l.date?.slice(5, 7)).filter(Boolean))).sort();
    return [{ label: 'All Months', value: '' }, ...months.map(m => ({ label: MONTH_NAMES[m] || m, value: m }))];
  }, [lectures, filterYear]);

  useEffect(() => {
    if (filterMonth && !availableMonths.some(m => m.value === filterMonth)) {
      setFilterMonth('');
    }
  }, [availableMonths]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lectures.filter(l => {
      if (q && !l.lecture_name?.toLowerCase().includes(q) && !l.subject_name?.toLowerCase().includes(q)) return false;
      if (filterSubject && l.subject_name !== filterSubject) return false;
      if (filterType    && l.type         !== filterType)    return false;
      if (filterYear    && l.date?.slice(0, 4) !== filterYear)  return false;
      if (filterMonth   && l.date?.slice(5, 7) !== filterMonth) return false;
      return true;
    });
  }, [lectures, search, filterSubject, filterType, filterYear, filterMonth]);

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

  // ── Download / View PDF ───────────────────────────────────────
  const openLecture = async (lecture) => {
    setDownloading(lecture.id);
    try {
      const token    = api.defaults.headers.common['Authorization']?.replace('Bearer ', '');
      const url      = `${BASE_URL}/lectures/${lecture.id}/file`;
      const filename = `${lecture.lecture_name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      const localUri = FileSystem.cacheDirectory + filename;

      const { status } = await FileSystem.downloadAsync(url, localUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (status !== 200) {
        Alert.alert('Error', 'Could not download the lecture file');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'application/pdf',
          dialogTitle: lecture.lecture_name,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `File saved to: ${localUri}`);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open lecture');
    } finally {
      setDownloading(null);
    }
  };

  const renderItem = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() => openLecture(item)}
    >
      <View style={styles.cardTop}>
        <View style={[styles.typePill, { backgroundColor: TYPE_BG[item.type] }]}>
          <Text style={[styles.typePillTxt, { color: TYPE_COLOR[item.type] }]}>
            {TYPE_LABEL[item.type]}
          </Text>
        </View>
        <View style={styles.downloadBtn}>
          {downloading === item.id
            ? <ActivityIndicator size="small" color="#4F46E5" />
            : <Text style={styles.downloadIcon}>⬇</Text>}
        </View>
      </View>
      <Text style={styles.lectureName} numberOfLines={2}>{item.lecture_name}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaChip}>📚 {item.subject_name}</Text>
        <Text style={styles.metaChip}>📅 {item.date?.slice(0, 10)}</Text>
      </View>
      <Text style={styles.metaClass}>
        🏫 {item.class_name}{item.section_name ? ` — Sec ${item.section_name}` : ' — All Sections'}
      </Text>
      {item.uploaded_by && (
        <Text style={styles.uploader}>Uploaded by {item.uploaded_by}</Text>
      )}
    </Pressable>
  );

  const ListHeader = (
    <View style={styles.filterCard}>
      {/* Search */}
      <Text style={styles.filterLabel}>Search</Text>
      <TextInput
        style={[styles.searchInput, { marginBottom: 2 }]}
        placeholder="Lecture name or subject…"
        placeholderTextColor="#94A3B8"
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />

      {/* Subject */}
      <Text style={styles.filterLabel}>Subject</Text>
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={filterSubject}
          onValueChange={setFilterSubject}
          style={styles.picker}
          dropdownIconColor="#475569"
        >
          {subjects.map(s => (
            <Picker.Item key={s} label={s === '' ? 'All Subjects' : s} value={s} color="#1E293B" />
          ))}
        </Picker>
      </View>

      {/* Month */}
      <Text style={styles.filterLabel}>Month</Text>
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={filterMonth}
          onValueChange={setFilterMonth}
          style={styles.picker}
          dropdownIconColor="#475569"
        >
          {availableMonths.map(m => (
            <Picker.Item key={m.value} label={m.label} value={m.value} color="#1E293B" />
          ))}
        </Picker>
      </View>

      {/* Year */}
      <Text style={styles.filterLabel}>Year</Text>
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={filterYear}
          onValueChange={setFilterYear}
          style={styles.picker}
          dropdownIconColor="#475569"
        >
          {availableYears.map(y => (
            <Picker.Item key={y.value} label={y.label} value={y.value} color="#1E293B" />
          ))}
        </Picker>
      </View>

      {/* Type chips */}
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
            <Text style={[styles.chipTxt, filterType === t.value && styles.chipTxtActive]}>
              {t.label}
            </Text>
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
      <StatusBar barStyle="light-content" backgroundColor="#064E3B" />

      {/* Header */}
      <LinearGradient
        colors={['#064E3B', '#065F46', '#047857']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backTxt}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>📚 Lectures</Text>
        <Text style={styles.headerSub}>Browse notes, classwork & homework</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ flex: 1, marginTop: 60 }} size="large" />
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
  root:   { flex: 1, backgroundColor: '#F0F4FF' },

  // Header
  header:      { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20 },
  backBtn:     { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  backTxt:     { color: '#fff', fontWeight: '700', fontSize: 13 },
  headerTitle: { color: '#ECFDF5', fontSize: 22, fontWeight: '900' },
  headerSub:   { color: '#A7F3D0', fontSize: 13, marginTop: 3 },

  // Filter card (inside FlatList header)
  filterCard:  {
    backgroundColor: '#fff', marginHorizontal: 14, marginTop: 14, marginBottom: 8,
    borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 5, marginTop: 10 },
  searchRow:   { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: '#F8FAFF',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1E293B',
  },
  searchBtn:    { backgroundColor: '#4F46E5', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  searchBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  pickerBox:    { backgroundColor: '#F8FAFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden' },
  picker:       { height: 52, color: '#1E293B' },

  chipRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip:         { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFF' },
  chipActive:   { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  chipTxt:      { fontSize: 13, fontWeight: '600', color: '#475569' },
  chipTxtActive:{ color: '#4F46E5', fontWeight: '800' },

  resultCount:  { fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'right' },

  // List
  listContent: { paddingBottom: 40 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 14, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typePill:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typePillTxt: { fontSize: 12, fontWeight: '800' },
  downloadBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  downloadIcon:{ fontSize: 18 },

  lectureName: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  metaRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  metaChip:    { fontSize: 12, color: '#475569', backgroundColor: '#F0F4FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  metaClass:   { fontSize: 12, color: '#475569', marginTop: 2 },
  uploader:    { fontSize: 11, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },

  // Empty
  empty:     { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt:  { fontSize: 17, fontWeight: '800', color: '#475569' },
  emptySub:  { fontSize: 13, color: '#94A3B8', marginTop: 4 },
});
