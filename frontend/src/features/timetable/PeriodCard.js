// frontend/src/features/timetable/PeriodCard.js
// Shared read-only period card used by the teacher and student timetable
// views — subject-colored avatar, time column, and a role-appropriate
// meta line (teacher name for students, class/section for teachers).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../config/theme';

export const SUBJECT_PALETTE = [
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

export function subjectColor(subjectId) {
  if (!subjectId) return NEUTRAL;
  return SUBJECT_PALETTE[Number(subjectId) % SUBJECT_PALETTE.length];
}

export function to12h(v) {
  const s = String(v || '').slice(0, 5);
  const [hStr, m] = s.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return s;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m || '00'} ${period}`;
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function PeriodCard({ period, mode = 'student', highlight }) {
  const palette = subjectColor(period.subject_id);
  const title = period.subject_name || 'Free Period';
  const metaLine = mode === 'teacher'
    ? [period.class_name, period.section_name].filter(Boolean).join(' - ')
    : period.teacher_name;

  return (
    <View style={[styles.row, { borderColor: palette.tint }]}>
      <View style={[styles.stripe, { backgroundColor: palette.accent }]} />
      <View style={styles.timeCol}>
        <Text style={styles.timeStart}>{to12h(period.start_time)}</Text>
        <Text style={styles.timeEnd}>{to12h(period.end_time)}</Text>
      </View>
      <View style={[styles.avatar, { backgroundColor: palette.bg, borderColor: palette.tint }]}>
        <Text style={[styles.avatarText, { color: palette.text }]}>{initials(title)}</Text>
      </View>
      <View style={styles.bodyCol}>
        <View style={styles.titleRow}>
          <Text style={styles.subjectText} numberOfLines={1}>{title}</Text>
          {highlight ? (
            <View style={[styles.pill, { backgroundColor: highlight === 'now' ? C.present : palette.accent }]}>
              <Text style={styles.pillText}>{highlight === 'now' ? 'NOW' : 'NEXT'}</Text>
            </View>
          ) : null}
        </View>
        {metaLine ? (
          <Text style={[styles.metaText, { color: palette.text }]} numberOfLines={1}>
            <Ionicons name={mode === 'teacher' ? 'school-outline' : 'person-outline'} size={11} /> {metaLine}
          </Text>
        ) : (
          <Text style={styles.metaMuted} numberOfLines={1}>Not assigned</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    marginBottom: 8, minHeight: 60,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  timeCol: { width: 76, paddingLeft: 12, paddingRight: 8 },
  timeStart: { fontSize: 12, fontWeight: '800', color: C.textDark },
  timeEnd: { fontSize: 10, fontWeight: '700', color: C.textLight, marginTop: 1 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarText: { fontSize: 13, fontWeight: '800' },
  bodyCol: { flex: 1, paddingHorizontal: 10, paddingVertical: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  subjectText: { fontSize: 14, fontWeight: '800', color: C.textDark, flex: 1 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  pillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  metaText: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  metaMuted: { color: C.textLight, fontSize: 12, fontWeight: '600', marginTop: 2 },
});
