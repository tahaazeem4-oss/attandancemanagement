// frontend/src/features/aiTutor/screens/AdminAiPolicyScreen.js
// Manage feature flag + quota policy at any scope (organization/campus/class/section/student).
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setFeatureFlag, setQuotaPolicy, listFeatureFlags, listQuotaPolicies, fetchAiTutorHealth } from '../api/aiTutorApi';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const SCOPES = ['global','organization','campus','class','section','student'];

export default function AdminAiPolicyScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const canBulk = role === 'super_admin' || role === 'org_admin';

  const [scopeType, setScopeType] = useState('campus');
  const [scopeId, setScopeId] = useState('');
  const [enabled, setEnabled] = useState(true);

  const [dailyRequests, setDailyRequests] = useState('');
  const [weeklyRequests, setWeeklyRequests] = useState('');
  const [monthlyRequests, setMonthlyRequests] = useState('');
  const [dailyTokens, setDailyTokens] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [maxOutput, setMaxOutput] = useState('');

  const [flags, setFlags] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [health, setHealth] = useState(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const refresh = async () => {
    try {
      const f = await listFeatureFlags();
      const p = await listQuotaPolicies();
      setFlags(f.data?.flags || []);
      setPolicies(p.data?.policies || []);
    } catch (_) { /* ignore */ }
    try {
      const h = await fetchAiTutorHealth();
      setHealth(h.data || null);
    } catch (_) { setHealth(null); }
  };
  useEffect(() => { refresh(); }, []);

  const numOrNull = (s) => s === '' ? null : Number(s);

  const saveFlag = async () => {
    try {
      await setFeatureFlag({
        scope_type: scopeType,
        scope_id: scopeType === 'global' ? null : Number(scopeId),
        is_enabled: enabled,
      });
      Alert.alert('Saved', 'Feature flag updated');
      refresh();
    } catch (e) { Alert.alert('Error', e?.response?.data?.message || 'Save failed'); }
  };

  const savePolicy = async () => {
    try {
      await setQuotaPolicy({
        scope_type: scopeType,
        scope_id: scopeType === 'global' ? null : Number(scopeId),
        daily_requests: numOrNull(dailyRequests),
        weekly_requests: numOrNull(weeklyRequests),
        monthly_requests: numOrNull(monthlyRequests),
        daily_tokens: numOrNull(dailyTokens),
        max_input_tokens: numOrNull(maxInput),
        max_output_tokens: numOrNull(maxOutput),
      });
      Alert.alert('Saved', 'Quota policy updated');
      refresh();
    } catch (e) { Alert.alert('Error', e?.response?.data?.message || 'Save failed'); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Text style={styles.h1}>AI Tutor — Policies</Text>

        <View style={[styles.card, styles.healthCard]}>
          <Text style={styles.label}>Health</Text>
          {!health ? (
            <Text style={styles.subtle}>Loading…</Text>
          ) : (
            <>
              <Text style={[styles.line, !health.openai_key_set && styles.lineBad]}>
                {health.openai_key_set ? '✓' : '✕'} OPENAI_API_KEY {health.openai_key_set ? 'configured' : 'NOT set — ingestion and chat will fail'}
              </Text>
              <Text style={styles.line}>
                {health.cron_secret_set ? '✓' : '✕'} AI_TUTOR_CRON_SECRET {health.cron_secret_set ? 'configured' : 'not set (optional)'}
              </Text>
              <Text style={styles.line}>Pending jobs: {health.pending_jobs}</Text>
              <Text style={[styles.line, (health.failed_jobs_last_24h > 0) && styles.lineBad]}>
                Failed jobs (24h): {health.failed_jobs_last_24h}
              </Text>
              <Text style={styles.line}>Ready documents: {health.ready_documents}</Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Scope</Text>
          <View style={styles.scopeRow}>
            {SCOPES.map((s) => (
              <TouchableOpacity key={s} onPress={() => setScopeType(s)} style={[styles.chip, scopeType === s && styles.chipOn]}>
                <Text style={[styles.chipText, scopeType === s && styles.chipTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {scopeType !== 'global' && (
            <TextInput style={styles.input} placeholder={`${scopeType} ID`} value={scopeId} onChangeText={setScopeId} keyboardType="numeric" />
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Enabled</Text>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>
          <TouchableOpacity style={styles.btn} onPress={saveFlag}><Text style={styles.btnText}>Save feature flag</Text></TouchableOpacity>
          {canBulk && (
            <TouchableOpacity style={[styles.btnSecondary, bulkRunning && styles.btnDisabled]} disabled={bulkRunning} onPress={applyFlagToAllCampuses}>
              <Text style={styles.btnSecondaryText}>{bulkRunning ? 'Working…' : `Apply ${enabled ? 'ON' : 'OFF'} to all campuses`}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Quota limits (blank = unlimited at this scope)</Text>
          <TextInput style={styles.input} placeholder="Daily requests"   value={dailyRequests}   onChangeText={setDailyRequests}   keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Weekly requests"  value={weeklyRequests}  onChangeText={setWeeklyRequests}  keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Monthly requests" value={monthlyRequests} onChangeText={setMonthlyRequests} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Daily tokens"     value={dailyTokens}     onChangeText={setDailyTokens}     keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Max input tokens"  value={maxInput}  onChangeText={setMaxInput}  keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Max output tokens" value={maxOutput} onChangeText={setMaxOutput} keyboardType="numeric" />
          <TouchableOpacity style={styles.btn} onPress={savePolicy}><Text style={styles.btnText}>Save quota policy</Text></TouchableOpacity>
          {canBulk && (
            <TouchableOpacity style={[styles.btnSecondary, bulkRunning && styles.btnDisabled]} disabled={bulkRunning} onPress={applyPolicyToAllCampuses}>
              <Text style={styles.btnSecondaryText}>{bulkRunning ? 'Working…' : 'Apply this policy to all campuses'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.h2}>Existing flags</Text>
        {flags.map((f) => (
          <Text key={f.id} style={styles.line}>{f.scope_type}{f.scope_id ? `#${f.scope_id}` : ''} → {f.is_enabled ? 'ON' : 'OFF'}</Text>
        ))}

        <Text style={styles.h2}>Existing policies</Text>
        {policies.map((p) => (
          <Text key={p.id} style={styles.line}>
            {p.scope_type}{p.scope_id ? `#${p.scope_id}` : ''} → D{p.daily_requests ?? '∞'}/W{p.weekly_requests ?? '∞'}/M{p.monthly_requests ?? '∞'}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  h2: { fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  card: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginBottom: 12, gap: 8 },
  label: { fontWeight: '600', color: '#374151' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#E5E7EB' },
  chipOn: { backgroundColor: '#2563EB' },
  chipText: { color: '#374151', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btn: { backgroundColor: '#2563EB', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnSecondary: { backgroundColor: '#E0E7FF', padding: 10, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  btnSecondaryText: { color: '#3730A3', fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  healthCard: { backgroundColor: '#F1F5F9' },
  lineBad: { color: '#B91C1C', fontWeight: '700' },
  line: { color: '#374151', paddingVertical: 2 },
});
