import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';

const SUBJECT_PALETTE = [
  { bg: '#DBEAFE', text: '#1D4ED8', border: '#BFDBFE' },
  { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },
  { bg: '#EDE9FE', text: '#5B21B6', border: '#DDD6FE' },
  { bg: '#FFEDD5', text: '#C2410C', border: '#FED7AA' },
  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  { bg: '#CFFAFE', text: '#155E75', border: '#A5F3FC' },
  { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
];

const CELL_W = 64;
const LABEL_W = 60;

function compactTime(v) {
  return String(v || '').slice(0, 5);
}

function subjectColor(subjectId) {
  if (!subjectId) return null;
  return SUBJECT_PALETTE[Number(subjectId) % SUBJECT_PALETTE.length];
}

function buildGridData(days, slots, entries) {
  // entries indexed by day_key:slot_id
  const map = {};
  (entries || []).forEach((e) => { map[`${e.day_key}:${e.slot_id}`] = e; });
  return { map };
}

// --- Cell detail modal --------------------------------------------------------
function CellDetailModal({ visible, cell, onClose }) {
  if (!cell) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={detailStyles.overlay} onPress={onClose}>
        <View style={detailStyles.card}>
          <Text style={detailStyles.day}>{cell.dayLabel}</Text>
          <Text style={detailStyles.slot}>{cell.slotName}</Text>
          <Text style={detailStyles.time}>{cell.slotTime}</Text>
          {cell.subjectName ? (
            <View style={[detailStyles.subjectBadge, cell.color ? { backgroundColor: cell.color.bg, borderColor: cell.color.border } : null]}>
              <Text style={[detailStyles.subjectText, cell.color ? { color: cell.color.text } : null]}>{cell.subjectName}</Text>
            </View>
          ) : null}
          {cell.teacherName ? <Text style={detailStyles.teacher}>{cell.teacherName}</Text> : null}
          {cell.note ? <Text style={detailStyles.note}>{cell.note}</Text> : null}
          <Pressable style={detailStyles.closeBtn} onPress={onClose}>
            <Text style={detailStyles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// --- Main card -----------------------------------------------------------------
export default function TimetableSummaryCard({ child, isParentViewing = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [detailCell, setDetailCell] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = child?.student_id ? `/timetable/parent/${child.student_id}` : '/timetable/student';
      const response = await api.get(endpoint);
      setData(response.data);
    } catch (err) {
      setData(null);
      setError(err?.response?.data?.message || 'Timetable is not available yet.');
    } finally {
      setLoading(false);
    }
  }, [child?.student_id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const todayKey = useMemo(() => {
    const idx = new Date().getDay();
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][idx];
  }, []);

  const activeDays = useMemo(() => (data?.days || []).filter((d) => d.is_active !== false), [data?.days]);
  const activeSlots = useMemo(() => (data?.slots || []).filter((s) => s.is_active !== false), [data?.slots]);
  const { map: entryMap } = useMemo(() => buildGridData(activeDays, activeSlots, data?.entries), [activeDays, activeSlots, data?.entries]);

  const openCell = useCallback((day, slot) => {
    const entry = entryMap[`${day.day_key}:${slot.id}`];
    if (!entry?.subject_id) return;
    setDetailCell({
      dayLabel: day.day_label,
      slotName: slot.slot_name,
      slotTime: `${compactTime(slot.start_time)} - ${compactTime(slot.end_time)}`,
      subjectName: entry.subject_name || null,
      teacherName: entry.teacher_name || null,
      note: entry.note || null,
      color: entry.subject_id ? subjectColor(entry.subject_id) : null,
    });
  }, [entryMap]);

  const hasData = activeDays.length > 0 && activeSlots.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{isParentViewing ? "Child's Timetable" : 'Weekly Timetable'}</Text>
          <Text style={styles.title}>Schedule</Text>
        </View>
        <View style={styles.iconWrap}>
          <Ionicons name="grid-outline" size={18} color="#1D4ED8" />
        </View>
      </View>

      {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} /> : null}
      {!loading && error ? <Text style={styles.emptyText}>{error}</Text> : null}

      {!loading && !error && hasData ? (
        <>
          {/* Today indicator */}
          <View style={styles.todayRow}>
            <Ionicons name="ellipse" size={8} color={C.primary} />
            <Text style={styles.todayLabel}>
              Today: {activeDays.find((d) => d.day_key === todayKey)?.day_label || '-'}
            </Text>
            <Text style={styles.tapHint}>Tap a cell for details</Text>
          </View>

          {/* Grid */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
            <View>
              {/* Header row */}
              <View style={styles.gridRow}>
                <View style={[styles.labelCell, styles.headerLabel]}>
                  <Text style={styles.headerLabelText}>Time</Text>
                </View>
                {activeDays.map((day) => (
                  <View key={day.day_key} style={[styles.dayCell, styles.headerDay, day.day_key === todayKey && styles.todayHeader]}>
                    <Text style={[styles.headerDayText, day.day_key === todayKey && styles.todayHeaderText]}>
                      {day.day_label.slice(0, 3)}
                    </Text>
                    {day.day_key === todayKey ? <View style={styles.todayDot} /> : null}
                  </View>
                ))}
              </View>

              {/* Slot rows */}
              {activeSlots.map((slot) => {
                const isBreak = slot.slot_type !== 'instruction';
                return (
                  <View key={slot.id} style={styles.gridRow}>
                    {/* Time label */}
                    <View style={[styles.labelCell, isBreak && styles.labelCellBreak]}>
                      <Text style={styles.slotTime}>{compactTime(slot.start_time)}</Text>
                      <Text style={styles.slotName} numberOfLines={1}>{slot.slot_name}</Text>
                    </View>

                    {/* Day cells */}
                    {activeDays.map((day) => {
                      const key = `${day.day_key}:${slot.id}`;
                      const entry = entryMap[key];
                      const color = entry?.subject_id ? subjectColor(entry.subject_id) : null;
                      const isToday = day.day_key === todayKey;

                      return (
                        <Pressable
                          key={day.day_key}
                          style={[
                            styles.dayCell,
                            styles.entryCell,
                            isBreak ? styles.breakCell : null,
                            color ? { backgroundColor: color.bg, borderColor: color.border } : null,
                            isToday && !isBreak && !color ? styles.todayEmptyCell : null,
                            isToday && color ? { borderWidth: 1.5, borderColor: color.text } : null,
                          ]}
                          onPress={() => !isBreak && openCell(day, slot)}
                          disabled={isBreak || !entry?.subject_id}
                        >
                          {isBreak ? (
                            <Text style={styles.breakLabel} numberOfLines={1}>
                              {String(slot.slot_type).replace(/_/g, ' ').replace('free period', 'Free').replace('assembly', 'Asm')}
                            </Text>
                          ) : (
                            <>
                              <Text
                                style={[styles.subjectCell, color ? { color: color.text } : styles.emptyCellText]}
                                numberOfLines={2}
                              >
                                {entry?.subject_name
                                  ? entry.subject_name.length > 7 ? entry.subject_name.slice(0, 6) + '...' : entry.subject_name
                                  : '-'}
                              </Text>
                              {entry?.teacher_name && color ? (
                                <Text style={[styles.teacherInitials, { color: color.text }]} numberOfLines={1}>
                                  {entry.teacher_name.split(' ').map((w) => w[0]).join('').slice(0, 3)}
                                </Text>
                              ) : null}
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Legend */}
          {(data?.entries || []).length > 0 ? (
            <View style={styles.legendRow}>
              {Array.from(new Map((data.entries || []).filter((e) => e.subject_id && e.subject_name).map((e) => [e.subject_id, e])).values())
                .slice(0, 5)
                .map((e) => {
                  const color = subjectColor(e.subject_id);
                  return (
                    <View key={e.subject_id} style={styles.legendItem}>
                      <View style={[styles.legendDot, color ? { backgroundColor: color.text } : null]} />
                      <Text style={styles.legendText} numberOfLines={1}>{e.subject_name}</Text>
                    </View>
                  );
                })}
            </View>
          ) : null}
        </>
      ) : null}

      {!loading && !error && !hasData ? (
        <Text style={styles.emptyText}>No published timetable yet.</Text>
      ) : null}

      <CellDetailModal visible={!!detailCell} cell={detailCell} onClose={() => setDetailCell(null)} />
    </View>
  );
}

// --- Styles --------------------------------------------------------------------
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: C.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  eyebrow: { color: C.textMed, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: C.textDark, fontSize: 18, fontWeight: '800', marginTop: 2 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.textMed, fontSize: 13, lineHeight: 20, marginTop: 4 },

  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  todayLabel: { flex: 1, fontSize: 12, color: C.primary, fontWeight: '700' },
  tapHint: { fontSize: 11, color: C.textLight },

  // Grid
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  labelCell: { width: LABEL_W, paddingHorizontal: 4, paddingVertical: 8, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  labelCellBreak: { backgroundColor: '#FEF9EC' },
  headerLabel: { backgroundColor: '#F1F5F9' },
  headerLabelText: { fontSize: 9, fontWeight: '800', color: C.textMed, textTransform: 'uppercase', textAlign: 'center' },
  slotTime: { fontSize: 11, fontWeight: '800', color: C.textDark, textAlign: 'center' },
  slotName: { fontSize: 9, color: C.textMed, textAlign: 'center', marginTop: 1 },

  dayCell: { width: CELL_W, borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  headerDay: { paddingVertical: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  headerDayText: { fontSize: 11, fontWeight: '800', color: C.textDark },
  todayHeader: { backgroundColor: '#EEF2FF' },
  todayHeaderText: { color: C.primary },
  todayDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: C.primary, marginTop: 3 },

  entryCell: { paddingVertical: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderWidth: 0.5, borderColor: 'transparent' },
  breakCell: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  todayEmptyCell: { backgroundColor: '#F5F8FF' },
  breakLabel: { fontSize: 9, color: '#92400E', fontWeight: '700', textAlign: 'center', textTransform: 'capitalize' },
  subjectCell: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  teacherInitials: { fontSize: 9, textAlign: 'center', marginTop: 2, opacity: 0.75 },
  emptyCellText: { color: '#CBD5E1' },

  // Legend
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: C.primary },
  legendText: { fontSize: 11, color: C.textMed, fontWeight: '600', maxWidth: 70 },
});

// --- Detail modal styles -------------------------------------------------------
const detailStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22, width: '100%', maxWidth: 340 },
  day: { fontSize: 13, color: C.textMed, fontWeight: '700', marginBottom: 2 },
  slot: { fontSize: 20, fontWeight: '800', color: C.textDark },
  time: { fontSize: 13, color: C.textMed, marginBottom: 14 },
  subjectBadge: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#BFDBFE', alignSelf: 'flex-start', marginBottom: 10 },
  subjectText: { fontSize: 16, fontWeight: '800', color: C.primary },
  teacher: { fontSize: 13, color: C.textMed, marginBottom: 6 },
  note: { fontSize: 13, color: C.textMed, lineHeight: 20, marginBottom: 10 },
  closeBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '800', color: C.textDark },
});
