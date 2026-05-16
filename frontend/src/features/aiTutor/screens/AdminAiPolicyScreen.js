// frontend/src/features/aiTutor/screens/AdminAiPolicyScreen.js
// System-wide defaults editor. This is the ONLY thing the legacy "advanced"
// route does now: set the global feature flag + global quota policy that
// every other scope inherits from. Per-org / per-campus / per-class /
// per-section / per-student work happens on AdminAiPolicy (hierarchy nav).
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, ScrollView, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  setFeatureFlag, setQuotaPolicy, deleteScopeConfig,
  fetchAiTutorHealth, fetchPolicySummary,
} from '../api/aiTutorApi';
import { useAuth } from '../../../context/AuthContext';

const FIELDS = [
  { key: 'daily_requests',    label: 'Requests / day' },
  { key: 'weekly_requests',   label: 'Requests / week' },
  { key: 'monthly_requests',  label: 'Requests / month' },
  { key: 'daily_tokens',      label: 'Tokens / day' },
  { key: 'weekly_tokens',     label: 'Tokens / week' },
  { key: 'monthly_tokens',    label: 'Tokens / month' },
  { key: 'max_input_tokens',  label: 'Max input tokens / request' },
  { key: 'max_output_tokens', label: 'Max output tokens / request' },
];

export default function AdminAiPolicyScreen({ navigation }) {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [values, setValues] = useState({});
  const [health, setHealth] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        fetchPolicySummary(),
        fetchAiTutorHealth().catch(() => ({ data: null })),
      ]);
      const rows = s.data?.rows || [];
      const globalRow = rows.find((r) => r.scope_type === 'global');
      if (globalRow) {
        setEnabled(globalRow.is_enabled !== false);
        const next = {};
        FIELDS.forEach((f) => {
          const v = globalRow[f.key];
          next[f.key] = v === null || v === undefined ? '' : String(v);
        });
        setValues(next);
      }
      setHealth(h.data || null);
    } catch (e) {
      // ignore — leave defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onChange = (k, v) => setValues((p) => ({ ...p, [k]: v.replace(/[^0-9]/g, '') }));

  const save = async () => {
    if (!isSuper) return;
    setSaving(true);
    try {
      // 1. Feature flag (global is always set — never inherits).
      await setFeatureFlag({ scope_type: 'global', scope_id: null, is_enabled: enabled });

      // 2. Quota: if any field has a value, upsert; otherwise clear policy entirely.
      const body = { scope_type: 'global', scope_id: null };
      let any = false;
      FIELDS.forEach((f) => {
        const raw = values[f.key];
        if (raw && raw.trim() !== '') {
          const n = Number(raw);
          if (!Number.isNaN(n)) { body[f.key] = n; any = true; }
        }
      });
      if (any) {
        await setQuotaPolicy(body);
      } else {
        await deleteScopeConfig('global', null, 'policy');
      }

      Alert.alert('Saved', 'System-wide AI Tutor defaults updated.');
      await load();
    } catch (e) {
      Alert.alert("Couldn't save", e?.response?.data?.message || e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isSuper) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
          <Text style={styles.title}>System defaults</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Super admin only</Text>
          <Text style={styles.gateText}>
            System-wide defaults can only be edited by a super admin. Use the
            hierarchy navigator to manage AI Tutor for your organization,
            campuses, classes, sections, or individual students.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.primaryBtnText}>Back to navigator</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>System defaults</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color="#2563eb" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={styles.lead}>
            These are the system-wide AI Tutor defaults. Everyone inherits from here
            unless an organization, campus, class, section, or student has its own
            override. Use the hierarchy navigator for those.
          </Text>

          {/* Health pill */}
          {health && (
            <View style={styles.healthRow}>
              <HealthPill ok={!!health.openai_key_set}    label="OpenAI key" />
              <HealthPill ok={!!health.cron_secret_set}   label="Cron secret" />
              <HealthPill info label={`${health.ready_documents ?? 0} ready docs`} />
              {Number(health.failed_jobs_last_24h || 0) > 0 && (
                <HealthPill warn label={`${health.failed_jobs_last_24h} failed jobs`} />
              )}
            </View>
          )}

          {/* Master switch */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>AI Tutor — master switch</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ true: '#34d399', false: '#cbd5e1' }}
                thumbColor="#fff"
              />
            </View>
            <Text style={styles.cardSubtle}>
              {enabled
                ? 'AI Tutor is ON for everyone (unless a specific override turns it off).'
                : 'AI Tutor is OFF for everyone (unless a specific override turns it on).'}
            </Text>
          </View>

          {/* Quota fields */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Default quotas</Text>
            <Text style={styles.cardSubtle}>
              These pools are split pro-rata across every AI-enabled student in the system
              (unless an organization, campus, class, section, or student has its own override).
              Leave a field blank for "no limit" at the global level.
            </Text>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="No limit"
                  placeholderTextColor="#9ca3af"
                  value={values[f.key] ?? ''}
                  onChangeText={(v) => onChange(f.key, v)}
                />
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={save}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Save system defaults</Text>}
          </TouchableOpacity>

          <Text style={styles.footer}>
            For per-organization, per-campus, per-class, per-section, or per-student
            overrides, go back and use the AI Tutor navigator.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HealthPill({ ok, warn, info, label }) {
  const bg = warn ? '#fef3c7' : info ? '#dbeafe' : ok ? '#dcfce7' : '#fee2e2';
  const fg = warn ? '#92400e' : info ? '#1e3a8a' : ok ? '#166534' : '#991b1b';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  back: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 13, color: '#475569', marginBottom: 12, lineHeight: 18 },
  healthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginRight: 6, marginBottom: 6 },
  pillText: { fontSize: 11, fontWeight: '600' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  cardSubtle: { fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 17 },
  field: { marginTop: 12 },
  fieldLabel: { fontSize: 12, color: '#475569', marginBottom: 6, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a',
  },
  primaryBtn: {
    backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footer: { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 16, lineHeight: 17 },
  gateCard: {
    margin: 16, padding: 20, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  gateTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  gateText: { fontSize: 13, color: '#475569', lineHeight: 19, marginBottom: 14 },
});
