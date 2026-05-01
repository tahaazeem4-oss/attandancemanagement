import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C } from '../config/theme';
import { HeaderBlobs } from '../components/Deco';
import { exportFile } from '../services/importExport';

const STATUS_COLOR = { present: C.present, absent: C.absent, leave: C.leave, not_marked: C.textLight };
const STATUS_BG    = { present: C.presentBg, absent: C.absentBg, leave: C.leaveBg, not_marked: '#F1F5F9' };
const STATUS_LABEL = { present: 'Present', absent: 'Absent', leave: 'On Leave', not_marked: 'Not Marked' };

export default function ReportScreen({ route }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const today = new Date().toISOString().slice(0, 10);

  const [records,  setRecords]  = useState([]);
  const [date,     setDate]     = useState(today);
  const [loading,  setLoading]  = useState(false);
  const [exporting, setExporting] = useState(false);
  // Summary card entrance animations
  const s1o = useRef(new Animated.Value(0)).current, s1y = useRef(new Animated.Value(20)).current;
  const s2o = useRef(new Animated.Value(0)).current, s2y = useRef(new Animated.Value(20)).current;
  const s3o = useRef(new Animated.Value(0)).current, s3y = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([ Animated.timing(s1o, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.spring(s1y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }) ]),
      Animated.parallel([ Animated.timing(s2o, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.spring(s2y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }) ]),
      Animated.parallel([ Animated.timing(s3o, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.spring(s3y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }) ]),
    ]).start();
  }, []);

  useEffect(() => { fetchReport(); }, [date]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/report', {
        params: { class_id, section_id, date }
      });
      setRecords(data.records || []);
    } catch {
      Alert.alert('Error', 'Could not load report');
    } finally {
      setLoading(false);
    }
  };

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    const next = d.toISOString().slice(0, 10);
    if (next <= today) setDate(next);
  };

  const handleExport = async () => {
    setExporting(true);
    await exportFile(
      '/import-export/attendance/export',
      `attendance_${class_name}_${section_name}_${date}.xlsx`,
      { class_id, section_id, date }
    );
    setExporting(false);
  };

  const counts = {
    present: records.filter(r => r.status === 'present').length,
    absent:  records.filter(r => r.status === 'absent').length,
    leave:   records.filter(r => r.status === 'leave').length
  };

  const CARD_ANIMS = [
    { o: s1o, y: s1y, key: 'present', icon: '✓', colors: ['#ECFDF5','#D1FAE5'] },
    { o: s2o, y: s2y, key: 'absent',  icon: '✗', colors: ['#FEF2F2','#FEE2E2'] },
    { o: s3o, y: s3y, key: 'leave',   icon: '~', colors: ['#FFFBEB','#FEF3C7'] },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* Gradient header */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.headerTitle}>{class_name} — Section {section_name}</Text>
          <Pressable onPress={handleExport} disabled={exporting} style={styles.exportBtn}>
            {exporting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.exportBtnTxt}>⬇ Export</Text>}
          </Pressable>
        </View>
        {/* Date navigator */}
        <View style={styles.dateRow}>
          <Pressable onPress={() => changeDate(-1)} style={styles.dateArrow}>
            <Text style={styles.dateArrowText}>‹</Text>
          </Pressable>
          <Text style={styles.headerDate}>📅  {date}</Text>
          <Pressable
            onPress={() => changeDate(1)}
            disabled={date >= today}
            style={[styles.dateArrow, date >= today && styles.dateArrowDisabled]}
          >
            <Text style={[styles.dateArrowText, date >= today && { color: 'rgba(255,255,255,0.3)' }]}>›</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Animated summary cards */}
      <View style={styles.summary}>
        {CARD_ANIMS.map(({ o, y, key, icon, colors }) => (
          <Animated.View key={key} style={{ flex: 1, opacity: o, transform: [{ translateY: y }] }}>
            <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
              <Text style={[styles.summaryIcon, { color: STATUS_COLOR[key] }]}>{icon}</Text>
              <Text style={[styles.summaryNum, { color: STATUS_COLOR[key] }]}>{counts[key]}</Text>
              <Text style={[styles.summaryLabel, { color: STATUS_COLOR[key] }]}>{key.toUpperCase()}</Text>
            </LinearGradient>
          </Animated.View>
        ))}
      </View>

      {/* Student records */}
      {loading
        ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={C.primary} size="large" />
          </View>
        )
        : (
          <FlatList
            data={records}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, paddingTop: 8 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <LinearGradient
                  colors={['#EEF2FF', '#E0E7FF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.first_name} {item.last_name}</Text>
                  {item.roll_no && <Text style={styles.rowRoll}>#{item.roll_no}</Text>}
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_BG[item.status] }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status] || item.status}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },

  header:       {
    paddingHorizontal: 20, paddingVertical: 22, overflow: 'hidden',
  },
  headerTitle:  { color: '#E0E7FF', fontSize: 17, fontWeight: '800', flex: 1 },
  exportBtn:    { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  exportBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  headerDate:   { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' },

  dateRow:      {
    flexDirection: 'row', alignItems: 'center', marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12,
    paddingHorizontal: 6, paddingVertical: 4, alignSelf: 'flex-start',
  },
  dateArrow:    { paddingHorizontal: 12, paddingVertical: 4 },
  dateArrowDisabled: { opacity: 0.4 },
  dateArrowText:{ color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },

  summary:      {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderBottomWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 12,
    gap: 10,
  },
  summaryCard:  {
    flex: 1, alignItems: 'center', borderRadius: 14,
    paddingVertical: 12,
  },
  summaryIcon:  { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  summaryNum:   { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 9, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },

  row:          {
    backgroundColor: C.card, borderRadius: 14, marginVertical: 4,
    paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: C.shadow, shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar:       {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText:   { color: C.primary, fontWeight: '800', fontSize: 12 },
  rowName:      { fontSize: 14, fontWeight: '700', color: C.textDark },
  rowRoll:      { fontSize: 11, color: C.textLight, marginTop: 1 },
  statusPill:   { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:   { fontSize: 11, fontWeight: '700' },
});
