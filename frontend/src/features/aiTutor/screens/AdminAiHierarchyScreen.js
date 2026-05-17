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
import ScreenIntroCard from '../../../components/ScreenIntroCard';
import {
  fetchHierarchy, setFeatureFlag, setFeatureFlagsBulk,
  setQuotaPolicy, deleteScopeConfig, cascadeFeatureFlag,
} from '../api/aiTutorApi';
import { useAuth } from '../../../context/AuthContext';
import { C, S } from '../../../config/theme';

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

const DISTRIBUTABLE_KEYS = new Set([
  'daily_requests', 'weekly_requests', 'monthly_requests',
  'daily_tokens', 'weekly_tokens', 'monthly_tokens',
]);

const numericOnly = (v) => v.replace(/[^0-9]/g, '');
const percentInput = (v) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const percentFromBps = (bps) => {
  if (bps === null || bps === undefined || Number.isNaN(Number(bps))) return '';
  const pct = Number(bps) / 100;
  return Number.isInteger(pct) ? String(pct) : String(pct.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const TYPE_LABEL = {
  global: 'Global', organization: 'Org', campus: 'Campus',
  class: 'Class', section: 'Section', student: 'Student', root: 'Level 1',
};
const CHILD_LABEL_PLURAL = {
  root: 'Level 1',
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

  const [stack, setStack] = useState([{ type: 'root', id: null, name: 'Level 1' }]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);     // child currently being toggled
  const [showQuotaEditor, setShowQuotaEditor] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState({});
  const [quotaTarget, setQuotaTarget] = useState(null);
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

  // Hijack the header back button (and Android hardware back): if we are
  // deeper than the root of the hierarchy, walk one breadcrumb up instead of
  // leaving the screen. Only at the top of the stack does it actually
  // navigate back out of this screen.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (stack.length > 1) {
        e.preventDefault();
        setStack((s) => s.slice(0, -1));
      }
    });
    return unsub;
  }, [navigation, stack.length]);

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
        if (child.has_children) {
          await cascadeFeatureFlag({
            scope_type: child.type, scope_id: child.id,
            is_enabled: null, mode: 'inherit', clear_subtree: true,
          });
        } else {
          await deleteScopeConfig(child.type, child.id, 'flag');
        }
      } else {
        // Cascade so any conflicting overrides in this child's subtree are cleared
        // and everyone below truly inherits the new decision.
        await cascadeFeatureFlag({
          scope_type: child.type, scope_id: child.id,
          is_enabled: value, clear_subtree: true,
        });
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
    if (value === null) {
      Alert.alert(
        `Set ${current.name} to inherit?`,
        `This will clear the explicit AI flag on ${current.name} and clear any ON/OFF overrides below it so the whole subtree inherits from the parent above. Per-child quota allocations are kept.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear & inherit',
            style: 'destructive',
            onPress: async () => {
              setBusyId('node');
              try {
                await cascadeFeatureFlag({
                  scope_type: current.type, scope_id: current.id,
                  is_enabled: null, mode: 'inherit', clear_subtree: true,
                });
                await load();
              } catch (e) {
                Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not update');
              } finally {
                setBusyId(null);
              }
            },
          },
        ]
      );
      return;
    }
    // For ON / OFF we cascade so any conflicting child overrides are cleared
    // and the subtree truly inherits this node's decision. Otherwise an
    // earlier OFF on a campus could prevent enabling its org from giving
    // anyone the token share.
    const verb = value ? 'enable' : 'disable';
    Alert.alert(
      `${value ? 'Enable' : 'Disable'} ${current.name}?`,
      `This will ${verb} AI Tutor for everyone under ${current.name} and clear any conflicting ON/OFF overrides on classes, sections, and students inside it. Their per-child custom token allocations (if any) are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: value ? 'Enable & cascade' : 'Disable & cascade',
          style: value ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId('node');
            try {
              await cascadeFeatureFlag({
                scope_type: current.type, scope_id: current.id,
                is_enabled: value, clear_subtree: true,
              });
              await load();
            } catch (e) {
              Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not update');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  // ── Quota allocation for current node ──────────────────────────
  const openQuotaEditorFor = (target, effectivePolicy = {}) => {
    if (!target) return;
    const own = target?.own_policy || {};
    const draft = {};
    POLICY_FIELDS.forEach((f) => {
      draft[f.key] = own[f.key] !== null && own[f.key] !== undefined ? String(own[f.key]) : '';
      if (DISTRIBUTABLE_KEYS.has(f.key)) {
        draft[`${f.key}_mode`] = own[`${f.key}_mode`] || (own[f.key] !== null && own[f.key] !== undefined ? 'fixed' : 'inherit');
        draft[`${f.key}_percent`] = percentFromBps(own[`${f.key}_percent_bps`]);
      }
    });
    setQuotaTarget({ ...target, effective_policy: effectivePolicy || {} });
    setQuotaDraft(draft);
    setShowQuotaEditor(true);
  };

  const openQuotaEditor = () => {
    if (data?.is_root || !data?.node) return;
    openQuotaEditorFor(data.node, data.node.effective_policy || {});
  };

  const openChildQuotaEditor = (child) => {
    if (!child) return;
    openQuotaEditorFor(child, child.allocation || {});
  };

  const saveQuota = async () => {
    setSavingQuota(true);
    try {
      const target = quotaTarget || data?.node;
      if (!target?.type || target?.id === undefined) throw new Error('No quota target selected');
      const body = { scope_type: target.type, scope_id: target.id };
      let anySet = false;
      POLICY_FIELDS.forEach((f) => {
        if (DISTRIBUTABLE_KEYS.has(f.key)) {
          const mode = quotaDraft[`${f.key}_mode`] || (quotaDraft[f.key] ? 'fixed' : 'inherit');
          body[`${f.key}_mode`] = mode;
          if (mode === 'fixed') {
            const v = quotaDraft[f.key];
            if (v && v.trim() !== '') {
              const n = Number(v);
              if (!Number.isNaN(n)) { body[f.key] = n; anySet = true; }
            }
          } else if (mode === 'percent') {
            const pctRaw = quotaDraft[`${f.key}_percent`];
            if (pctRaw && pctRaw.trim() !== '') {
              const pct = Number(pctRaw);
              if (!Number.isNaN(pct)) {
                body[`${f.key}_percent_bps`] = Math.round(pct * 100);
                anySet = true;
              }
            }
          }
        } else {
          const v = quotaDraft[f.key];
          if (v && v.trim() !== '') {
            const n = Number(v);
            if (!Number.isNaN(n)) { body[f.key] = n; anySet = true; }
          }
        }
      });
      if (!anySet) {
        // Treat as "clear all" → inherit from parent
        await deleteScopeConfig(target.type, target.id, 'policy');
      } else {
        await setQuotaPolicy(body);
      }
      setShowQuotaEditor(false);
      setQuotaTarget(null);
      await load();
    } catch (e) {
      const data = e?.response?.data;
      if (Array.isArray(data?.violations) && data.violations.length) {
        const fieldLabel = (k) => POLICY_FIELDS.find((p) => p.key === k)?.label || k;
        const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
        const lines = data.violations.map((v) => {
          if (v.parent_pool === null) {
            return `• ${fieldLabel(v.field)}: no limit set at any higher level. Set it on a parent first, then split it down here.`;
          }
          if (v.max_allowed === null) {
            return `• ${fieldLabel(v.field)}: cannot exceed parent cap (${fmt(v.parent_pool)}).`;
          }
          return `• ${fieldLabel(v.field)}: only ${fmt(v.max_allowed)} available (parent has ${fmt(v.parent_pool)}, other siblings already use ${fmt(v.sibling_sum)}).`;
        }).join('\n');
        Alert.alert(
          'Not enough quota available',
          `You're trying to allocate more than ${data?.parent?.name || 'the parent'} can give.\n\n${lines}\n\nReduce the values or free up quota by lowering a sibling's allocation.`
        );
      } else {
        Alert.alert("Couldn't save", data?.message || e?.message || 'Please try again.');
      }
    } finally {
      setSavingQuota(false);
    }
  };

  const clearQuota = async () => {
    const target = quotaTarget || data?.node;
    if (!target?.type || target?.id === undefined) return;
    Alert.alert(
      'Clear allocation?',
      `This will remove ${target.name}'s own quota allocation. It will inherit from its parent again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setSavingQuota(true);
            try {
              await deleteScopeConfig(target.type, target.id, 'policy');
              setShowQuotaEditor(false);
              setQuotaTarget(null);
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
  const contextEffFlag = data?.context_effective_flag || effFlag;
  const modalTarget = quotaTarget || node;
  const modalEffPolicy = quotaTarget?.effective_policy || effPolicy;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <ScreenIntroCard
          title="AI Tutor Policies"
          description="Manage inheritance, overrides, and quota distribution across organizations, campuses, classes, sections, and students from one hierarchy."
          icon="git-merge-outline"
          tone="violet"
        />

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
                label="ON (cascade)"
                active={node.own_flag?.is_enabled === true}
                onPress={() => setCurrentFlag(true)}
                busy={busyId === 'node'}
                color="#16a34a"
              />
              <TriButton
                label="OFF (cascade)"
                active={node.own_flag?.is_enabled === false}
                onPress={() => setCurrentFlag(false)}
                busy={busyId === 'node'}
                color="#dc2626"
              />
            </View>
            <Text style={styles.subtleSmall}>
              ON/OFF clears conflicting overrides below so the whole subtree truly inherits this decision.
            </Text>

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
                ? 'Nothing to manage at Level 1.'
                : `No ${CHILD_LABEL_PLURAL[current.type] || 'children'} under this node.`}
            </Text>
          )}

          {filteredChildren.map((child) => (
            <ChildRow
              key={`${child.type}#${child.id}`}
              child={child}
              parentEffFlag={contextEffFlag?.is_enabled ?? null}
              currentNodeName={node?.name || 'global default'}
              busy={busyId === `${child.type}#${child.id}`}
              onTriState={(v) => setChildFlag(child, v)}
              onEditQuota={() => openChildQuotaEditor(child)}
              onDrillIn={() => goInto(child)}
            />
          ))}
        </View>

        {/* Footer link to system-defaults editor — super_admin only */}
        {user?.role === 'super_admin' && (
          <TouchableOpacity
            style={styles.advancedLink}
            onPress={() => navigation.navigate('AdminAiPolicyAdvanced')}
          >
            <Text style={styles.advancedLinkText}>Edit system-wide defaults →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Quota editor modal-ish overlay */}
      {showQuotaEditor && (
        <View style={styles.modalBackdrop} pointerEvents="auto">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Allocation for {modalTarget?.name}
            </Text>
            <Text style={styles.modalHelp}>
              Use inherit for auto pro-rata distribution, fixed for a hard reserved amount,
              or percent to scale with the parent pool. Request limits and token pools support
              all three modes; per-request caps stay fixed only.
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {POLICY_FIELDS.map((f) => {
                const eff = modalEffPolicy[f.key];
                const mode = quotaDraft[`${f.key}_mode`] || (DISTRIBUTABLE_KEYS.has(f.key) ? 'inherit' : 'fixed');
                const placeholder = eff?.value === null || eff?.value === undefined
                  ? 'No limit'
                  : `${eff.value} (from ${eff.from_name})`;
                return (
                  <View key={f.key} style={styles.modalField}>
                    <Text style={styles.modalFieldLabel}>{f.label}</Text>
                    {DISTRIBUTABLE_KEYS.has(f.key) && (
                      <View style={styles.modeRow}>
                        {['inherit', 'fixed', 'percent'].map((option) => (
                          <TouchableOpacity
                            key={option}
                            style={[styles.modeChip, mode === option && styles.modeChipActive]}
                            onPress={() => setQuotaDraft({ ...quotaDraft, [`${f.key}_mode`]: option })}
                          >
                            <Text style={[styles.modeChipText, mode === option && styles.modeChipTextActive]}>
                              {option}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {(!DISTRIBUTABLE_KEYS.has(f.key) || mode === 'fixed') && (
                      <TextInput
                        style={styles.modalInput}
                        keyboardType="numeric"
                        placeholder={placeholder}
                        placeholderTextColor="#9ca3af"
                        value={quotaDraft[f.key] ?? ''}
                        onChangeText={(v) => setQuotaDraft({ ...quotaDraft, [f.key]: numericOnly(v) })}
                      />
                    )}
                    {DISTRIBUTABLE_KEYS.has(f.key) && mode === 'percent' && (
                      <TextInput
                        style={styles.modalInput}
                        keyboardType="decimal-pad"
                        placeholder="Percent of parent pool"
                        placeholderTextColor="#9ca3af"
                        value={quotaDraft[`${f.key}_percent`] ?? ''}
                        onChangeText={(v) => setQuotaDraft({ ...quotaDraft, [`${f.key}_percent`]: percentInput(v) })}
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => {
                  setShowQuotaEditor(false);
                  setQuotaTarget(null);
                }}
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

function ChildRow({ child, parentEffFlag, currentNodeName, busy, onTriState, onEditQuota, onDrillIn }) {
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
        <TouchableOpacity style={styles.quotaBtn} onPress={onEditQuota}>
          <Text style={styles.quotaBtnText}>Quota</Text>
        </TouchableOpacity>
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
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 24 },

  errorBanner: { backgroundColor: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 8, marginHorizontal: 16 },

  card: { ...S.card, padding: 16, marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },

  statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#e5e7eb', marginRight: 8 },
  statusOn: { backgroundColor: '#dcfce7' },
  statusOff: { backgroundColor: '#fee2e2' },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#111827' },
  subtle: { fontSize: 12, color: C.textMed, lineHeight: 18 },
  subtleSmall: { fontSize: 11, color: C.textLight, marginTop: -4, marginBottom: 10, fontStyle: 'italic', lineHeight: 16 },

  triRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  triBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: '#fff' },
  triBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  triBtnTextActive: { color: '#fff' },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  quotaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  quotaCell: { width: '50%', paddingHorizontal: 4, marginBottom: 8 },
  quotaLabel: { fontSize: 11, color: C.textMed },
  quotaValue: { fontSize: 15, fontWeight: '700', color: C.textDark },
  quotaFromOwn: { fontSize: 10, color: '#2563eb', fontWeight: '600' },
  quotaFromInherited: { fontSize: 10, color: C.textLight, fontStyle: 'italic' },

  poolBox: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 10 },
  poolTitle: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', marginBottom: 4 },
  poolHelp: { fontSize: 11, color: '#1e40af', marginBottom: 6, lineHeight: 17 },
  poolRow: { marginBottom: 4 },
  poolRowLabel: { fontSize: 11, fontWeight: '700', color: '#1e3a8a' },
  poolRowValue: { fontSize: 11, color: '#1e3a8a', lineHeight: 17 },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  dangerBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  dangerBtnText: { color: '#b91c1c', fontWeight: '700' },

  childrenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 },
  bulkRow: { flexDirection: 'row', gap: 6 },
  bulkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  bulkOn: { backgroundColor: '#dcfce7' },
  bulkOff: { backgroundColor: '#fee2e2' },
  bulkBtnText: { fontSize: 12, fontWeight: '700', color: '#111827' },

  search: { ...S.input, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, backgroundColor: '#fff' },
  empty: { padding: 16, color: C.textMed, textAlign: 'center', fontSize: 12 },

  childRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  childMain: { flex: 1, paddingRight: 6 },
  childNameRow: { flexDirection: 'row', alignItems: 'center' },
  childName: { fontSize: 15, fontWeight: '700', color: C.textDark, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
  dotOn: { backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#dc2626' },
  childStatusText: { fontSize: 11, color: C.textMed },
  childMeta: { fontSize: 11, color: '#2563eb', marginTop: 2, lineHeight: 17 },
  childMetaManual: { fontSize: 11, color: '#b45309', marginTop: 2, fontWeight: '700' },
  childMetaMuted: { fontSize: 11, color: C.textLight, marginTop: 2, fontStyle: 'italic', lineHeight: 17 },

  childActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quotaBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', minWidth: 48, alignItems: 'center' },
  quotaBtnText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  smallTri: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff', minWidth: 36, alignItems: 'center' },
  smallTriText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  smallTriTextActive: { color: '#fff' },
  drillBtn: { paddingHorizontal: 8, paddingVertical: 6, marginLeft: 2 },
  drillBtnText: { fontSize: 18, color: C.textMed, fontWeight: '700' },

  advancedLink: { paddingTop: 8, paddingBottom: 10, alignItems: 'center' },
  advancedLinkText: { color: C.primary, fontSize: 12, textDecorationLine: 'underline' },

  // modal
  modalBackdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 12,
  },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  modalHelp: { fontSize: 12, color: C.textMed, marginBottom: 10, lineHeight: 18 },
  modalField: { marginBottom: 8 },
  modalFieldLabel: { fontSize: 12, color: C.textMed, marginBottom: 4, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e5e7eb' },
  modeChipActive: { backgroundColor: '#dbeafe' },
  modeChipText: { color: '#475569', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  modeChipTextActive: { color: '#1d4ed8' },
  modalInput: { ...S.input, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: C.textDark, marginBottom: 0 },
  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#f3f4f6' },
  modalBtnGhostText: { color: '#374151', fontWeight: '700' },
  modalBtnPrimary: { backgroundColor: '#2563eb' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '700' },
});
