// StudentLecturesScreen ─ Student / Parent portal
// Shows lectures for the student's own class (and their section or all-sections).
// No delete button — students can only view and download.
// Filters (subject, year, month, type, search) are CLIENT-SIDE after one fetch.
// Year/month pickers only show options where lectures actually exist.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import api from '../../services/api';
import { C } from '../../config/theme';
import PickerField from '../../components/PickerField';
import AppHeader from '../../components/AppHeader';

const TYPE_COLOR = { classwork: '#4F46E5', homework: '#D97706' };
const TYPE_BG    = { classwork: '#EEF2FF', homework: '#FFFBEB' };
const TYPE_LABEL = { classwork: '📖 Classwork', homework: '📝 Homework' };

const MONTH_NAMES = {
  '01': 'January', '02': 'February', '03': 'March',    '04': 'April',
  '05': 'May',     '06': 'June',     '07': 'July',     '08': 'August',
  '09': 'September','10': 'October', '11': 'November', '12': 'December',
};

export default function StudentLecturesScreen({ navigation, route }) {
  const fixedType = route?.params?.fixedType || '';
  const screenTitle = route?.params?.title || 'Lectures';
  const [lectures,      setLectures]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [filterMonth,   setFilterMonth]   = useState('');
  const [filterYear,    setFilterYear]    = useState('');
  const [filterType,    setFilterType]    = useState(fixedType);
  const [filterSubject, setFilterSubject] = useState('');

  // Support parent viewing child's portal
  const childId = route?.params?.child?.student_id;
  const isParentViewing = !!childId;

  useEffect(() => {
    setFilterType(fixedType);
  }, [fixedType]);

  const subjects = useMemo(() =>
    ['', ...Array.from(new Set(lectures.map(l => l.subject_name).filter(Boolean))).sort()]
  , [lectures]);

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(lectures.map(l => l.date?.slice(0, 4) || l.uploaded_at?.slice(0, 4)).filter(Boolean))).sort().reverse();
    return [{ label: 'All Years', value: '' }, ...years.map(y => ({ label: y, value: y }))];
  }, [lectures]);

  const availableMonths = useMemo(() => {
    const pool = filterYear
      ? lectures.filter(l => (l.date || l.uploaded_at)?.slice(0, 4) === filterYear)
      : lectures;
    const months = Array.from(new Set(pool.map(l => (l.date || l.uploaded_at)?.slice(5, 7)).filter(Boolean))).sort();
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
      if (q && !l.lecture_name?.toLowerCase().includes(q) && !l.title?.toLowerCase().includes(q) && !l.subject_name?.toLowerCase().includes(q)) return false;
      if (filterSubject && l.subject_name !== filterSubject) return false;
      if (filterType    && l.type         !== filterType)    return false;
      const dateField = l.date || l.uploaded_at;
      if (filterYear    && dateField?.slice(0, 4) !== filterYear)  return false;
      if (filterMonth   && dateField?.slice(5, 7) !== filterMonth) return false;
      return true;
    });
  }, [lectures, search, filterSubject, filterType, filterYear, filterMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isParentViewing 
        ? `/parent/children/${childId}/lectures`
        : '/lectures';
      const { data } = await api.get(endpoint);
      const lecturesData = isParentViewing ? (data.lectures || []) : data;
      setLectures(lecturesData);
    } catch {
      Alert.alert('Error', 'Could not load lectures');
    } finally {
      setLoading(false);
    }
  }, [isParentViewing, childId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const renderItem = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
      onPress={() => navigation.navigate('StudentLectureDetail', { lecture: item, child: route?.params?.child })}
    >
      <View style={styles.cardTop}>
        <View style={[styles.typePill, { backgroundColor: TYPE_BG[item.type] }]}>
          <Text style={[styles.typePillTxt, { color: TYPE_COLOR[item.type] }]}>
            {TYPE_LABEL[item.type]}
          </Text>
        </View>
        {item.file_url ? (
          <View style={styles.attachBadge}>
            <Text style={styles.attachBadgeTxt}>📎 PDF</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.lectureName} numberOfLines={2}>{item.lecture_name || item.title || 'Untitled'}</Text>
      {item.message ? (
        <Text style={styles.messagePreview} numberOfLines={2}>{item.message}</Text>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.metaChip}>📚 {item.subject_name || item.subject || 'Subject'}</Text>
        <Text style={styles.metaChip}>📅 {(item.date || item.uploaded_at || '').slice(0, 10)}</Text>
      </View>
      {item.class_name && (
        <Text style={styles.metaClass}>
          🏫 {item.class_name}{item.section_name ? ` — Sec ${item.section_name}` : ' — All Sections'}
        </Text>
      )}
      {item.uploaded_by && (
        <Text style={styles.uploader}>by {item.uploaded_by}</Text>
      )}
    </Pressable>
  );

  const ListHeader = (
    <View style={styles.filterCard}>
      <View style={styles.searchHeaderRow}>
        <TextInput
          style={styles.searchInputCompact}
          placeholder="Search by title or subject"
          placeholderTextColor="#94A3B8"
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
          <Text style={styles.filterLabel}>Subject</Text>
          <PickerField
            label="Subject"
            value={filterSubject}
            onChange={setFilterSubject}
            placeholder="All Subjects"
            items={subjects.map(s => ({ label: s === '' ? 'All Subjects' : s, value: s }))}
          />

          <Text style={styles.filterLabel}>Month</Text>
          <PickerField
            label="Month"
            value={filterMonth}
            onChange={setFilterMonth}
            placeholder="Any Month"
            items={availableMonths}
          />

          <Text style={styles.filterLabel}>Year</Text>
          <PickerField
            label="Year"
            value={filterYear}
            onChange={setFilterYear}
            placeholder="Any Year"
            items={availableYears}
          />

          {!fixedType ? (
            <>
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
            </>
          ) : (
            <>
              <Text style={styles.filterLabel}>Type</Text>
              <View style={styles.typeLockedRow}>
                <Text style={styles.typeLockedText}>{TYPE_LABEL[fixedType] || fixedType}</Text>
              </View>
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              setFilterSubject('');
              setFilterMonth('');
              setFilterYear('');
              if (!fixedType) setFilterType('');
            }}
          >
            <Text style={styles.clearBtnTxt}>Clear Filters</Text>
          </Pressable>
        </View>
      )}

      {!loading && (
        <Text style={styles.resultCount}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''} found
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.rootWrap}>
      <AppHeader title={screenTitle} navigation={navigation} />
      <View style={styles.root}>
        {loading ? (
          <ActivityIndicator color="#4F46E5" style={{ flex: 1, marginTop: 60 }} size="large" />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={l => String(l.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
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
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: { flex: 1, backgroundColor: C.bg },
  root:   { flex: 1, backgroundColor: C.bg },

  // Header
  header:      { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { color: '#EFF6FF', fontSize: 22, fontWeight: '900' },
  headerSub:   { color: '#93C5FD', fontSize: 13, marginTop: 3 },

  // Filter card (inside FlatList header)
  filterCard:  {
    backgroundColor: '#fff', marginHorizontal: 14, marginTop: 14, marginBottom: 8,
    borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
  },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInputCompact: {
    flex: 1,
    backgroundColor: '#F8FAFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1E293B',
  },
  filterToggleBtn: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  filterToggleTxt: { color: '#4338CA', fontSize: 13, fontWeight: '800' },
  advancedFiltersWrap: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 6 },
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
  typeLockedRow: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeLockedText: { fontSize: 13, fontWeight: '800', color: '#4338CA' },
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

  resultCount:  { fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'right' },

  // List
  listContent: { paddingBottom: 40 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 14, marginBottom: 12, padding: 16,
    elevation: 2, shadowColor: '#94A3B8', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typePill:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typePillTxt: { fontSize: 12, fontWeight: '800' },
  attachBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FDE68A' },
  attachBadgeTxt: { fontSize: 11, color: '#B45309', fontWeight: '700' },

  lectureName: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  messagePreview: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 6, fontStyle: 'italic' },
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
