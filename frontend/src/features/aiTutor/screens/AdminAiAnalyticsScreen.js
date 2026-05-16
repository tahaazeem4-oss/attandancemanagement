// frontend/src/features/aiTutor/screens/AdminAiAnalyticsScreen.js
// Drill-down AI Tutor usage analytics. Walk org → campus → class → section → student.
// Each level shows totals, top children by activity, and students who hit their quota.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { fetchScopeAnalytics } from '../api/aiTutorApi';

const TYPE_LABEL = {
  root: 'Top', organization: 'Org', campus: 'Campus',
  class: 'Class', section: 'Section', student: 'Student',
};

const fmt = (n) => Number(n || 0).toLocaleString();

export default function AdminAiAnalyticsScreen() {
  const navigation = useNavigation();
  const [stack, setStack] = useState([{ type: 'root', id: null, name: 'Top' }]);
  const [days] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const current = stack[stack.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchScopeAnalytics(current.type, current.id, days);
      setData(res.data || res);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [current.type, current.id, days]);

  useEffect(() => { load(); }, [load]);

  // Header back walks one level up the breadcrumb instead of leaving the screen.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (stack.length > 1) {
        e.preventDefault();
        setStack((s) => s.slice(0, -1));
      }
    });
    return unsub;
  }, [navigation, stack.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const goInto = (child) => {
    setStack([...stack, { type: child.type, id: child.id, name: child.name }]);
  };
  const goUp = (index) => {
    setStack(stack.slice(0, index + 1));
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>
    );
  }

  const totals = data?.totals || {};
  const children = data?.children || [];
  const exhausted = data?.exhausted || [];
  const series = data?.series || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Breadcrumb */}
        <View style={styles.crumbRow}>
          {stack.map((s, i) => (
            <View key={`${s.type}#${s.id}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {i > 0 && <Text style={styles.crumbSep}>›</Text>}
              <TouchableOpacity onPress={() => goUp(i)} disabled={i === stack.length - 1}>
                <Text style={[styles.crumb, i === stack.length - 1 && styles.crumbActive]}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={styles.title}>{data?.node?.name || current.name}</Text>
        <Text style={styles.subtitle}>Last {data?.days || days} days</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Totals grid */}
        <View style={styles.grid}>
          <Stat label="Queries"        value={fmt(totals.queries)} />
          <Stat label="Total tokens"   value={fmt(totals.total_tokens)} />
          <Stat label="Blocked (quota)" value={fmt(totals.blocked_quota)} tint={totals.blocked_quota ? '#DC2626' : '#111827'} />
          <Stat label="Blocked (scope)" value={fmt(totals.blocked_scope)} />
          <Stat label="Blocked (rate)"  value={fmt(totals.blocked_rate)} />
          <Stat label="No context"      value={fmt(totals.no_context)} />
          <Stat label="Avg latency ms"  value={fmt(totals.avg_latency_ms)} />
          <Stat label="Cost (USD)"      value={`$${(totals.total_cost_usd || 0).toFixed(2)}`} />
        </View>

        {/* Exhausted students */}
        {exhausted.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Students hitting their quota</Text>
            <Text style={styles.cardSubtle}>
              {exhausted.length} student{exhausted.length === 1 ? '' : 's'} were blocked at least once in this window.
            </Text>
            {exhausted.map((s) => (
              <TouchableOpacity
                key={`ex-${s.student_id}`}
                style={styles.exRow}
                onPress={() => goInto({ type: 'student', id: s.student_id, name: s.student_name })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.exName}>{s.student_name}</Text>
                  <Text style={styles.exMeta}>
                    {fmt(s.queries)} queries · {fmt(s.blocked_count)} blocked
                  </Text>
                </View>
                <View style={styles.blockedBadge}>
                  <Text style={styles.blockedBadgeText}>{fmt(s.blocked_count)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Children rollup */}
        {data?.child_type && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>
                By {TYPE_LABEL[data.child_type] || data.child_type}
              </Text>
              <Text style={styles.cardSubtle}>{children.length} item{children.length === 1 ? '' : 's'}</Text>
            </View>
            {children.length === 0 ? (
              <Text style={styles.empty}>No activity in this window.</Text>
            ) : (
              children.map((c) => (
                <TouchableOpacity
                  key={`${c.type}#${c.id}`}
                  style={styles.childRow}
                  onPress={() => goInto(c)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.childName}>{c.name}</Text>
                    <Text style={styles.childMeta}>
                      {fmt(c.queries)} queries · {fmt(c.total_tokens)} tokens
                      {c.total_cost_usd > 0 ? ` · $${c.total_cost_usd.toFixed(2)}` : ''}
                    </Text>
                  </View>
                  {c.blocked_quota > 0 ? (
                    <View style={styles.blockedBadge}>
                      <Text style={styles.blockedBadgeText}>{fmt(c.blocked_quota)} blocked</Text>
                    </View>
                  ) : null}
                  <Text style={styles.chev}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Daily series */}
        {series.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily queries</Text>
            {series.map((p) => (
              <View key={p.day} style={styles.rowLine}>
                <Text style={styles.day}>{p.day}</Text>
                <View style={[styles.bar, { width: Math.min(220, p.count * 6 + 4) }]} />
                <Text style={styles.count}>{p.count}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, tint }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 4 },
  subtitle: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  error: { color: '#B91C1C', fontSize: 13, marginBottom: 10 },

  crumbRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 },
  crumb: { color: '#2563EB', fontSize: 13, paddingVertical: 2 },
  crumbActive: { color: '#111827', fontWeight: '700' },
  crumbSep: { color: '#9CA3AF', marginHorizontal: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stat: { width: '48%', backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10 },
  statLabel: { color: '#6B7280', fontSize: 12 },
  statValue: { color: '#111827', fontSize: 18, fontWeight: '700', marginTop: 2 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginTop: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardSubtle: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  empty: { color: '#6B7280', fontSize: 13, paddingVertical: 6 },

  childRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  childName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  childMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  chev: { color: '#9CA3AF', fontSize: 22, marginLeft: 6 },

  exRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  exName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  exMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  blockedBadge: {
    backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
    marginRight: 8,
  },
  blockedBadgeText: { color: '#B91C1C', fontSize: 12, fontWeight: '700' },

  rowLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  day: { width: 90, color: '#374151', fontSize: 12 },
  bar: { height: 10, backgroundColor: '#2563EB', borderRadius: 4, marginHorizontal: 6 },
  count: { color: '#374151', fontSize: 12 },
});
