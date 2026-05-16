// frontend/src/features/aiTutor/components/AiQuotaPill.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
    borderRadius: 12, backgroundColor: '#EEF2FF',
  },
  text: { color: '#3730A3', fontWeight: '600', fontSize: 12 },
});
