// frontend/src/features/timetable/DayPeriodList.js
// Today / Tomorrow / Week switcher + period list — used by both the
// teacher and student read-only timetable screens.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../../config/theme';
import PeriodCard from './PeriodCard';

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABEL = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
};

function toMinutes(v) {
  const [h, m] = String(v || '').split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (m || 0);
}

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Week' },
];

export default function DayPeriodList({ mode, loadRange, emptyLabel = 'No classes scheduled.' }) {
  const [range, setRange] = useState('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [daysData, setDaysData] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const todayKey = DAY_ORDER[now.getDay()];

  const load = useCallback(async (r) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await loadRange(r);
      const days = data?.days || {};
      setDaysData(days);
      if (r === 'week') {
        setSelectedDay((prev) => (prev && days[prev] !== undefined ? prev : todayKey));
      }
    } catch (err) {
      setDaysData({});
      setError(err?.response?.data?.message || 'Could not load timetable.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRange]);

  useFocusEffect(useCallback(() => { load(range); }, [load, range]));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const activeDayKey = range === 'week' ? (selectedDay || todayKey) : (range === 'tomorrow' ? DAY_ORDER[(now.getDay() + 1) % 7] : todayKey);
  const periods = useMemo(() => {
    const list = daysData[activeDayKey] || [];
    return [...list].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }, [daysData, activeDayKey]);

  const isViewingToday = range === 'today' || (range === 'week' && activeDayKey === todayKey);
  const nowMinutes = isViewingToday ? now.getHours() * 60 + now.getMinutes() : null;

  const { currentIdx, nextIdx } = useMemo(() => {
    if (nowMinutes == null) return { currentIdx: -1, nextIdx: -1 };
    let cur = -1, nxt = -1;
    periods.forEach((p, idx) => {
      const start = toMinutes(p.start_time);
      const end = toMinutes(p.end_time);
      if (start == null || end == null) return;
      if (nowMinutes >= start && nowMinutes < end) cur = idx;
      else if (nowMinutes < start && nxt === -1) nxt = idx;
    });
    return { currentIdx: cur, nextIdx: nxt };
  }, [periods, nowMinutes]);

  return (
    <View style={styles.container}>
      <View style={styles.switcher}>
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <Pressable key={r.key} onPress={() => setRange(r.key)} style={[styles.switchBtn, active && styles.switchBtnActive]}>
              <Text style={[styles.switchText, active && styles.switchTextActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {range === 'week' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabsScroll} contentContainerStyle={styles.dayTabsContent}>
          {DAY_ORDER.map((key) => {
            const active = key === activeDayKey;
            const isToday = key === todayKey;
            return (
              <Pressable key={key} onPress={() => setSelectedDay(key)} style={[styles.dayTab, active && styles.dayTabActive]}>
                <Text style={[styles.dayTabText, active && styles.dayTabTextActive]}>{DAY_LABEL[key].slice(0, 3)}</Text>
                {isToday ? <View style={[styles.todayDot, active && styles.todayDotActive]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.dayHeading}>{DAY_LABEL[activeDayKey]}</Text>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.primary} /></View>
      ) : error ? (
        <View style={styles.panel}>
          <Ionicons name="calendar-outline" size={18} color={C.textMed} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !periods.length ? (
        <View style={styles.panel}>
          <Ionicons name="bed-outline" size={18} color={C.textMed} />
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {periods.map((p, idx) => (
            <PeriodCard
              key={`${p.class_id || ''}-${p.start_time}-${idx}`}
              period={p}
              mode={mode}
              highlight={idx === currentIdx ? 'now' : idx === nextIdx ? 'next' : null}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  switcher: {
    flexDirection: 'row', marginHorizontal: 14, marginTop: 12, marginBottom: 8,
    backgroundColor: '#F1F5F9', borderRadius: 14, padding: 4,
  },
  switchBtn: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  switchBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  switchText: { fontSize: 13, fontWeight: '700', color: C.textMed },
  switchTextActive: { color: C.primary },

  dayHeading: { fontSize: 15, fontWeight: '800', color: C.textDark, marginHorizontal: 16, marginBottom: 6 },

  dayTabsScroll: { flexGrow: 0, marginBottom: 6 },
  dayTabsContent: { paddingHorizontal: 14, gap: 8 },
  dayTab: {
    minWidth: 52, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10,
    borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9',
  },
  dayTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  dayTabText: { fontSize: 12, fontWeight: '800', color: C.textMed },
  dayTabTextActive: { color: '#FFFFFF' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, marginTop: 4 },
  todayDotActive: { backgroundColor: '#FFFFFF' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: {
    marginHorizontal: 14, marginTop: 6, padding: 18, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  emptyText: { color: C.textMed, fontSize: 13, lineHeight: 20, flex: 1 },
  list: { paddingHorizontal: 14, paddingBottom: 20 },
});
