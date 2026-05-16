// frontend/src/features/aiTutor/screens/AdminAiAnalyticsScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchUsageAnalytics } from '../api/aiTutorApi';

export default function AdminAiAnalyticsScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const res = await fetchUsageAnalytics(30); setData(res.data); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.center}><Text>Unable to load analytics</Text></SafeAreaView>;

  const t = data.totals || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Text style={styles.h1}>AI Tutor — Usage (last {data.days}d)</Text>
        <View style={styles.grid}>
          <Stat label="Queries"        value={t.queries} />
          <Stat label="Total tokens"   value={t.total_tokens} />
          <Stat label="Blocked quota"  value={t.blocked_quota} />
          <Stat label="Blocked scope"  value={t.blocked_scope} />
          <Stat label="Blocked rate"   value={t.blocked_rate} />
          <Stat label="No context"     value={t.no_context} />
          <Stat label="Avg latency ms" value={t.avg_latency_ms} />
        </View>

        <Text style={styles.h2}>Daily queries</Text>
        {(data.series || []).map((p) => (
          <View key={p.day} style={styles.rowLine}>
            <Text style={styles.day}>{p.day}</Text>
            <View style={[styles.bar, { width: Math.min(280, p.count * 8 + 6) }]} />
            <Text style={styles.count}>{p.count}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value ?? 0}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  h2: { fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10 },
  statLabel: { color: '#6B7280', fontSize: 12 },
  statValue: { color: '#111827', fontSize: 18, fontWeight: '700', marginTop: 2 },
  rowLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  day: { width: 90, color: '#374151', fontSize: 12 },
  bar: { height: 10, backgroundColor: '#2563EB', borderRadius: 4, marginHorizontal: 6 },
  count: { color: '#374151', fontSize: 12 },
});
