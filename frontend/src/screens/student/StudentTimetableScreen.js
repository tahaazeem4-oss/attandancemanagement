import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SUBJECT_PALETTE = [
  { bg: '#EFF6FF', tint: '#DBEAFE', text: '#1D4ED8', accent: '#3B82F6' },
  { bg: '#ECFDF5', tint: '#D1FAE5', text: '#065F46', accent: '#10B981' },
  { bg: '#FDF2F8', tint: '#FCE7F3', text: '#9D174D', accent: '#EC4899' },
  { bg: '#F5F3FF', tint: '#EDE9FE', text: '#5B21B6', accent: '#8B5CF6' },
  { bg: '#FFF7ED', tint: '#FFEDD5', text: '#C2410C', accent: '#F97316' },
  { bg: '#FEFCE8', tint: '#FEF9C3', text: '#854D0E', accent: '#EAB308' },
  { bg: '#ECFEFF', tint: '#CFFAFE', text: '#155E75', accent: '#06B6D4' },
  { bg: '#F0FDF4', tint: '#DCFCE7', text: '#15803D', accent: '#22C55E' },
];

const NEUTRAL = { bg: '#F8FAFC', tint: '#E2E8F0', text: '#475569', accent: '#94A3B8' };
const BREAK_PALETTE = { bg: '#FFFBEB', tint: '#FEF3C7', text: '#92400E', accent: '#F59E0B' };

const SLOT_TYPE_META = {
  break: { label: 'Break', icon: 'cafe-outline' },
  assembly: { label: 'Assembly', icon: 'megaphone-outline' },
  free_period: { label: 'Free Period', icon: 'time-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal' },
};

function to12h(v) {
  const s = String(v || '').slice(0, 5);
  const [hStr, m] = s.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return s;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m || '00'} ${period}`;
}
function toMinutes(v) {
  const [h, m] = String(v || '').split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (m || 0);
}
function subjectColor(id) { return id ? SUBJECT_PALETTE[Number(id) % SUBJECT_PALETTE.length] : null; }
function subjectInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function dateForDay(targetKey, weekOffset = 0) {
  const today = new Date();
  const todayIdx = today.getDay();
  const targetIdx = DAY_ORDER.indexOf(targetKey);
  if (targetIdx < 0) return today;
  const diff = targetIdx - todayIdx + weekOffset * 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

function weekRangeLabel(offset) {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  const today = new Date();
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay() + offset * 7);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  const sM = MONTHS[sun.getMonth()];
  const eM = MONTHS[sat.getMonth()];
  return sM === eM
    ? `${sM} ${sun.getDate()}\u2013${sat.getDate()}`
    : `${sM} ${sun.getDate()} \u2013 ${eM} ${sat.getDate()}`;
}

export default function StudentTimetableScreen({ route }) {
  const child = route?.params?.child || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const tickRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = child?.student_id ? `/timetable/parent/${child.student_id}` : '/timetable/student';
      const { data: payload } = await api.get(endpoint);
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err?.response?.data?.message || 'Timetable is not available yet.');
    } finally {
      setLoading(false);
    }
  }, [child?.student_id]);

  // useFocusEffect covers both initial mount and every subsequent re-focus.
  // No separate useEffect needed — avoids double API call on mount.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(new Date()), 60000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const activeDays = useMemo(() => {
    const days = (data?.days || []).filter((d) => d.is_active !== false);
    return [...days].sort((a, b) => DAY_ORDER.indexOf(a.day_key) - DAY_ORDER.indexOf(b.day_key));
  }, [data?.days]);

  const todayKey = useMemo(() => DAY_ORDER[now.getDay()], [now]);

  useEffect(() => {
    if (!activeDays.length) { setSelectedDay(null); return; }
    if (selectedDay && activeDays.some((d) => d.day_key === selectedDay)) return;
    const todays = activeDays.find((d) => d.day_key === todayKey);
    setSelectedDay(todays ? todays.day_key : activeDays[0].day_key);
  }, [activeDays, selectedDay, todayKey]);

  const entryMap = useMemo(() => {
    const map = {};
    (data?.entries || []).forEach((e) => { map[`${e.day_key}:${e.slot_id}`] = e; });
    return map;
  }, [data?.entries]);

  const slotsForDay = useMemo(() => {
    if (!selectedDay) return [];
    const slots = (data?.slots || []).filter((s) => s.is_active !== false);
    const filtered = slots.filter((s) => {
      const keys = Array.isArray(s.day_keys) && s.day_keys.length ? s.day_keys : null;
      return !keys || keys.includes(selectedDay);
    });
    return filtered.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }, [data?.slots, selectedDay]);

  const dayIndex = activeDays.findIndex((d) => d.day_key === selectedDay);
  const canPrev = dayIndex > 0;
  const canNext = dayIndex >= 0 && dayIndex < activeDays.length - 1;
  const goPrev = () => { if (canPrev) setSelectedDay(activeDays[dayIndex - 1].day_key); };
  const goNext = () => { if (canNext) setSelectedDay(activeDays[dayIndex + 1].day_key); };

  const isToday = weekOffset === 0 && selectedDay === todayKey;
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : null;

  const { currentSlotId, nextSlotId } = useMemo(() => {
    if (!isToday || !slotsForDay.length || nowMinutes == null) return { currentSlotId: null, nextSlotId: null };
    let curId = null;
    let nxtId = null;
    for (const s of slotsForDay) {
      const start = toMinutes(s.start_time);
      const end = toMinutes(s.end_time);
      if (start == null || end == null) continue;
      if (nowMinutes >= start && nowMinutes < end) { curId = s.id; }
      else if (nowMinutes < start && nxtId == null) { nxtId = s.id; }
    }
    return { currentSlotId: curId, nextSlotId: nxtId };
  }, [isToday, slotsForDay, nowMinutes]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {error || !activeDays.length ? (
        <View style={styles.panel}>
          <Ionicons name="calendar-outline" size={18} color={C.textMed} />
          <Text style={styles.emptyText}>{error || 'No published timetable yet.'}</Text>
        </View>
      ) : (
        <>
          {/* Week navigator */}
          <View style={styles.weekNav}>
            <Pressable style={styles.weekNavBtn} onPress={() => setWeekOffset(o => o - 1)}>
              <Ionicons name="chevron-back" size={16} color={C.primary} />
            </Pressable>
            <Pressable style={{ alignItems: 'center', flex: 1 }} onPress={() => weekOffset !== 0 && setWeekOffset(0)}>
              <Text style={styles.weekLabel}>{weekRangeLabel(weekOffset)}</Text>
              {weekOffset !== 0 ? <Text style={styles.weekSub}>Tap \u00b7 Go to today</Text> : null}
            </Pressable>
            <Pressable style={styles.weekNavBtn} onPress={() => setWeekOffset(o => o + 1)}>
              <Ionicons name="chevron-forward" size={16} color={C.primary} />
            </Pressable>
          </View>

          {/* Day strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayStripContent}
            style={styles.dayStrip}
          >
            {activeDays.map((d) => {
              const active = d.day_key === selectedDay;
              const isTodayChip = weekOffset === 0 && d.day_key === todayKey;
              const date = dateForDay(d.day_key, weekOffset);
              return (
                <Pressable
                  key={d.day_key}
                  onPress={() => setSelectedDay(d.day_key)}
                  style={[
                    styles.dayChip,
                    active && styles.dayChipActive,
                    !active && isTodayChip && styles.dayChipToday,
                  ]}
                >
                  <Text style={[styles.dayChipWeek, active && styles.dayChipWeekActive]}>
                    {d.day_label.slice(0, 3).toUpperCase()}
                  </Text>
                  <Text style={[styles.dayChipDate, active && styles.dayChipDateActive]}>
                    {date.getDate()}
                  </Text>
                  {isTodayChip ? <View style={[styles.todayDot, active && styles.todayDotActive]} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Nav header */}
          <View style={styles.navRow}>
            <Pressable style={[styles.navBtn, !canPrev && styles.navBtnDisabled]} onPress={goPrev} disabled={!canPrev}>
              <Ionicons name="chevron-back" size={18} color={canPrev ? C.primary : C.textLight} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.currentDay}>{activeDays[dayIndex]?.day_label || ''}</Text>
              <Text style={styles.currentDate}>
                {(() => { const dt = dateForDay(selectedDay, weekOffset); return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`; })()}
                {isToday ? '  \u00b7  Today' : ''}
              </Text>
            </View>
            <Pressable style={[styles.navBtn, !canNext && styles.navBtnDisabled]} onPress={goNext} disabled={!canNext}>
              <Ionicons name="chevron-forward" size={18} color={canNext ? C.primary : C.textLight} />
            </Pressable>
          </View>

          {/* Compact list — fills remaining space, rows share it evenly */}
          {!slotsForDay.length ? (
            <View style={styles.panel}>
              <Ionicons name="bed-outline" size={18} color={C.textMed} />
              <Text style={styles.emptyText}>No classes scheduled. Enjoy the break!</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {slotsForDay.map((slot) => {
                const entry = entryMap[`${selectedDay}:${slot.id}`];
                const isInstruction = slot.slot_type === 'instruction';
                const meta = SLOT_TYPE_META[slot.slot_type];
                const palette = isInstruction
                  ? (entry?.subject_id ? subjectColor(entry.subject_id) : NEUTRAL)
                  : BREAK_PALETTE;
                const isCurrent = slot.id === currentSlotId;
                const isNext = slot.id === nextSlotId;
                const title = isInstruction
                  ? (entry?.subject_name || slot.slot_name || 'Free Period')
                  : (meta?.label || slot.slot_name || 'Break');

                return (
                  <View key={slot.id} style={[styles.row, { borderColor: palette.tint }]}>
                    <View style={[styles.stripe, { backgroundColor: palette.accent }]} />
                    <View style={styles.timeCol}>
                      <Text style={styles.timeStart}>{to12h(slot.start_time)}</Text>
                      <Text style={styles.timeEnd}>{to12h(slot.end_time)}</Text>
                    </View>
                    <View style={[styles.avatar, { backgroundColor: palette.bg, borderColor: palette.tint }]}>
                      {isInstruction ? (
                        <Text style={[styles.avatarText, { color: palette.text }]}>
                          {subjectInitials(entry?.subject_name || slot.slot_name)}
                        </Text>
                      ) : (
                        <Ionicons name={meta?.icon || 'ellipse-outline'} size={16} color={palette.text} />
                      )}
                    </View>
                    <View style={styles.bodyCol}>
                      <View style={styles.titleRow}>
                        <Text style={styles.slotName} numberOfLines={1}>{title}</Text>
                        {isCurrent ? (
                          <View style={[styles.statusPill, { backgroundColor: '#10B981' }]}>
                            <Text style={styles.statusText}>NOW</Text>
                          </View>
                        ) : isNext ? (
                          <View style={[styles.statusPill, { backgroundColor: palette.accent }]}>
                            <Text style={styles.statusText}>NEXT</Text>
                          </View>
                        ) : null}
                      </View>
                      {isInstruction && entry?.teacher_name ? (
                        <Text style={[styles.teacher, { color: palette.text }]} numberOfLines={1}>
                          <Ionicons name="person-outline" size={11} /> {entry.teacher_name}
                        </Text>
                      ) : !isInstruction ? (
                        <Text style={styles.subMuted} numberOfLines={1}>Scheduled pause</Text>
                      ) : (
                        <Text style={styles.subMuted} numberOfLines={1}>Teacher not assigned</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

  panel: {
    marginHorizontal: 14, marginTop: 14, padding: 18,
    borderRadius: 18, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  emptyText: { color: C.textMed, fontSize: 13, lineHeight: 20, flex: 1 },

  // Day strip
  dayStrip: { marginTop: 10, flexGrow: 0 },
  dayStripContent: { paddingHorizontal: 14, gap: 6, flexGrow: 1, justifyContent: 'center' },
  dayChip: {
    width: 44, height: 54,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 4,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  dayChipActive: {
    backgroundColor: C.primary, borderColor: C.primary,
    shadowColor: '#1D4ED8', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  dayChipToday: { borderColor: C.primary, borderWidth: 1.5 },
  dayChipWeek: { fontSize: 9, fontWeight: '800', color: C.textMed, letterSpacing: 0.5 },
  dayChipWeekActive: { color: 'rgba(255,255,255,0.85)' },
  dayChipDate: { fontSize: 14, fontWeight: '800', color: C.textDark, marginTop: 1 },
  dayChipDateActive: { color: '#FFFFFF' },
  todayDot: { width: 4, height: 4, borderRadius: 999, backgroundColor: C.primary, marginTop: 2 },
  todayDotActive: { backgroundColor: '#FFFFFF' },

  // Nav row
  navRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginTop: 10, marginBottom: 4,
  },
  navBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnDisabled: { backgroundColor: '#F1F5F9', borderColor: '#F1F5F9' },
  currentDay: { color: C.textDark, fontWeight: '800', fontSize: 15 },
  currentDate: { color: C.textMed, fontSize: 11, fontWeight: '600', marginTop: 1 },

  // List — flex:1 fills remaining space; rows share evenly via flex:1
  list: { flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 6,
    minHeight: 56,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  timeCol: { width: 72, paddingLeft: 10, paddingRight: 8 },
  timeStart: { fontSize: 11, fontWeight: '800', color: C.textDark },
  timeEnd: { fontSize: 10, fontWeight: '700', color: C.textLight, marginTop: 1 },
  avatar: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 12, fontWeight: '800' },
  bodyCol: { flex: 1, paddingHorizontal: 10, paddingVertical: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  slotName: { fontSize: 14, fontWeight: '800', color: C.textDark, flex: 1 },

  statusPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
  },
  statusText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },

  teacher: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  subMuted: { color: C.textLight, fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Week navigator
  weekNav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2,
  },
  weekNavBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  weekLabel: { fontSize: 13, fontWeight: '800', color: C.textDark, letterSpacing: 0.1 },
  weekSub: { fontSize: 10, fontWeight: '600', color: C.primary, marginTop: 1 },
});
