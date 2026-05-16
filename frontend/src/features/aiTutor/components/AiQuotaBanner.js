// frontend/src/features/aiTutor/components/AiQuotaBanner.js
// Compact daily/weekly/monthly usage card with progress bars.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
  const ratio = hasLimit ? Math.min(1, (used || 0) / limit) : 0;
  const exhausted = hasLimit && (used || 0) >= limit;
  const color = exhausted ? '#DC2626' : ratio > 0.8 ? '#D97706' : '#2563EB';
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowMeta, exhausted && styles.rowMetaBad]}>
          {hasLimit ? `${used || 0} / ${limit} tok` : `${used || 0} tok`}
          {exhausted ? `  ·  ${fmtReset(periodType)}` : ''}
        </Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

export default function AiQuotaBanner({ quota }) {
  if (!quota) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.h}>Your AI usage</Text>
      <Row label="Today"      periodType="daily"   used={quota.used_today_tokens}  limit={quota.daily_tokens} />
      <Row label="This week"  periodType="weekly"  used={quota.used_week_tokens}   limit={quota.weekly_tokens} />
      <Row label="This month" periodType="monthly" used={quota.used_month_tokens}  limit={quota.monthly_tokens} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginHorizontal: 12, marginBottom: 10, gap: 6 },
  h: { fontWeight: '700', color: '#111827', marginBottom: 4 },
  row: { paddingVertical: 4 },
  rowLabel: { color: '#374151', fontSize: 12, fontWeight: '600' },
  rowRight: { marginTop: 2 },
  rowMeta: { color: '#6B7280', fontSize: 11 },
  rowMetaBad: { color: '#B91C1C', fontWeight: '700' },
  barTrack: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
