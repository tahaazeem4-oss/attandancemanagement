// frontend/src/features/aiTutor/screens/AdminAiHierarchyScreen.js
// Drill-down hierarchy view for AI Tutor feature flag + quota distribution.
// Walk org → campus → class → section → student. Each level shows what it
// inherits from its parent and can override per child.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  fetchHierarchy, setFeatureFlag, setFeatureFlagsBulk,
  setQuotaPolicy, deleteScopeConfig,
} from '../api/aiTutorApi';
import { useAuth } from '../../../context/AuthContext';

const POLICY_FIELDS = [
  { key: 'daily_requests',    label: 'Requests / day' },
  { key: 'weekly_requests',   label: 'Requests / week' },
  { key: 'monthly_requests',  label: 'Requests / month' },
  { key: 'daily_tokens',      label: 'Tokens / day' },
  { key: 'weekly_tokens',     label: 'Tokens / week' },
  { key: 'monthly_tokens',    label: 'Tokens / month' },
  { key: 'max_input_tokens',  label: 'Max input tokens / request' },
  { key: 'max_output_tokens', label: 'Max output tokens / request' },
];

const TYPE_LABEL = {
  global: 'Global', organization: 'Org', campus: 'Campus',
  class: 'Class', section: 'Section', student: 'Student', root: 'Top',
};
const CHILD_LABEL_PLURAL = {
  root: 'top level',
  organization: 'campuses',
  campus: 'classes',
  class: 'sections',
  section: 'students',
};
const CHILD_LABEL_SINGULAR = {
  root: 'item',
  organization: 'campus',
  campus: 'class',
  class: 'section',
  section: 'student',
};

export default function AdminAiHierarchyScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const navigation = useNavigation();

  const [stack, setStack] = useState([{ type: 'root', id: null, name: 'Top' }]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);     // child currently being toggled
  const [showQuotaEditor, setShowQuotaEditor] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState({});
  const [savingQuota, setSavingQuota] = useState(false);
  const [filter, setFilter] = useState('');

  const current = stack[stack.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchHierarchy(current.type, current.id);
      setData(res.data || res);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [current.type, current.id]);

  useEffect(() => { load(); }, [load]);

  const goInto = (child) => {
    if (!child.has_children) return;
    setStack([...stack, { type: child.type, id: child.id, name: child.name }]);
  };
  const goUp = (index) => {
    setStack(stack.slice(0, index + 1));
  };

  // ── Per-child tri-state toggle ─────────────────────────────────
  const setChildFlag = async (child, value /* true | false | null */) => {
    setBusyId(`${child.type}#${child.id}`);
    try {
      if (value === null) {
        await deleteScopeConfig(child.type, child.id, 'flag');
      } else {
        await setFeatureFlag({ scope_type: child.type, scope_id: child.id, is_enabled: value });
      }
      await load();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not update');
    } finally {
      setBusyId(null);
    }
  };

  // ── Current node's flag override ───────────────────────────────
  const setCurrentFlag = async (value) => {
    if (data?.is_root) return;
    setBusyId('node');
    try {
      if (value === null) {
        await deleteScopeConfig(current.type, current.id, 'flag');
      } else {
        await setFeatureFlag({ scope_type: current.type, scope_id: current.id, is_enabled: value });
      }
      await load();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not update');
    } finally {
      setBusyId(null);
    }
  };

  // ── Quota allocation for current node ──────────────────────────
  const openQuotaEditor = () => {
    if (data?.is_root) return;
    const own = data?.node?.own_policy || {};
    const draft = {};
    POLICY_FIELDS.forEach((f) => {
      draft[f.key] = own[f.key] !== null && own[f.key] !== undefined ? String(own[f.key]) : '';
    });
    setQuotaDraft(draft);
    setShowQuotaEditor(true);
  };

  const saveQuota = async () => {
    setSavingQuota(true);
    try {
      const body = { scope_type: current.type, scope_id: current.id };
      let anySet = false;
      POLICY_FIELDS.forEach((f) => {
        const v = quotaDraft[f.key];
        if (v && v.trim() !== '') {
          const n = Number(v);
          if (!Number.isNaN(n)) { body[f.key] = n; anySet = true; }
        }
      });
      if (!anySet) {
        // Treat as "clear all" → inherit from parent
        await deleteScopeConfig(current.type, current.id, 'policy');
      } else {
        await setQuotaPolicy(body);
      }
      setShowQuotaEditor(false);
      await load();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not save');
    } finally {
      setSavingQuota(false);
    }
  };

  const clearQuota = async () => {
    Alert.alert(
      'Clear allocation?',
      `This will remove ${current.name}'s own quota allocation. It will inherit from its parent again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setSavingQuota(true);
            try {
              await deleteScopeConfig(current.type, current.id, 'policy');
              setShowQuotaEditor(false);
              await load();
            } catch (e) {
              Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not clear');
            } finally {
              setSavingQuota(false);
            }
          },
        },
      ]
    );
  };

  // ── Bulk on/off for all listed children ────────────────────────
  const bulkSetChildren = async (value) => {
    const visibleChildren = (data?.children || []).filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
    if (!visibleChildren.length) return;
    const targets = visibleChildren.map((c) => ({ scope_type: c.type, scope_id: c.id }));
    setBusyId('bulk');
    try {
      await setFeatureFlagsBulk({ targets, is_enabled: value });
      await load();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Bulk update failed');
    } finally {
      setBusyId(null);
    }
  };

  const filteredChildren = useMemo(() => {
    const all = data?.children || [];
    if (!filter) return all;
    const q = filter.toLowerCase();
    return all.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, filter]);

  const node = data?.node;
  const effFlag = node?.effective_flag;
  const effPolicy = node?.effective_policy || {};

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {/* Breadcrumb */}
        <View style={styles.breadcrumbRow}>
          {stack.map((s, i) => (
            <React.Fragment key={`${s.type}#${s.id ?? 'root'}#${i}`}>
              {i > 0 && <Text style={styles.crumbSep}>›</Text>}
              <TouchableOpacity onPress={() => goUp(i)} disabled={i === stack.length - 1}>
                <Text style={[styles.crumb, i === stack.length - 1 && styles.crumbActive]}>
                  {i === 0 ? 'Top' : `${TYPE_LABEL[s.type]}: ${s.name}`}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.helpTop}>
          Pick where the rule applies. Empty values inherit from the parent above.
          Use the {'\u25BA'} to drill in.
        </Text>

        {!!error && <Text style={styles.errorBanner}>{error}</Text>}

        {/* Current node card (skip for root) */}
        {data && !data.is_root && node && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {TYPE_LABEL[node.type]}: {node.name}
            </Text>
            {node.student_count_total !== undefined && (
              <Text style={styles.subtle}>
                {node.student_count?.toLocaleString?.() ?? 0} of {node.student_count_total?.toLocaleString?.() ?? 0} students are AI-enabled
                {node.student_count !== node.student_count_total ? ' — only enabled students share the pool' : ''}
              </Text>
            )}

            {/* AI ON/OFF status + tri-state */}
            <View style={styles.statusRow}>
              <View style={[
                styles.statusPill,
                effFlag?.is_enabled === true && styles.statusOn,
                effFlag?.is_enabled === false && styles.statusOff,
              ]}>
                <Text style={styles.statusPillText}>
                  AI is currently {effFlag?.is_enabled ? 'ON' : 'OFF'}
                </Text>
              </View>
              <Text style={styles.subtle}>
                {node.own_flag === null
                  ? `Inherited from ${effFlag?.from_name || 'global default'}`
                  : 'Set directly on this level'}
              </Text>
            </View>

            <View style={styles.triRow}>
              <TriButton
                label="Inherit"
                active={node.own_flag === null}
                onPress={() => setCurrentFlag(null)}
                busy={busyId === 'node'}
              />
              <TriButton
                label="Force ON"
                active={node.own_flag?.is_enabled === true}
                onPress={() => setCurrentFlag(true)}
                busy={busyId === 'node'}
                color="#16a34a"
              />
              <TriButton
                label="Force OFF"
                active={node.own_flag?.is_enabled === false}
                onPress={() => setCurrentFlag(false)}
                busy={busyId === 'node'}
                color="#dc2626"
              />
            </View>

            {/* Effective quota summary */}
            <Text style={styles.sectionLabel}>Current limits in effect</Text>
            <View style={styles.quotaGrid}>
              {POLICY_FIELDS.map((f) => {
                const eff = effPolicy[f.key] || { value: null, from_name: 'no limit', source: 'none' };
                const isOwn = eff.source === 'manual';
                const isAuto = eff.source === 'auto';
                const sb = eff.share_basis;
                return (
                  <View key={f.key} style={styles.quotaCell}>
                    <Text style={styles.quotaLabel}>{f.label}</Text>
                    <Text style={styles.quotaValue}>
                      {eff.value === null ? 'No limit' : eff.value.toLocaleString()}
                    </Text>
                    <Text style={isOwn ? styles.quotaFromOwn : styles.quotaFromInherited}>
                      {isOwn
                        ? 'Set here (manual)'
                        : isAuto && sb
                          ? `share of ${sb.parent_pool?.toLocaleString?.() ?? '—'} pool (${sb.my_students}/${sb.non_manual_students} students)`
                          : `from ${eff.from_name}`}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Distribution preview — how the pool will split among children */}
            {data?.distribution && Object.values(data.distribution).some((d) => d.parent_pool !== null) && (data?.children?.length || 0) > 0 && (
              <View style={styles.poolBox}>
                <Text style={styles.poolTitle}>Pool distribution preview</Text>
                <Text style={styles.poolHelp}>
                  Each {CHILD_LABEL_SINGULAR[current.type] || 'child'} gets a share of this node's pool, sized by its student count.
                  Manual overrides come off the top; the remainder is split pro-rata.
                </Text>
                {['daily_tokens','monthly_tokens','daily_requests'].map((F) => {
                  const d = data.distribution[F];
                  if (!d || d.parent_pool === null) return null;
                  return (
                    <View key={F} style={styles.poolRow}>
                      <Text style={styles.poolRowLabel}>{POLICY_FIELDS.find((p) => p.key === F)?.label}</Text>
                      <Text style={styles.poolRowValue}>
                        pool {d.parent_pool.toLocaleString()} • manual {d.manual_sum.toLocaleString()} • free {d.remaining?.toLocaleString?.() ?? '—'}
                        {d.per_student !== null ? ` → ~${d.per_student.toLocaleString()} per student` : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={openQuotaEditor}>
                <Text style={styles.primaryBtnText}>
                  {node.own_policy ? 'Edit allocation' : 'Set custom allocation'}
                </Text>
              </TouchableOpacity>
              {node.own_policy && (
                <TouchableOpacity style={styles.dangerBtn} onPress={clearQuota}>
                  <Text style={styles.dangerBtnText}>Clear → inherit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Children list */}
        <View style={styles.card}>
          <View style={styles.childrenHeader}>
            <Text style={styles.cardTitle}>
              {CHILD_LABEL_PLURAL[current.type] || 'children'} ({filteredChildren.length})
            </Text>
            {filteredChildren.length > 0 && !data?.is_root && (
              <View style={styles.bulkRow}>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkOn]}
                  onPress={() => bulkSetChildren(true)}
                  disabled={busyId === 'bulk'}
                >
                  <Text style={styles.bulkBtnText}>All ON</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkOff]}
                  onPress={() => bulkSetChildren(false)}
                  disabled={busyId === 'bulk'}
                >
                  <Text style={styles.bulkBtnText}>All OFF</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {(data?.children || []).length > 8 && (
            <TextInput
              style={styles.search}
              placeholder="Filter by name…"
              value={filter}
              onChangeText={setFilter}
            />
          )}

          {loading && !data && (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          )}

          {!loading && filteredChildren.length === 0 && (
            <Text style={styles.empty}>
              {data?.is_root
                ? 'Nothing to manage at the top level.'
                : `No ${CHILD_LABEL_PLURAL[current.type] || 'children'} under this node.`}
            </Text>
          )}

          {filteredChildren.map((child) => (
            <ChildRow
              key={`${child.type}#${child.id}`}
              child={child}
              parentEffFlag={effFlag?.is_enabled ?? null}
              currentNodeName={node?.name || 'global default'}
              busy={busyId === `${child.type}#${child.id}`}
              onTriState={(v) => setChildFlag(child, v)}
              onDrillIn={() => goInto(child)}
            />
          ))}
        </View>

        {/* Footer link to advanced flat editor */}
        <TouchableOpacity
          style={styles.advancedLink}
          onPress={() => navigation.navigate('AdminAiPolicyAdvanced')}
        >
          <Text style={styles.advancedLinkText}>Open advanced flat editor →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Quota editor modal-ish overlay */}
      {showQuotaEditor && (
        <View style={styles.modalBackdrop} pointerEvents="auto">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Allocation for {node?.name}
            </Text>
            <Text style={styles.modalHelp}>
              Leave a field blank to receive an auto pro-rata share of the parent's pool
              (based on student count). Set a value to claim a fixed allocation off the top —
              the remaining pool is then split among the other children.
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {POLICY_FIELDS.map((f) => {
                const eff = effPolicy[f.key];
                const placeholder = eff?.value === null || eff?.value === undefined
                  ? 'No limit'
                  : `${eff.value} (from ${eff.from_name})`;
                return (
                  <View key={f.key} style={styles.modalField}>
                    <Text style={styles.modalFieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      placeholder={placeholder}
                      placeholderTextColor="#9ca3af"
                      value={quotaDraft[f.key] ?? ''}
                      onChangeText={(v) => setQuotaDraft({ ...quotaDraft, [f.key]: v.replace(/[^0-9]/g, '') })}
                    />
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setShowQuotaEditor(false)}
                disabled={savingQuota}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={saveQuota}
                disabled={savingQuota}
              >
                {savingQuota
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalBtnPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function TriButton({ label, active, onPress, busy, color }) {
  return (
    <TouchableOpacity
      style={[
        styles.triBtn,
        active && { backgroundColor: color || '#2563eb', borderColor: color || '#2563eb' },
      ]}
      onPress={onPress}
      disabled={busy}
    >
      {busy && active
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={[styles.triBtnText, active && styles.triBtnTextActive]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ChildRow({ child, parentEffFlag, currentNodeName, busy, onTriState, onDrillIn }) {
  // Determine effective for this child: own_flag if set else inherit parentEffFlag.
  const ownFlag = child.own_flag;
  const isOwn = ownFlag !== null;
  const effective = isOwn ? ownFlag.is_enabled : parentEffFlag;

  // Use server-computed allocation. Pick a representative distributable field
  // (monthly_tokens; fall back to daily_tokens) for the summary line.
  const alloc = child.allocation || {};
  const pick = alloc.monthly_tokens?.value !== null && alloc.monthly_tokens?.value !== undefined
    ? { key: 'monthly_tokens', label: 'tok/mo', data: alloc.monthly_tokens }
    : alloc.daily_tokens?.value !== null && alloc.daily_tokens?.value !== undefined
      ? { key: 'daily_tokens', label: 'tok/day', data: alloc.daily_tokens }
      : null;

  let allocLine = null;
  if (pick && pick.data) {
    const v = pick.data.value;
    const src = pick.data.source;
    if (src === 'manual') {
      allocLine = `MANUAL ${Number(v).toLocaleString()} ${pick.label}`;
    } else if (src === 'auto') {
      const sb = pick.data.share_basis;
      allocLine = sb
        ? `auto ${Number(v).toLocaleString()} ${pick.label}  •  ${sb.my_students}/${sb.non_manual_students} students share ${sb.remaining?.toLocaleString?.() ?? '—'}`
        : `auto ${Number(v).toLocaleString()} ${pick.label}`;
    } else if (src === 'none' || v === null) {
      allocLine = `no limit (${pick.label})`;
    }
  }

  const studentLine = child.has_children
    ? (child.student_count_total !== undefined && child.student_count !== child.student_count_total
        ? `${child.student_count?.toLocaleString?.() ?? '0'} / ${child.student_count_total?.toLocaleString?.() ?? '0'} students AI-enabled`
        : `${child.student_count?.toLocaleString?.() ?? '0'} students`)
    : null;

  return (
    <View style={styles.childRow}>
      <TouchableOpacity style={styles.childMain} onPress={onDrillIn} disabled={!child.has_children}>
        <View style={styles.childNameRow}>
          <Text style={styles.childName} numberOfLines={1}>{child.name}</Text>
          <View style={[styles.dot, effective ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.childStatusText}>
            {effective ? 'ON' : 'OFF'}{isOwn ? '' : ' (inh)'}
          </Text>
        </View>
        {studentLine && <Text style={styles.childMetaMuted}>{studentLine}</Text>}
        {allocLine && (
          <Text style={pick?.data?.source === 'manual' ? styles.childMetaManual : styles.childMeta}>
            {allocLine}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.childActions}>
        <SmallTri
          label="Inh"
          active={!isOwn}
          onPress={() => onTriState(null)}
          busy={busy}
        />
        <SmallTri
          label="ON"
          active={ownFlag?.is_enabled === true}
          onPress={() => onTriState(true)}
          busy={busy}
          color="#16a34a"
        />
        <SmallTri
          label="OFF"
          active={ownFlag?.is_enabled === false}
          onPress={() => onTriState(false)}
          busy={busy}
          color="#dc2626"
        />
        {child.has_children && (
          <TouchableOpacity style={styles.drillBtn} onPress={onDrillIn}>
            <Text style={styles.drillBtnText}>›</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SmallTri({ label, active, onPress, busy, color }) {
  return (
    <TouchableOpacity
      style={[
        styles.smallTri,
        active && { backgroundColor: color || '#2563eb', borderColor: color || '#2563eb' },
      ]}
      onPress={onPress}
      disabled={busy}
    >
      <Text style={[styles.smallTriText, active && styles.smallTriTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 12, paddingBottom: 64 },

  breadcrumbRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 },
  crumb: { color: '#2563eb', fontSize: 13, paddingVertical: 2 },
  crumbActive: { color: '#111827', fontWeight: '700' },
  crumbSep: { color: '#9ca3af', marginHorizontal: 4 },

  helpTop: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  errorBanner: { backgroundColor: '#fee2e2', color: '#991b1b', padding: 8, borderRadius: 6, marginBottom: 8 },

  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },

  statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#e5e7eb', marginRight: 8 },
  statusOn: { backgroundColor: '#dcfce7' },
  statusOff: { backgroundColor: '#fee2e2' },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#111827' },
  subtle: { fontSize: 12, color: '#6b7280' },

  triRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  triBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', backgroundColor: '#fff' },
  triBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  triBtnTextActive: { color: '#fff' },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  quotaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  quotaCell: { width: '50%', paddingHorizontal: 4, marginBottom: 8 },
  quotaLabel: { fontSize: 11, color: '#6b7280' },
  quotaValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  quotaFromOwn: { fontSize: 10, color: '#2563eb', fontWeight: '600' },
  quotaFromInherited: { fontSize: 10, color: '#9ca3af', fontStyle: 'italic' },

  poolBox: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 4, marginBottom: 10 },
  poolTitle: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', marginBottom: 4 },
  poolHelp: { fontSize: 11, color: '#1e40af', marginBottom: 6 },
  poolRow: { marginBottom: 4 },
  poolRowLabel: { fontSize: 11, fontWeight: '700', color: '#1e3a8a' },
  poolRowValue: { fontSize: 11, color: '#1e3a8a' },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  dangerBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  dangerBtnText: { color: '#b91c1c', fontWeight: '700' },

  childrenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 },
  bulkRow: { flexDirection: 'row', gap: 6 },
  bulkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  bulkOn: { backgroundColor: '#dcfce7' },
  bulkOff: { backgroundColor: '#fee2e2' },
  bulkBtnText: { fontSize: 12, fontWeight: '700', color: '#111827' },

  search: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, backgroundColor: '#fff' },
  empty: { padding: 16, color: '#6b7280', textAlign: 'center' },

  childRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  childMain: { flex: 1, paddingRight: 6 },
  childNameRow: { flexDirection: 'row', alignItems: 'center' },
  childName: { fontSize: 14, fontWeight: '600', color: '#111827', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
  dotOn: { backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#dc2626' },
  childStatusText: { fontSize: 11, color: '#6b7280' },
  childMeta: { fontSize: 11, color: '#2563eb', marginTop: 2 },
  childMetaManual: { fontSize: 11, color: '#b45309', marginTop: 2, fontWeight: '700' },
  childMetaMuted: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' },

  childActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallTri: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', minWidth: 36, alignItems: 'center' },
  smallTriText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  smallTriTextActive: { color: '#fff' },
  drillBtn: { paddingHorizontal: 8, paddingVertical: 6, marginLeft: 2 },
  drillBtnText: { fontSize: 18, color: '#6b7280', fontWeight: '700' },

  advancedLink: { padding: 14, alignItems: 'center' },
  advancedLinkText: { color: '#2563eb', fontSize: 13, textDecorationLine: 'underline' },

  // modal
  modalBackdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 12,
  },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalHelp: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  modalField: { marginBottom: 8 },
  modalFieldLabel: { fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', color: '#111827' },
  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#f3f4f6' },
  modalBtnGhostText: { color: '#374151', fontWeight: '700' },
  modalBtnPrimary: { backgroundColor: '#2563eb' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '700' },
});
