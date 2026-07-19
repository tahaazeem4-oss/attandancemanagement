// frontend/src/features/aiTutor/screens/StudentAiAnalyticsScreen.js
// Personal AI Tutor usage analytics for a student.
// Shows their own query history, quota status, daily usage bars, and block events.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { fetchStudentAnalytics } from '../api/aiTutorApi';
import useAiTutorConfig from '../hooks/useAiTutorConfig';

const ACCENT   = '#7C3AED';
const DAYS_OPTIONS = [7, 30, 60, 90];

const fmt = (n) => Number(n || 0).toLocaleString();

function StatCard({ icon, label, value, tint, bg }) {
  return (
    <View style={[styles.statCard, bg && { backgroundColor: bg }]}>
      <View style={[styles.statIconWrap, { backgroundColor: `${tint || ACCENT}18` }]}>
        <Ionicons name={icon} size={18} color={tint || ACCENT} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tint && { color: tint }]}>{value}</Text>
    </View>
  );
}

function QuotaBar({ label, used, limit }) {
  if (limit == null || limit <= 0) {
    return (
      <View style={styles.quotaRow}>
        <Text style={styles.quotaLabel}>{label}</Text>
        <Text style={styles.quotaUnlimited}>{used} used · unlimited</Text>
      </View>
    );
  }
  const pct = Math.min((used || 0) / limit, 1);
  const remaining = Math.max(0, limit - (used || 0));
  const isHigh = pct >= 0.9;
  const isMid  = pct >= 0.6;
  const barColor = isHigh ? '#EF4444' : isMid ? '#F59E0B' : ACCENT;
  return (
    <View style={styles.quotaRow}>
      <View style={styles.quotaTopRow}>
        <Text style={styles.quotaLabel}>{label}</Text>
        <Text style={[styles.quotaValue, isHigh && styles.quotaValueBad]}>
          {isHigh ? 'Quota reached' : `${remaining} of ${limit} left`}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

export default function StudentAiAnalyticsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const childData = route?.params?.child;
  const childStudentId = childData?.student_id ?? childData?.id ?? null;

  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const { quota } = useAiTutorConfig({ studentId: childStudentId });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchStudentAnalytics(days, childStudentId);
      setData(res.data || res);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [days, childStudentId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const totals  = data?.totals  || {};
  const series  = data?.series  || [];
  const maxCount = series.length ? Math.max(...series.map((s) => s.count), 1) : 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={ACCENT} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>My AI Usage</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Period selector */}
        <View style={styles.chipRow}>
          {DAYS_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setDays(d)}
              style={[styles.chip, days === d && styles.chipActive]}
            >
              <Text style={[styles.chipText, days === d && styles.chipTextActive]}>
                {d === 7 ? '7 days' : d === 30 ? '30 days' : d === 60 ? '60 days' : '90 days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Usage stats grid */}
            <Text style={styles.sectionTitle}>Last {data?.days || days} days</Text>
            <View style={styles.statGrid}>
              <StatCard
                icon="chatbubble-outline"
                label="Questions asked"
                value={fmt(totals.queries)}
                tint={ACCENT}
              />
              <StatCard
                icon="flash-outline"
                label="Tokens used"
                value={fmt(totals.total_tokens)}
                tint="#0891B2"
              />
              <StatCard
                icon="ban-outline"
                label="Quota blocks"
                value={fmt(totals.blocked_quota)}
                tint={totals.blocked_quota > 0 ? '#DC2626' : '#6B7280'}
              />
              <StatCard
                icon="timer-outline"
                label="Avg response ms"
                value={fmt(totals.avg_latency_ms)}
                tint="#059669"
              />
            </View>

            {/* Quota status */}
            {quota ? (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="pie-chart-outline" size={16} color={ACCENT} />
                  <Text style={styles.cardTitle}>Quota Status</Text>
                </View>
                <QuotaBar
                  label="Today's requests"
                  used={quota.used_today_requests}
                  limit={quota.daily_requests}
                />
                <QuotaBar
                  label="This month"
                  used={quota.used_month_requests}
                  limit={quota.monthly_requests}
                />
              </View>
            ) : null}

            {/* Daily series chart */}
            {series.length > 0 ? (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="bar-chart-outline" size={16} color={ACCENT} />
                  <Text style={styles.cardTitle}>Daily questions</Text>
                </View>
                {series.map((p) => (
                  <View key={p.day} style={styles.barRow}>
                    <Text style={styles.barDay}>{p.day.slice(5)}</Text>
                    <View style={styles.barTrackWide}>
                      <View
                        style={[
                          styles.barFillWide,
                          { width: `${Math.round((p.count / maxCount) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.barCount}>{p.count}</Text>
                  </View>
                ))}
              </View>
            ) : !loading ? (
              <View style={styles.emptyBox}>
                <Ionicons name="sparkles-outline" size={32} color="#D1D5DB" />
                <Text style={styles.emptyText}>No AI queries in this period.</Text>
                <Text style={styles.emptySubtext}>Ask the AI Tutor a question to see your usage here.</Text>
              </View>
            ) : null}

            {/* Blocked-scope info */}
            {totals.blocked_scope > 0 ? (
              <View style={[styles.card, styles.infoCard]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="information-circle-outline" size={16} color="#D97706" />
                  <Text style={[styles.cardTitle, { color: '#D97706' }]}>Access restricted</Text>
                </View>
                <Text style={styles.infoText}>
                  {totals.blocked_scope} request{totals.blocked_scope === 1 ? '' : 's'} were blocked
                  because the AI Tutor was disabled for your class or section during this period.
                  Contact your teacher or school admin for more information.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 6 },
  topTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText:   { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10,
    marginBottom: 12, borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },

  sectionTitle: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statIconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB',
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  quotaRow: { marginBottom: 12 },
  quotaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  quotaLabel: { fontSize: 13, color: '#374151', fontWeight: '500' },
  quotaValue: { fontSize: 12, color: '#6B7280' },
  quotaValueBad: { color: '#DC2626', fontWeight: '700' },
  quotaUnlimited: { fontSize: 12, color: '#6B7280' },
  barTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: 6, borderRadius: 4 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 8 },
  barDay: { fontSize: 12, color: '#6B7280', width: 36, textAlign: 'right' },
  barTrackWide: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFillWide:  { height: 8, borderRadius: 4, backgroundColor: ACCENT },
  barCount: { fontSize: 12, color: '#374151', fontWeight: '600', width: 24, textAlign: 'right' },

  infoCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  infoText: { fontSize: 13, color: '#92400E', lineHeight: 19 },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', marginTop: 10 },
  emptySubtext: { fontSize: 13, color: '#D1D5DB', marginTop: 4, textAlign: 'center' },
});
