// frontend/src/features/aiTutor/screens/AdminAiPolicyScreen.js
// Manage AI Tutor feature flag + quota policy at any scope using human-readable pickers.
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, ScrollView, StyleSheet, Alert,
  Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  setFeatureFlag, setQuotaPolicy,
  fetchAiTutorHealth, fetchScopeOptions, fetchPolicySummary,
} from '../api/aiTutorApi';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const SCOPE_META = {
  global:       { label: 'Everyone (global default)', help: 'Applies to every user in the system unless a narrower rule overrides it.' },
  organization: { label: 'Whole organization',         help: 'Pick the organization. Applies to all its campuses, classes and students.' },
  campus:       { label: 'One campus (school)',        help: 'Pick a campus. Applies to everyone in that campus.' },
  class:        { label: 'One class',                  help: 'Pick the campus, then the class. Applies to all sections/students in it.' },
  section:      { label: 'One section',                help: 'Pick the campus, class, then section.' },
  student:      { label: 'A single student',           help: 'Pick campus → class → section → student.' },
};

const SCOPE_ORDER = ['global', 'organization', 'campus', 'class', 'section', 'student'];

export default function AdminAiPolicyScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const canBulk = role === 'super_admin' || role === 'org_admin';

  // Scope state ──────────────────────────────────────────────
  const [scopeType, setScopeType] = useState('campus');
  const [picked, setPicked] = useState({
    organization: null,  // { id, name }
    campus: null,
    class: null,
    section: null,
    student: null,
  });

  // Flag / quota inputs ──────────────────────────────────────
  const [enabled, setEnabled] = useState(true);
  const [dailyRequests, setDailyRequests] = useState('');
  const [weeklyRequests, setWeeklyRequests] = useState('');
  const [monthlyRequests, setMonthlyRequests] = useState('');
  const [dailyTokens, setDailyTokens] = useState('');
  const [weeklyTokens, setWeeklyTokens] = useState('');
  const [monthlyTokens, setMonthlyTokens] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [maxOutput, setMaxOutput] = useState('');

  // Lists ────────────────────────────────────────────────────
  const [summary, setSummary] = useState([]);
  const [summaryFilter, setSummaryFilter] = useState('');
  const [health, setHealth] = useState(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const refresh = async () => {
    try {
      const s = await fetchPolicySummary();
      setSummary(s.data?.rows || []);
    } catch (_) { /* ignore */ }
    try {
      const h = await fetchAiTutorHealth();
      setHealth(h.data || null);
    } catch (_) { setHealth(null); }
  };
  useEffect(() => { refresh(); }, []);

  const numOrNull = (s) => s === '' ? null : Number(s);

  // Resolve the chosen scope_id from the cascading picks ─────
  const currentScopeId = useMemo(() => {
    if (scopeType === 'global')       return null;
    if (scopeType === 'organization') return picked.organization?.id || null;
    if (scopeType === 'campus')       return picked.campus?.id || null;
    if (scopeType === 'class')        return picked.class?.id || null;
    if (scopeType === 'section')      return picked.section?.id || null;
    if (scopeType === 'student')      return picked.student?.id || null;
    return null;
  }, [scopeType, picked]);

  const currentScopeLabel = useMemo(() => {
    if (scopeType === 'global') return 'Everyone (global default)';
    const order = ['organization', 'campus', 'class', 'section', 'student'];
    const idx = order.indexOf(scopeType);
    if (idx < 0) return '';
    const parts = order.slice(0, idx + 1).map((k) => picked[k]?.name).filter(Boolean);
    return parts.length ? parts.join(' › ') : '';
  }, [scopeType, picked]);

  const scopeReady = scopeType === 'global' || !!currentScopeId;

  const saveFlag = async () => {
    if (!scopeReady) { Alert.alert('Pick a scope', 'Please select the target first.'); return; }
    try {
      await setFeatureFlag({
        scope_type: scopeType,
        scope_id: scopeType === 'global' ? null : currentScopeId,
        is_enabled: enabled,
      });
      Alert.alert('Saved', `AI Tutor turned ${enabled ? 'ON' : 'OFF'} for ${currentScopeLabel}.`);
      refresh();
    } catch (e) { Alert.alert('Error', e?.response?.data?.message || 'Save failed'); }
  };

  const savePolicy = async () => {
    if (!scopeReady) { Alert.alert('Pick a scope', 'Please select the target first.'); return; }
    try {
      await setQuotaPolicy({
        scope_type: scopeType,
        scope_id: scopeType === 'global' ? null : currentScopeId,
        daily_requests: numOrNull(dailyRequests),
        weekly_requests: numOrNull(weeklyRequests),
        monthly_requests: numOrNull(monthlyRequests),
        daily_tokens: numOrNull(dailyTokens),
        weekly_tokens: numOrNull(weeklyTokens),
        monthly_tokens: numOrNull(monthlyTokens),
        max_input_tokens: numOrNull(maxInput),
        max_output_tokens: numOrNull(maxOutput),
      });
      Alert.alert('Saved', `Token & request limits updated for ${currentScopeLabel}.`);
      refresh();
    } catch (e) { Alert.alert('Error', e?.response?.data?.message || 'Save failed'); }
  };

  const fetchCampusIds = async () => {
    if (role === 'super_admin') {
      const { data } = await api.get('/schools');
      return (Array.isArray(data) ? data : []).map((s) => Number(s.id)).filter(Boolean);
    }
    if (role === 'org_admin') {
      const { data } = await api.get('/org-admin/campuses');
      const list = Array.isArray(data) ? data : (data?.campuses || []);
      return list.map((s) => Number(s.id)).filter(Boolean);
    }
    return [];
  };

  const applyPolicyToAllCampuses = async () => {
    if (!canBulk) return;
    Alert.alert('Apply to all campuses?', 'This will overwrite the current quota policy on every campus you manage.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apply', style: 'destructive', onPress: async () => {
        setBulkRunning(true);
        try {
          const ids = await fetchCampusIds();
          if (!ids.length) { Alert.alert('Nothing to do', 'No campuses found.'); return; }
          let ok = 0, fail = 0;
          const body = {
            daily_requests: numOrNull(dailyRequests),
            weekly_requests: numOrNull(weeklyRequests),
            monthly_requests: numOrNull(monthlyRequests),
            daily_tokens: numOrNull(dailyTokens),
            weekly_tokens: numOrNull(weeklyTokens),
            monthly_tokens: numOrNull(monthlyTokens),
            max_input_tokens: numOrNull(maxInput),
            max_output_tokens: numOrNull(maxOutput),
          };
          for (const id of ids) {
            try { await setQuotaPolicy({ scope_type: 'campus', scope_id: id, ...body }); ok += 1; }
            catch (_) { fail += 1; }
          }
          Alert.alert('Done', `Applied to ${ok} of ${ids.length} campus(es)${fail ? ` · ${fail} failed` : ''}.`);
          refresh();
        } finally { setBulkRunning(false); }
      } },
    ]);
  };

  const applyFlagToAllCampuses = async () => {
    if (!canBulk) return;
    Alert.alert(`Turn AI Tutor ${enabled ? 'ON' : 'OFF'} for all campuses?`, 'This overwrites the current feature flag for every campus you manage.', [
      { text: 'Cancel', style: 'cancel' },
      { text: enabled ? 'Enable all' : 'Disable all', style: 'destructive', onPress: async () => {
        setBulkRunning(true);
        try {
          const ids = await fetchCampusIds();
          if (!ids.length) { Alert.alert('Nothing to do', 'No campuses found.'); return; }
          let ok = 0, fail = 0;
          for (const id of ids) {
            try { await setFeatureFlag({ scope_type: 'campus', scope_id: id, is_enabled: enabled }); ok += 1; }
            catch (_) { fail += 1; }
          }
          Alert.alert('Done', `Applied to ${ok} of ${ids.length} campus(es)${fail ? ` · ${fail} failed` : ''}.`);
          refresh();
        } finally { setBulkRunning(false); }
      } },
    ]);
  };

  // Which pickers to show for the chosen scope ──────────────
  const pickersForScope = () => {
    if (scopeType === 'global')       return [];
    if (scopeType === 'organization') return ['organization'];
    if (scopeType === 'campus')       return role === 'super_admin' ? ['organization', 'campus'] : ['campus'];
    if (scopeType === 'class')        return role === 'super_admin' ? ['organization', 'campus', 'class'] : ['campus', 'class'];
    if (scopeType === 'section')      return role === 'super_admin' ? ['organization', 'campus', 'class', 'section'] : ['campus', 'class', 'section'];
    if (scopeType === 'student')      return role === 'super_admin' ? ['organization', 'campus', 'class', 'section', 'student'] : ['campus', 'class', 'section', 'student'];
    return [];
  };

  const onPickerOpen = (kind) => {
    setPickerKind(kind);
    setPickerVisible(true);
  };

  const onPicked = (kind, item) => {
    setPicked((prev) => {
      const next = { ...prev, [kind]: item };
      // reset deeper picks when an upstream pick changes
      const chain = ['organization', 'campus', 'class', 'section', 'student'];
      const idx = chain.indexOf(kind);
      for (let i = idx + 1; i < chain.length; i += 1) next[chain[i]] = null;
      return next;
    });
    setPickerVisible(false);
  };

  const [pickerKind, setPickerKind] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Filtered summary list ──────────────────────────────────
  const filteredSummary = useMemo(() => {
    const q = summaryFilter.trim().toLowerCase();
    if (!q) return summary;
    return summary.filter((r) => String(r.scope_name || '').toLowerCase().includes(q));
  }, [summaryFilter, summary]);

  const fmt = (v) => (v === null || v === undefined) ? '∞' : Number(v).toLocaleString();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Text style={styles.h1}>AI Tutor — Policies & Token Limits</Text>
        <Text style={styles.helpTop}>
          Choose who you want to configure, then pick how many AI Tutor requests / tokens they can use.
          Lower-level rules (e.g. a single student) override higher ones (e.g. the whole campus).
        </Text>

        {/* Health card */}
        <View style={[styles.card, styles.healthCard]}>
          <Text style={styles.label}>System health</Text>
          {!health ? (
            <Text style={styles.subtle}>Loading…</Text>
          ) : (
            <>
              <Text style={[styles.line, !health.openai_key_set && styles.lineBad]}>
                {health.openai_key_set ? '✓' : '✕'} OPENAI_API_KEY {health.openai_key_set ? 'configured' : 'NOT set — chat & ingestion will fail'}
              </Text>
              <Text style={styles.line}>
                {health.cron_secret_set ? '✓' : '✕'} AI_TUTOR_CRON_SECRET {health.cron_secret_set ? 'configured' : 'not set (optional, used by cron)'}
              </Text>
              <Text style={styles.line}>Pending ingestion jobs: {health.pending_jobs}</Text>
              <Text style={[styles.line, (health.failed_jobs_last_24h > 0) && styles.lineBad]}>
                Failed jobs (last 24h): {health.failed_jobs_last_24h}
              </Text>
              <Text style={styles.line}>Documents ready for chat: {health.ready_documents}</Text>
            </>
          )}
        </View>

        {/* Scope selection */}
        <View style={styles.card}>
          <Text style={styles.label}>Who does this rule apply to?</Text>
          <View style={styles.scopeRow}>
            {SCOPE_ORDER.map((s) => {
              // hide scopes a role can't manage
              if (s === 'organization' && role !== 'super_admin') return null;
              if (s === 'global' && role !== 'super_admin') return null;
              return (
                <TouchableOpacity key={s} onPress={() => setScopeType(s)} style={[styles.chip, scopeType === s && styles.chipOn]}>
                  <Text style={[styles.chipText, scopeType === s && styles.chipTextOn]}>{SCOPE_META[s].label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.helpInline}>{SCOPE_META[scopeType].help}</Text>

          {/* Cascading pickers */}
          {pickersForScope().map((kind) => (
            <PickerRow
              key={kind}
              kind={kind}
              picked={picked[kind]}
              disabled={
                (kind === 'campus' && role === 'super_admin' && !picked.organization) ||
                (kind === 'class' && !picked.campus) ||
                (kind === 'section' && !picked.class) ||
                (kind === 'student' && !picked.section)
              }
              onPress={() => onPickerOpen(kind)}
            />
          ))}

          {scopeReady && scopeType !== 'global' && (
            <Text style={styles.scopePreview}>Target: <Text style={{ fontWeight: '700' }}>{currentScopeLabel}</Text></Text>
          )}
        </View>

        {/* Feature flag */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Enable AI Tutor</Text>
              <Text style={styles.helpInline}>
                When ON, users in the selected scope can see and use the AI Tutor. When OFF, it is hidden and blocked for them.
              </Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>
          <TouchableOpacity style={[styles.btn, !scopeReady && styles.btnDisabled]} disabled={!scopeReady} onPress={saveFlag}>
            <Text style={styles.btnText}>Save · turn {enabled ? 'ON' : 'OFF'} for {scopeType === 'global' ? 'everyone' : (currentScopeLabel || 'selected target')}</Text>
          </TouchableOpacity>
          {canBulk && (
            <TouchableOpacity style={[styles.btnSecondary, bulkRunning && styles.btnDisabled]} disabled={bulkRunning} onPress={applyFlagToAllCampuses}>
              <Text style={styles.btnSecondaryText}>{bulkRunning ? 'Working…' : `Shortcut: apply ${enabled ? 'ON' : 'OFF'} to every campus I manage`}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quota policy */}
        <View style={styles.card}>
          <Text style={styles.label}>Usage limits</Text>
          <Text style={styles.helpInline}>
            Leave a field blank to inherit from a higher level (e.g. organization or global). Tokens ≈ words of input + output processed by AI.
          </Text>
          <Row2>
            <Field label="Requests / day"   value={dailyRequests}   onChange={setDailyRequests} />
            <Field label="Requests / week"  value={weeklyRequests}  onChange={setWeeklyRequests} />
          </Row2>
          <Row2>
            <Field label="Requests / month" value={monthlyRequests} onChange={setMonthlyRequests} />
            <Field label="Tokens / day"     value={dailyTokens}     onChange={setDailyTokens} />
          </Row2>
          <Row2>
            <Field label="Tokens / week"    value={weeklyTokens}    onChange={setWeeklyTokens} />
            <Field label="Tokens / month"   value={monthlyTokens}   onChange={setMonthlyTokens} />
          </Row2>
          <Row2>
            <Field label="Max input tokens (per question)"  value={maxInput}  onChange={setMaxInput} />
            <Field label="Max output tokens (per answer)"   value={maxOutput} onChange={setMaxOutput} />
          </Row2>
          <TouchableOpacity style={[styles.btn, !scopeReady && styles.btnDisabled]} disabled={!scopeReady} onPress={savePolicy}>
            <Text style={styles.btnText}>Save token limits for {scopeType === 'global' ? 'everyone' : (currentScopeLabel || 'selected target')}</Text>
          </TouchableOpacity>
          {canBulk && (
            <TouchableOpacity style={[styles.btnSecondary, bulkRunning && styles.btnDisabled]} disabled={bulkRunning} onPress={applyPolicyToAllCampuses}>
              <Text style={styles.btnSecondaryText}>{bulkRunning ? 'Working…' : 'Shortcut: apply these limits to every campus I manage'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Current allocations */}
        <Text style={styles.h2}>Current allocations</Text>
        <Text style={styles.helpInline}>
          Everyone currently configured. Lower entries override higher ones.
        </Text>
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder="Filter by name…"
          value={summaryFilter}
          onChangeText={setSummaryFilter}
        />
        {filteredSummary.length === 0 ? (
          <Text style={styles.subtle}>No rules configured yet.</Text>
        ) : filteredSummary.map((r) => (
          <View key={`${r.scope_type}#${r.scope_id ?? 'null'}`} style={styles.allocCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.allocTitle}>{r.scope_name}</Text>
              {r.is_enabled === null ? null : (
                <View style={[styles.pill, r.is_enabled ? styles.pillOn : styles.pillOff]}>
                  <Text style={[styles.pillText, r.is_enabled ? styles.pillTextOn : styles.pillTextOff]}>
                    {r.is_enabled ? 'AI ON' : 'AI OFF'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.allocLine}>Requests · D {fmt(r.daily_requests)} · W {fmt(r.weekly_requests)} · M {fmt(r.monthly_requests)}</Text>
            <Text style={styles.allocLine}>Tokens · D {fmt(r.daily_tokens)} · W {fmt(r.weekly_tokens)} · M {fmt(r.monthly_tokens)}</Text>
            {(r.max_input_tokens || r.max_output_tokens) ? (
              <Text style={styles.allocLine}>Per call · in {fmt(r.max_input_tokens)} / out {fmt(r.max_output_tokens)}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Picker modal */}
      <PickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        kind={pickerKind}
        parentId={
          pickerKind === 'campus' ? picked.organization?.id :
          pickerKind === 'class'  ? picked.campus?.id :
          pickerKind === 'section' ? picked.class?.id :
          pickerKind === 'student' ? picked.section?.id : null
        }
        onPick={(item) => onPicked(pickerKind, item)}
      />
    </SafeAreaView>
  );
}

function PickerRow({ kind, picked, onPress, disabled }) {
  const labels = {
    organization: 'Organization',
    campus: 'Campus (school)',
    class: 'Class',
    section: 'Section',
    student: 'Student',
  };
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.pickerRow, disabled && styles.btnDisabled]}>
      <Text style={styles.pickerLabel}>{labels[kind]}</Text>
      <Text style={styles.pickerValue}>{picked?.name || 'Tap to choose…'}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChange }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholder="∞" value={value} onChangeText={onChange} keyboardType="numeric" />
    </View>
  );
}

function Row2({ children }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>;
}

function PickerModal({ visible, onClose, kind, parentId, onPick }) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!visible || !kind) return;
    setLoading(true);
    setErrMsg('');
    setOptions([]);
    fetchScopeOptions(kind, parentId)
      .then((r) => {
        setOptions(r.data?.options || []);
        if (r.data?.message) setErrMsg(r.data.message);
      })
      .catch((e) => setErrMsg(e?.response?.data?.message || 'Failed to load list'))
      .finally(() => setLoading(false));
  }, [visible, kind, parentId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.name).toLowerCase().includes(q));
  }, [search, options]);

  const titles = {
    organization: 'Pick an organization',
    campus: 'Pick a campus',
    class: 'Pick a class',
    section: 'Pick a section',
    student: 'Pick a student',
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.rowBetween}>
            <Text style={styles.h2}>{titles[kind] || 'Pick'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>Close</Text></TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder="Search…" value={search} onChangeText={setSearch} />
          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : filtered.length === 0 ? (
            <Text style={[styles.subtle, { marginTop: 16 }]}>{errMsg || 'No items found.'}</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(it) => String(it.id)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => onPick(item)}>
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 380 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  h2: { fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  helpTop: { color: '#4B5563', marginBottom: 10, lineHeight: 18 },
  helpInline: { color: '#6B7280', fontSize: 12, lineHeight: 16, marginTop: 2 },
  card: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginBottom: 12, gap: 8 },
  label: { fontWeight: '600', color: '#374151' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#E5E7EB' },
  chipOn: { backgroundColor: '#2563EB' },
  chipText: { color: '#374151', fontWeight: '600', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  fieldLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btn: { backgroundColor: '#2563EB', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  btnSecondary: { backgroundColor: '#E0E7FF', padding: 10, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  btnSecondaryText: { color: '#3730A3', fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  healthCard: { backgroundColor: '#F1F5F9' },
  lineBad: { color: '#B91C1C', fontWeight: '700' },
  line: { color: '#374151', paddingVertical: 2 },
  subtle: { color: '#6B7280', fontStyle: 'italic' },
  pickerRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 10, marginTop: 6 },
  pickerLabel: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  pickerValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
  scopePreview: { marginTop: 6, color: '#374151' },
  allocCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, marginTop: 8, gap: 4 },
  allocTitle: { fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  allocLine: { color: '#374151', fontSize: 12 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pillOn: { backgroundColor: '#D1FAE5' },
  pillOff: { backgroundColor: '#FEE2E2' },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillTextOn: { color: '#065F46' },
  pillTextOff: { color: '#991B1B' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', padding: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%' },
  modalClose: { color: '#2563EB', fontWeight: '700' },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalItemText: { fontSize: 14, color: '#111827' },
});
