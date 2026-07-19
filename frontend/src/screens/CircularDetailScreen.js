// frontend/src/screens/CircularDetailScreen.js
import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import api from '../services/api';
import { C } from '../config/theme';
import AppHeader from '../components/AppHeader';

const TARGET_LABEL = {
  school:  '🏫 Whole School',
  class:   '📚 Class',
  section: '👥 Section',
  student: '👤 You',
};

export default function CircularDetailScreen({ navigation, route }) {
  const { circular, isStaff, isParentViewing, childId } = route.params || {};

  useEffect(() => {
    if (!circular || circular.is_read) return;
    const path = isParentViewing
      ? `/parent/children/${childId}/notifications/${circular.id}/read`
      : isStaff
        ? `/notifications/inbox/${circular.id}/read`
        : `/notifications/${circular.id}/read`;
    api.post(path).catch(() => {});
  }, [circular, isStaff, isParentViewing, childId]);

  if (!circular) {
    return (
      <View style={styles.root}>
        <AppHeader title="Circular" navigation={navigation} />
        <Text style={styles.missing}>Circular not found.</Text>
      </View>
    );
  }

  const targetLabel = circular.target_type === 'class'
    ? `${TARGET_LABEL.class}: ${circular.class_name || ''}`
    : circular.target_type === 'section'
      ? `${TARGET_LABEL.section}: ${circular.class_name || ''} — Sec ${circular.section_name || ''}`
      : TARGET_LABEL[circular.target_type] || TARGET_LABEL.school;

  return (
    <View style={styles.root}>
      <AppHeader title="Circular" eyebrow="School Notice" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{circular.title}</Text>
        <Text style={styles.date}>
          {new Date(circular.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>From: {circular.sender_name || 'School'}</Text>
          <Text style={styles.metaText}>{targetLabel}</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.message}>{circular.message}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { padding: 20 },
  missing: { textAlign: 'center', marginTop: 40, color: C.textMed },
  title: { fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  date: { fontSize: 12, color: C.textLight, marginBottom: 14 },
  metaRow: { gap: 4, marginBottom: 4 },
  metaText: { fontSize: 13, color: C.textMed, fontWeight: '600' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 16 },
  message: { fontSize: 15, color: C.textDark, lineHeight: 24 },
});
