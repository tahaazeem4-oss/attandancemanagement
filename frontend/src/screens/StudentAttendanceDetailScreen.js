import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../config/theme';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function statusColor(s) {
  if (s === 'present') return { bg: C.presentBg, text: C.present };
  if (s === 'absent')  return { bg: C.absentBg,  text: C.absent  };
  if (s === 'leave')   return { bg: C.leaveBg,   text: C.leave   };
  return { bg: '#F1F5F9', text: '#94A3B8' };
}
function statusLabel(s) {
  if (s === 'present') return 'P';
  if (s === 'absent')  return 'A';
  if (s === 'leave')   return 'L';
  return '';
}

export default function StudentAttendanceDetailScreen({ route, navigation }) {
  const {
    student,
    year, month,
    class_id, section_id,
    class_name, section_name,
  } = route.params;

  const numDays = daysInMonth(year, month);
  const dayMap  = {};
  (student.days || []).forEach(d => {
    const day = parseInt(d.date.split('-')[2]);
    dayMap[day] = d.status;
  });

  const { present, absent, leave } = student.summary || { present: 0, absent: 0, leave: 0 };
  const total = present + absent + leave;
  const attendancePct = total > 0 ? Math.round((present / total) * 100) : 0;

  const handleNotify = () => {
    navigation.navigate('SendNotification', {
      prefill: {
        student_id:   student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        class_id,
        section_id,
        class_name,
        section_name,
      },
    });
  };

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Pressable onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.headerName}>{student.first_name} {student.last_name}</Text>
          <Text style={st.headerSub}>
            {class_name}  •  Section {section_name}
            {student.roll_no ? `  •  Roll #${student.roll_no}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Month label */}
        <View style={st.monthRow}>
          <Ionicons name="calendar-outline" size={16} color={C.primary} />
          <Text style={st.monthLabel}>{MONTHS[month - 1]} {year}</Text>
        </View>

        {/* Summary cards */}
        <View style={st.summaryRow}>
          {[
            { label: 'Present',  value: present, color: C.present, bg: C.presentBg },
            { label: 'Absent',   value: absent,  color: C.absent,  bg: C.absentBg  },
            { label: 'Leave',    value: leave,   color: C.leave,   bg: C.leaveBg   },
            { label: 'Attend. %',value: `${attendancePct}%`, color: C.primary, bg: C.primaryLight },
          ].map(s => (
            <View key={s.label} style={[st.summaryCard, { backgroundColor: s.bg }]}>
              <Text style={[st.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[st.summaryLabel, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        <View style={st.gridSection}>
          <Text style={st.gridTitle}>Day-by-Day Attendance</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={st.dayRow}>
              {Array.from({ length: numDays }, (_, i) => i + 1).map(day => {
                const status = dayMap[day];
                const c = statusColor(status);
                return (
                  <View key={day} style={[st.dayCell, { backgroundColor: c.bg }]}>
                    <Text style={[st.dayCellDay,    { color: c.text }]}>{day}</Text>
                    <Text style={[st.dayCellStatus, { color: c.text }]}>{statusLabel(status)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Legend */}
        <View style={st.legend}>
          {[
            { label: 'Present', color: C.present, bg: C.presentBg },
            { label: 'Absent',  color: C.absent,  bg: C.absentBg  },
            { label: 'Leave',   color: C.leave,   bg: C.leaveBg   },
            { label: 'No data', color: '#94A3B8',  bg: '#F1F5F9'   },
          ].map(l => (
            <View key={l.label} style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: l.bg, borderColor: l.color }]} />
              <Text style={[st.legendText, { color: l.color }]}>{l.label}</Text>
            </View>
          ))}
        </View>

        {/* Notify Parent CTA */}
        <View style={st.notifyCta}>
          <View style={{ flex: 1 }}>
            <Text style={st.notifyCtaTitle}>Send a notification to parent</Text>
            <Text style={st.notifyCtaSub}>
              Inform the parent about {student.first_name}'s attendance directly through the student portal.
            </Text>
          </View>
          <Pressable style={st.notifyCtaBtn} onPress={handleNotify}>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={st.notifyCtaBtnText}>Notify</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header:     { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, gap: 12 },
  backBtn:    { padding: 4 },
  headerName: { color: '#fff', fontSize: 17, fontWeight: '900' },
  headerSub:  { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },

  monthRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  monthLabel:{ fontSize: 15, fontWeight: '800', color: C.primary },

  summaryRow:   { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 },
  summaryCard:  { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  summaryLabel: { fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },

  gridSection: { marginHorizontal: 16, backgroundColor: C.card, borderRadius: 16, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  gridTitle:   { fontSize: 13, fontWeight: '800', color: C.textDark, marginBottom: 12 },
  dayRow:      { flexDirection: 'row', gap: 5 },
  dayCell:     { width: 36, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayCellDay:  { fontSize: 11, fontWeight: '700' },
  dayCellStatus:{ fontSize: 13, fontWeight: '900', marginTop: 2 },

  legend:      { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 14, paddingBottom: 6 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
  legendText:  { fontSize: 11, fontWeight: '700' },

  notifyCta:     { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginTop: 20, backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#BFDBFE', elevation: 2, shadowColor: C.primary, shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  notifyCtaTitle:{ fontSize: 14, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  notifyCtaSub:  { fontSize: 12, color: C.textMed, lineHeight: 17 },
  notifyCtaBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  notifyCtaBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
