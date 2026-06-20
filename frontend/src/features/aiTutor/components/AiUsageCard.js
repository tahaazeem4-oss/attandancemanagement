// frontend/src/features/aiTutor/components/AiUsageCard.js
// Student-facing AI quota usage card shown on the home screen.
// Shows daily/monthly requests used vs limit with a progress bar.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../../config/theme';

const ACCENT   = '#7C3AED';
const ACCENT_BG = '#F5F3FF';
const ACCENT_BORDER = '#DDD6FE';

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function ProgressBar({ used, limit, color }) {
  const pct = limit > 0 ? clamp(used / limit, 0, 1) : 0;
  const isHigh = pct >= 0.9;
  const isMid  = pct >= 0.6;
  const barColor = isHigh ? '#EF4444' : isMid ? '#F59E0B' : color;

  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: barColor }]} />
    </View>
  );
}

function StatRow({ icon, label, used, limit, period }) {
  const hasLimit = typeof limit === 'number' && limit > 0;
  const remaining = hasLimit ? Math.max(0, limit - (used || 0)) : null;
  const exhausted = hasLimit && remaining === 0;

  return (
    <View style={styles.statRow}>
      <View style={styles.statLeft}>
        <Ionicons name={icon} size={13} color={exhausted ? '#B91C1C' : ACCENT} style={{ marginRight: 5 }} />
        <Text style={[styles.statLabel, exhausted && styles.statLabelBad]}>{label}</Text>
      </View>
      <View style={styles.statRight}>
        {hasLimit ? (
          <>
            <ProgressBar used={used || 0} limit={limit} color={ACCENT} />
            <Text style={[styles.statValue, exhausted && styles.statValueBad]}>
              {exhausted
                ? 'Quota reached'
                : `${remaining} left of ${limit}`}
            </Text>
          </>
        ) : (
          <Text style={styles.statValue}>{used || 0} used</Text>
        )}
      </View>
    </View>
  );
}

export default function AiUsageCard({ quota, onPress }) {
  if (!quota) return null;

  const dailyPct = quota.daily_requests > 0
    ? clamp((quota.used_today_requests || 0) / quota.daily_requests, 0, 1)
    : 0;
  const monthlyPct = quota.monthly_requests > 0
    ? clamp((quota.used_month_requests || 0) / quota.monthly_requests, 0, 1)
    : 0;

  const isAnyExhausted =
    (quota.daily_requests > 0 && (quota.used_today_requests || 0) >= quota.daily_requests) ||
    (quota.monthly_requests > 0 && (quota.used_month_requests || 0) >= quota.monthly_requests);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, isAnyExhausted && styles.iconWrapBad]}>
            <Ionicons
              name="sparkles"
              size={16}
              color={isAnyExhausted ? '#B91C1C' : ACCENT}
            />
          </View>
          <View>
            <Text style={styles.title}>AI Tutor Usage</Text>
            <Text style={styles.subtitle}>Your question quota</Text>
          </View>
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={16} color={C.textMed} />
        )}
      </View>

      <View style={styles.divider} />

      <StatRow
        icon="today-outline"
        label="Today"
        used={quota.used_today_requests}
        limit={quota.daily_requests}
        period="daily"
      />
      <StatRow
        icon="calendar-outline"
        label="This month"
        used={quota.used_month_requests}
        limit={quota.monthly_requests}
        period="monthly"
      />

      {isAnyExhausted ? (
        <View style={styles.warningPill}>
          <Ionicons name="warning-outline" size={12} color="#B91C1C" />
          <Text style={styles.warningText}>Quota reached — questions will be blocked until reset</Text>
        </View>
      ) : (
        <View style={styles.okPill}>
          <Ionicons name="checkmark-circle-outline" size={12} color="#059669" />
          <Text style={styles.okText}>AI Tutor is active</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ACCENT_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 14,
  },
  cardPressed: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapBad: { backgroundColor: '#FEE2E2' },
  title: { fontSize: 14, fontWeight: '700', color: C.textDark },
  subtitle: { fontSize: 11, color: C.textMed, marginTop: 1 },
  divider: { height: 1, backgroundColor: ACCENT_BORDER, marginBottom: 10 },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  statLeft: { flexDirection: 'row', alignItems: 'center', width: 90 },
  statRight: { flex: 1 },
  statLabel: { fontSize: 12, fontWeight: '600', color: C.textMed },
  statLabelBad: { color: '#B91C1C' },
  statValue: { fontSize: 11, color: C.textMed, marginTop: 3 },
  statValueBad: { color: '#B91C1C', fontWeight: '700' },

  barTrack: {
    height: 6,
    backgroundColor: '#E9D5FF',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },

  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  warningText: { fontSize: 11, color: '#B91C1C', fontWeight: '600', flex: 1 },

  okPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  okText: { fontSize: 11, color: '#059669', fontWeight: '600' },
});
