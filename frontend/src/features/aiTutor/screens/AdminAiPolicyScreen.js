// frontend/src/features/aiTutor/screens/AdminAiPolicyScreen.js
// System-wide defaults editor. This is the ONLY thing the legacy "advanced"
// route does now: set the global feature flag + global quota policy that
// every other scope inherits from. Per-org / per-campus / per-class /
// per-section / per-student work happens on AdminAiPolicy (hierarchy nav).
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, ScrollView, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenIntroCard from '../../../components/ScreenIntroCard';
import { useFocusEffect } from '@react-navigation/native';
import { C, S } from '../../../config/theme';
import {
  setFeatureFlag, setQuotaPolicy, deleteScopeConfig,
  fetchAiTutorHealth, fetchPolicySummary,
  fetchProviderStatus, syncProviderQuota,
} from '../api/aiTutorApi';
import { useAuth } from '../../../context/AuthContext';

const FIELD_GROUPS = [
  {
    title: 'Request pools',
    description: 'Shared request capacity that inherited branches divide across active students.',
    fields: [
      { key: 'daily_requests', label: 'Requests / day' },
      { key: 'weekly_requests', label: 'Requests / week' },
      { key: 'monthly_requests', label: 'Requests / month' },
    ],
  },
  {
    title: 'Token pools',
    description: 'Shared token budgets used for scalable pool distribution.',
    fields: [
      { key: 'daily_tokens', label: 'Tokens / day' },
      { key: 'weekly_tokens', label: 'Tokens / week' },
      { key: 'monthly_tokens', label: 'Tokens / month' },
    ],
  },
  {
    title: 'Per-request caps',
    description: 'Hard limits for a single prompt/response. These do not scale down the tree.',
    fields: [
      { key: 'max_input_tokens', label: 'Max input tokens / request' },
      { key: 'max_output_tokens', label: 'Max output tokens / request' },
    ],
  },
];

const FIELDS = FIELD_GROUPS.flatMap((group) => group.fields);

export default function AdminAiPolicyScreen({ navigation }) {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [values, setValues] = useState({});
  const [health, setHealth] = useState(null);
  const [provider, setProvider] = useState(null);
  const [refreshingProvider, setRefreshingProvider] = useState(false);
  const [autoSyncProvider, setAutoSyncProvider] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h, p] = await Promise.all([
        fetchPolicySummary(),
        fetchAiTutorHealth().catch(() => ({ data: null })),
        fetchProviderStatus().catch(() => ({ data: null })),
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
      setProvider(p.data || null);
    } catch (e) {
      // ignore — leave defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onChange = (k, v) => setValues((p) => ({ ...p, [k]: v.replace(/[^0-9]/g, '') }));

  const refreshProvider = async () => {
    setRefreshingProvider(true);
    try {
      const [h, p] = await Promise.all([
        fetchAiTutorHealth().catch(() => ({ data: null })),
        fetchProviderStatus().catch(() => ({ data: null })),
      ]);
      setHealth(h.data || null);
      setProvider(p.data || null);
    } catch (e) {
      Alert.alert("Couldn't refresh", e?.response?.data?.message || e?.message || 'Please try again.');
    } finally {
      setRefreshingProvider(false);
    }
  };

  const save = async () => {
    if (!isSuper) return;
    setSaving(true);
    try {
      // 1. Feature flag (global is always set — never inherits).
      await setFeatureFlag({ scope_type: 'global', scope_id: null, is_enabled: enabled });

      if (autoSyncProvider) {
        await syncProviderQuota({ reset_counters: false });
      } else {
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
      }

      Alert.alert(
        'Saved',
        autoSyncProvider
          ? 'System-wide AI Tutor defaults updated and quotas synced from the active provider key.'
          : 'System-wide AI Tutor defaults updated.',
      );
      await load();
    } catch (e) {
      Alert.alert("Couldn't save", e?.response?.data?.message || e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isSuper) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <ScreenIntroCard
          title="AI Tutor System Defaults"
          description="Control the global AI Tutor switch and the default quota pools that inherited branches follow across the platform."
          icon="shield-checkmark-outline"
          tone="violet"
        />
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
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color="#2563eb" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <ScreenIntroCard
            title="AI Tutor System Defaults"
            description="Set the global AI Tutor status and root quota pools here. Branches on Inherit resolve from these values after you save."
            icon="shield-checkmark-outline"
            tone="violet"
          />

          <Text style={styles.lead}>
            This screen defines the global default. Every organization, campus, class,
            section, and student set to Inherit resolves from here.
          </Text>

          {(provider || health) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>LLM and key status</Text>
                <TouchableOpacity
                  style={[styles.ghostBtn, refreshingProvider && { opacity: 0.6 }]}
                  disabled={refreshingProvider}
                  onPress={refreshProvider}
                >
                  {refreshingProvider
                    ? <ActivityIndicator size="small" color="#2563eb" />
                    : <Text style={styles.ghostBtnText}>Refresh</Text>}
                </TouchableOpacity>
              </View>

              {provider && (
                <>
                  <View style={styles.healthRow}>
                    <StatusPill info label={`Provider: ${provider.provider || 'none'}`} />
                    <StatusPill info label={`Model: ${provider.chat_model || '—'}`} />
                    <StatusPill
                      ok={provider.retrieval_mode === 'vector'}
                      warn={provider.retrieval_mode !== 'vector'}
                      label={`Retrieval: ${provider.retrieval_mode || '—'}`}
                    />
                  </View>

                  {provider.key && !provider.key.error && (
                    <View style={{ marginTop: 4 }}>
                      {provider.key.label && (
                        <Text style={styles.kv}>Key label: <Text style={styles.kvVal}>{provider.key.label}</Text></Text>
                      )}
                      {provider.key.limit_usd !== null && (
                        <Text style={styles.kv}>
                          Credits: <Text style={styles.kvVal}>
                            ${Number(provider.key.usage_usd || 0).toFixed(4)} used / ${Number(provider.key.limit_usd).toFixed(2)} total
                            {provider.key.remaining_usd !== null
                              ? `  (${'$' + Number(provider.key.remaining_usd).toFixed(4)} left)`
                              : ''}
                          </Text>
                        </Text>
                      )}
                      {provider.key.limit_usd === null && (
                        <Text style={styles.kv}>Credits: <Text style={styles.kvVal}>unlimited / free model</Text></Text>
                      )}
                      {provider.key.rate_limit && (
                        <Text style={styles.kv}>
                          Rate limit: <Text style={styles.kvVal}>
                            {provider.key.rate_limit.requests} req / {provider.key.rate_limit.interval}
                          </Text>
                        </Text>
                      )}
                      {provider.key.is_free_tier && (
                        <Text style={[styles.kv, { color: '#92400e' }]}>Free tier key detected.</Text>
                      )}
                    </View>
                  )}

                  {provider.key?.error && (
                    <Text style={[styles.kv, { color: '#991b1b', marginTop: 6 }]}>
                      Provider error: {String(provider.key.error)}
                    </Text>
                  )}
                </>
              )}

              {health && (
                <View style={styles.healthRow}>
                  <StatusPill ok={!!health.openai_key_set} label="Embedding key" />
                  <StatusPill ok={!!health.cron_secret_set} label="Cron secret" />
                  <StatusPill info label={`${health.ready_documents ?? 0} ready docs`} />
                  {Number(health.failed_jobs_last_24h || 0) > 0 && (
                    <StatusPill warn label={`${health.failed_jobs_last_24h} failed jobs`} />
                  )}
                </View>
              )}

              <View style={styles.inlineSwitchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.inlineSwitchTitle}>Auto-sync quotas from active key on save</Text>
                  <Text style={styles.cardSubtle}>
                    If provider limits changed, saving this screen can pull the latest limits from the configured backend key and apply them automatically.
                  </Text>
                </View>
                <Switch
                  value={autoSyncProvider}
                  onValueChange={setAutoSyncProvider}
                  trackColor={{ true: '#34d399', false: '#cbd5e1' }}
                  thumbColor="#fff"
                />
              </View>

              <Text style={styles.providerNote}>
                This screen can refresh details and sync quotas from the active backend key. Replacing the secret value itself is not wired from the app yet.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Master switch</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ true: '#34d399', false: '#cbd5e1' }}
                thumbColor="#fff"
              />
            </View>
            <Text style={styles.cardSubtle}>
              {enabled
                ? 'After save, every scope set to Inherit resolves ON from the global default.'
                : 'After save, every scope set to Inherit resolves OFF from the global default.'}
            </Text>
            <View style={styles.inheritBox}>
              <Text style={styles.inheritTitle}>Inherited result</Text>
              <Text style={styles.inheritText}>
                Global is {enabled ? 'ON' : 'OFF'} now in this draft. Organizations, campuses, classes,
                sections, and students with no explicit flag will follow this state after you save.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Scalable defaults</Text>
            <Text style={styles.cardSubtle}>
              Set only the root pools and caps here. Child levels should usually stay on Inherit and only override when architecture requires it.
            </Text>
          </View>

          {FIELD_GROUPS.map((group) => (
            <View key={group.title} style={styles.card}>
              <Text style={styles.cardTitle}>{group.title}</Text>
              <Text style={styles.cardSubtle}>{group.description}</Text>
              {group.fields.map((f) => (
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
          ))}

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
            Save here first, then use the hierarchy navigator only for exceptions.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 12, color: C.textMed, marginBottom: 14, lineHeight: 18, paddingHorizontal: 2 },
  card: {
    ...S.card,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  healthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.textDark },
  cardSubtle: { fontSize: 12, color: C.textMed, marginTop: 6, lineHeight: 18 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: C.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 78,
    alignItems: 'center',
  },
  ghostBtnText: { color: C.primary, fontWeight: '800', fontSize: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginRight: 6, marginBottom: 6 },
  pillText: { fontSize: 11, fontWeight: '700' },
  kv: { fontSize: 12, color: C.textMed, marginTop: 6, lineHeight: 18 },
  kvVal: { color: C.textDark, fontWeight: '700' },
  inlineSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  inlineSwitchTitle: { fontSize: 13, fontWeight: '700', color: C.textDark },
  providerNote: { fontSize: 12, color: C.textMed, marginTop: 12, lineHeight: 18 },
  inheritBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: C.primaryLight,
    padding: 12,
  },
  inheritTitle: { fontSize: 12, fontWeight: '700', color: C.primaryDark },
  inheritText: { fontSize: 12, color: '#1e3a8a', lineHeight: 18, marginTop: 5 },
  field: { marginTop: 14 },
  fieldLabel: { ...S.label, marginBottom: 8 },
  input: { ...S.input, marginBottom: 0 },
  primaryBtn: {
    ...S.btn,
    marginTop: 6,
  },
  primaryBtnText: { ...S.btnText },
  secondaryBtn: {
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1',
  },
  secondaryBtnText: { color: C.textDark, fontWeight: '700', fontSize: 13 },
  footer: { textAlign: 'center', color: C.textMed, fontSize: 12, marginTop: 16, lineHeight: 18, paddingHorizontal: 10 },
  gateCard: {
    ...S.card,
    margin: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  gateTitle: { fontSize: 15, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  gateText: { fontSize: 12, color: C.textMed, lineHeight: 18, marginBottom: 14 },
});

function StatusPill({ ok, warn, info, label }) {
  const bg = warn ? '#fef3c7' : info ? '#dbeafe' : ok ? '#dcfce7' : '#fee2e2';
  const fg = warn ? '#92400e' : info ? '#1e3a8a' : ok ? '#166534' : '#991b1b';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}
