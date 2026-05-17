// frontend/src/features/aiTutor/components/AiQuotaBanner.js
// Compact daily/weekly/monthly usage summary.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../../config/theme';

function fmtReset(periodType) {
  const now = new Date();
  let target;
  if (periodType === 'daily') {
    target = new Date(now);
    target.setHours(24, 0, 0, 0);
  } else if (periodType === 'weekly') {
    target = new Date(now);
    const day = target.getDay(); // 0=Sun..6=Sat; weeks start Monday
    const daysUntilMonday = ((8 - day) % 7) || 7;
    target.setDate(target.getDate() + daysUntilMonday);
    target.setHours(0, 0, 0, 0);
  } else {
    target = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  }
  const diffMs = target.getTime() - now.getTime();
  const hrs = Math.max(0, Math.round(diffMs / 3_600_000));
  if (hrs < 24) return `resets in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `resets in ${days}d`;
}

function Row({ label, periodType, used, limit }) {
  const hasLimit = typeof limit === 'number' && limit > 0;
  const exhausted = hasLimit && (used || 0) >= limit;
  return (
    <View style={[styles.row, exhausted && styles.rowExhausted]}>
      <Text style={[styles.rowLabel, exhausted && styles.rowLabelBad]}>{label}</Text>
      <Text style={[styles.rowMeta, exhausted && styles.rowMetaBad]} numberOfLines={1}>
        {hasLimit ? `${used || 0}/${limit}` : `${used || 0}`}
      </Text>
      {exhausted ? <Text style={styles.rowReset}>{fmtReset(periodType)}</Text> : null}
    </View>
  );
}

export default function AiQuotaBanner({ quota }) {
  if (!quota) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.h}>AI usage</Text>
      <View style={styles.rowWrap}>
        <Row label="Today" periodType="daily" used={quota.used_today_tokens} limit={quota.daily_tokens} />
        <Row label="Week" periodType="weekly" used={quota.used_week_tokens} limit={quota.weekly_tokens} />
        <Row label="Month" periodType="monthly" used={quota.used_month_tokens} limit={quota.monthly_tokens} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FBFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#DBEAFE' },
  h: { fontWeight: '700', color: C.textDark, fontSize: 12 },
  rowWrap: { flex: 1, flexDirection: 'row', gap: 8 },
  row: { flex: 1, backgroundColor: C.white, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#DBEAFE' },
  rowExhausted: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rowLabel: { color: C.textMed, fontSize: 10, fontWeight: '700', marginBottom: 1 },
  rowLabelBad: { color: '#B91C1C' },
  rowMeta: { color: C.primaryDark, fontSize: 11, fontWeight: '700' },
  rowMetaBad: { color: '#B91C1C' },
  rowReset: { color: '#B91C1C', fontSize: 9, marginTop: 2, fontWeight: '600' },
});
