// frontend/src/features/aiTutor/components/AiQuotaPill.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../../config/theme';

export default function AiQuotaPill({ quota }) {
  if (!quota) return null;
  const parts = [];
  if (quota.remaining_daily_requests   !== null && quota.remaining_daily_requests   !== undefined) parts.push(`D ${quota.remaining_daily_requests}`);
  if (quota.remaining_weekly_requests  !== null && quota.remaining_weekly_requests  !== undefined) parts.push(`W ${quota.remaining_weekly_requests}`);
  if (quota.remaining_monthly_requests !== null && quota.remaining_monthly_requests !== undefined) parts.push(`M ${quota.remaining_monthly_requests}`);
  if (!parts.length) return null;

  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{parts.join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  text: { color: C.white, fontWeight: '700', fontSize: 12 },
});
