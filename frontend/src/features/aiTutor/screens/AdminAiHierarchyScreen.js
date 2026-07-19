// frontend/src/features/aiTutor/screens/AdminAiHierarchyScreen.js
// Drill-down hierarchy view for AI Tutor access + quota.
// Walk org → campus → class → section → student (students only — teacher
// policy stops at campus, since teachers share one pooled limit per school).
// Each level is either "Inherit" (uses whatever the closest parent with an
// explicit setting has) or "Custom" (its own enabled flag + limits).
//
// For STUDENTS, daily/monthly requests+tokens are a shared pool: the global
// number is the system-wide total, and it divides down org → campus → class
// → section → student, pro-rata by active student count. Setting a number
// on a scope reserves that amount off the top of its parent's pool; leaving
// it blank means "auto share of whatever's left." Per-message caps
// (max input/output tokens) are NOT pooled — they're a flat ceiling per
// question, closest explicit scope wins. Teacher limits are already one
// shared counter per campus/org (not per-teacher), so they stay flat too.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ScreenIntroCard from '../../../components/ScreenIntroCard';
import { fetchHierarchy, setFeatureFlag, setQuotaPolicy, deleteScopeConfig } from '../api/aiTutorApi';
import { useAuth } from '../../../context/AuthContext';
import { C, S } from '../../../config/theme';

const POOLED_FIELDS = [
  { key: 'daily_requests',    label: 'Requests / day' },
  { key: 'monthly_requests',  label: 'Requests / month' },
  { key: 'daily_tokens',      label: 'Tokens / day' },
  { key: 'monthly_tokens',    label: 'Tokens / month' },
];
const CAP_FIELDS = [
  { key: 'max_input_tokens',  label: 'Max input tokens / message' },
  { key: 'max_output_tokens', label: 'Max output tokens / message' },
];
const POLICY_FIELDS = [...POOLED_FIELDS, ...CAP_FIELDS];
const POOLED_KEYS = new Set(POOLED_FIELDS.map((f) => f.key));

const numericOnly = (v) => v.replace(/[^0-9]/g, '');

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

export default function AdminAiHierarchyScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();

  const [actorType, setActorType] = useState('student'); // 'student' | 'teacher'
  const [stack, setStack] = useState([{ type: 'root', id: null, name: 'Level 1' }]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showQuotaEditor, setShowQuotaEditor] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState({});
  const [quotaTarget, setQuotaTarget] = useState(null);
  const [savingQuota, setSavingQuota] = useState(false);
  const [filter, setFilter] = useState('');

  const current = stack[stack.length - 1];
  // Teacher policies only go global → organization → campus.
  const childHasChildren = (childType) => actorType === 'student' || childType !== 'campus';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchHierarchy(current.type, current.id, actorType);
      setData(res.data || res);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [current.type, current.id, actorType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (stack.length > 1) {
        e.preventDefault();
        setStack((s) => s.slice(0, -1));
      }
    });
    return unsub;
  }, [navigation, stack.length]);

  const switchActor = (next) => {
    if (next === actorType) return;
    setActorType(next);
    setStack([{ type: 'root', id: null, name: 'Level 1' }]);
  };

  const goInto = (child) => {
    if (!childHasChildren(child.type) || !child.has_children) return;
    setStack([...stack, { type: child.type, id: child.id, name: child.name }]);
  };
  const goUp = (index) => setStack(stack.slice(0, index + 1));

  // ── Enable / disable / inherit for a node ──────────────────────
  const setNodeFlag = async (targetType, targetId, value /* true | false | null */, busyKey) => {
    setBusyId(busyKey);
    try {
      if (value === null) {
        await deleteScopeConfig(targetType, targetId, 'flag', actorType);
      } else {
        await setFeatureFlag({ scope_type: targetType, scope_id: targetId, is_enabled: value });
      }
      await load();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not update');
    } finally {
      setBusyId(null);
    }
  };

  // ── Quota editor ────────────────────────────────────────────────
  const openQuotaEditorFor = (target) => {
    if (!target) return;
    const own = target?.own_policy || {};
    const draft = {};
    POLICY_FIELDS.forEach((f) => {
      draft[f.key] = own[f.key] !== null && own[f.key] !== undefined ? String(own[f.key]) : '';
    });
    setQuotaTarget(target);
    setQuotaDraft(draft);
    setShowQuotaEditor(true);
  };

  const openQuotaEditor = () => {
    if (data?.is_root || !data?.node) return;
    openQuotaEditorFor(data.node);
  };

  const saveQuota = async () => {
    setSavingQuota(true);
    try {
      const target = quotaTarget || data?.node;
      if (!target?.type || target?.id === undefined) throw new Error('No quota target selected');
      const body = { actor_type: actorType, scope_type: target.type, scope_id: target.id };
      let anySet = false;
      POLICY_FIELDS.forEach((f) => {
        const v = quotaDraft[f.key];
        if (v && v.trim() !== '') {
          const n = Number(v);
          if (!Number.isNaN(n)) { body[f.key] = n; anySet = true; }
        }
      });
      if (!anySet) {
        await deleteScopeConfig(target.type, target.id, 'policy', actorType);
      } else {
        await setQuotaPolicy(body);
      }
      setShowQuotaEditor(false);
      setQuotaTarget(null);
      await load();
    } catch (e) {
      const violations = e?.response?.data?.violations;
      const msg = Array.isArray(violations) && violations.length
        ? violations.join('\n\n')
        : e?.response?.data?.message || e?.message || 'Please try again.';
      Alert.alert("Couldn't save", msg);
    } finally {
      setSavingQuota(false);
    }
  };

  const clearQuota = async () => {
    const target = quotaTarget || data?.node;
    if (!target?.type || target?.id === undefined) return;
    setSavingQuota(true);
    try {
      await deleteScopeConfig(target.type, target.id, 'policy', actorType);
      setShowQuotaEditor(false);
      setQuotaTarget(null);
      await load();
    } catch (e) {
      Alert.alert('Failed', e?.response?.data?.message || e?.message || 'Could not clear');
    } finally {
      setSavingQuota(false);
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
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <ScreenIntroCard
          title="AI Tutor Policies"
          description={actorType === 'student'
            ? "Requests & tokens are one shared pool that splits fairly across active students, top-down from the global total. Set a number to reserve a fixed share; leave it blank to auto-split whatever's left. Per-message caps aren't pooled."
            : "Every level is either Inherit (uses the closest parent's setting) or Custom (its own on/off + limits)."}
          icon="git-merge-outline"
          tone="violet"
        />

        <View style={styles.actorSwitch}>
          <TouchableOpacity
            style={[styles.actorTab, actorType === 'student' && styles.actorTabActive]}
            onPress={() => switchActor('student')}
          >
            <Text style={[styles.actorTabText, actorType === 'student' && styles.actorTabTextActive]}>Students</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actorTab, actorType === 'teacher' && styles.actorTabActive]}
            onPress={() => switchActor('teacher')}
          >
            <Text style={[styles.actorTabText, actorType === 'teacher' && styles.actorTabTextActive]}>Teachers</Text>
          </TouchableOpacity>
        </View>
        {actorType === 'teacher' && (
          <Text style={styles.actorNote}>
            Teacher limits are shared by every teacher at that level (e.g. all uploads at a campus count against one pool) — not per-teacher.
          </Text>
        )}

        {/* Breadcrumbs */}
        {stack.length > 1 && (
          <View style={styles.breadcrumbRow}>
            {stack.map((s, i) => (
              <TouchableOpacity key={`${s.type}#${s.id}`} onPress={() => goUp(i)} style={styles.crumb}>
                <Text style={[styles.crumbText, i === stack.length - 1 && styles.crumbTextActive]}>
                  {s.name}{i < stack.length - 1 ? '  ›' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!!error && <Text style={styles.errorBanner}>{error}</Text>}

        {data && !data.is_root && node && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{TYPE_LABEL[node.type]}: {node.name}</Text>
            {actorType === 'student' && typeof node.student_count === 'number' && (
              <Text style={styles.subtle}>{node.student_count.toLocaleString()} student{node.student_count === 1 ? '' : 's'} here</Text>
            )}

            <View style={styles.statusRow}>
              <View style={[
                styles.statusPill,
                effFlag?.is_enabled === true && styles.statusOn,
                effFlag?.is_enabled === false && styles.statusOff,
              ]}>
                <Text style={styles.statusPillText}>AI is currently {effFlag?.is_enabled ? 'ON' : 'OFF'}</Text>
              </View>
              <Text style={styles.subtle}>
                {node.own_flag === null ? `Inherited from ${effFlag?.from_name || 'global default'}` : 'Set directly on this level'}
              </Text>
            </View>

            <View style={styles.triRow}>
              <TriButton label="Inherit" active={node.own_flag === null} onPress={() => setNodeFlag(node.type, node.id, null, 'node')} busy={busyId === 'node'} />
              <TriButton label="ON" active={node.own_flag?.is_enabled === true} onPress={() => setNodeFlag(node.type, node.id, true, 'node')} busy={busyId === 'node'} color="#16a34a" />
              <TriButton label="OFF" active={node.own_flag?.is_enabled === false} onPress={() => setNodeFlag(node.type, node.id, false, 'node')} busy={busyId === 'node'} color="#dc2626" />
            </View>

            <Text style={styles.sectionLabel}>{actorType === 'student' ? 'Shared pool (this node\'s share)' : 'Current limits in effect'}</Text>
            <View style={styles.quotaGrid}>
              {POOLED_FIELDS.map((f) => {
                const eff = effPolicy[f.key] || { value: null, from_name: 'unlimited' };
                return <QuotaCell key={f.key} field={f} eff={eff} pooled={actorType === 'student'} />;
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Per-message caps (not pooled)</Text>
            <View style={styles.quotaGrid}>
              {CAP_FIELDS.map((f) => {
                const eff = effPolicy[f.key] || { value: null, from_name: 'unlimited' };
                return <QuotaCell key={f.key} field={f} eff={eff} pooled={false} />;
              })}
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={openQuotaEditor}>
                <Text style={styles.primaryBtnText}>{node.own_policy ? 'Edit limits' : 'Set custom limits'}</Text>
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
        {(data?.is_root || childHasChildren(current.type)) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{CHILD_LABEL_PLURAL[current.type] || 'children'} ({filteredChildren.length})</Text>

            {(data?.children || []).length > 8 && (
              <TextInput style={styles.search} placeholder="Filter by name…" value={filter} onChangeText={setFilter} />
            )}

            {loading && !data && <ActivityIndicator style={{ marginVertical: 24 }} />}

            {!loading && filteredChildren.length === 0 && (
              <Text style={styles.empty}>
                {data?.is_root ? 'Nothing to manage at Level 1.' : `No ${CHILD_LABEL_PLURAL[current.type] || 'children'} under this node.`}
              </Text>
            )}

            {filteredChildren.map((child) => (
              <ChildRow
                key={`${child.type}#${child.id}`}
                child={child}
                canDrillIn={childHasChildren(child.type)}
                busy={busyId === `${child.type}#${child.id}`}
                onTriState={(v) => setNodeFlag(child.type, child.id, v, `${child.type}#${child.id}`)}
                onEditQuota={() => openQuotaEditorFor(child)}
                onDrillIn={() => goInto(child)}
              />
            ))}
          </View>
        )}

        {user?.role === 'super_admin' && (
          <TouchableOpacity style={styles.advancedLink} onPress={() => navigation.navigate('AdminAiPolicyAdvanced')}>
            <Text style={styles.advancedLinkText}>Edit system-wide defaults →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {showQuotaEditor && (() => {
        const modalTarget = quotaTarget || node;
        const modalEffPolicy = modalTarget?.effective_policy || effPolicy;
        return (
        <View style={styles.modalBackdrop} pointerEvents="auto">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Limits for {modalTarget?.name}</Text>
            <Text style={styles.modalHelp}>
              {actorType === 'student'
                ? 'Pooled fields: leave blank to auto-share the parent pool by active student count, or set a number to reserve that exact amount off the top. Per-message caps: leave blank for unlimited, or set a flat ceiling.'
                : 'Leave a field blank for unlimited, or set a fixed number for this level.'}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {POLICY_FIELDS.map((f) => {
                const eff = modalEffPolicy[f.key];
                const placeholder = !eff || eff.value === null ? 'Unlimited' : `${eff.value} (${actorType === 'student' && POOLED_KEYS.has(f.key) && eff.source !== 'manual' ? 'auto share' : 'from'} ${eff.from_name})`;
                return (
                  <View key={f.key} style={styles.modalField}>
                    <Text style={styles.modalFieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      placeholder={placeholder}
                      placeholderTextColor="#9ca3af"
                      value={quotaDraft[f.key] ?? ''}
                      onChangeText={(v) => setQuotaDraft({ ...quotaDraft, [f.key]: numericOnly(v) })}
                    />
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => { setShowQuotaEditor(false); setQuotaTarget(null); }}
                disabled={savingQuota}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveQuota} disabled={savingQuota}>
                {savingQuota ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        );
      })()}
    </SafeAreaView>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function QuotaCell({ field, eff, pooled }) {
  const sb = eff.share_basis;
  return (
    <View style={styles.quotaCell}>
      <Text style={styles.quotaLabel}>{field.label}</Text>
      <Text style={styles.quotaValue}>{eff.value === null ? 'Unlimited' : eff.value.toLocaleString()}</Text>
      {eff.is_override ? (
        <Text style={styles.quotaFromOwn}>Reserved here</Text>
      ) : pooled && sb ? (
        <Text style={styles.quotaFromInherited}>
          auto share: {sb.my_students}/{sb.non_manual_students} active students of {sb.parent_pool?.toLocaleString?.() ?? '—'} from {eff.from_name}
        </Text>
      ) : (
        <Text style={styles.quotaFromInherited}>from {eff.from_name}</Text>
      )}
    </View>
  );
}

function TriButton({ label, active, onPress, busy, color }) {
  return (
    <TouchableOpacity
      style={[styles.triBtn, active && { backgroundColor: color || '#2563eb', borderColor: color || '#2563eb' }]}
      onPress={onPress}
      disabled={busy}
    >
      {busy && active
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={[styles.triBtnText, active && styles.triBtnTextActive]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ChildRow({ child, canDrillIn, busy, onTriState, onEditQuota, onDrillIn }) {
  const ownFlag = child.own_flag;
  const isOwn = ownFlag !== null;
  const isCustomQuota = !!child.own_policy;
  const canGoIn = canDrillIn && child.has_children;

  const monthlyTokens = child.effective_policy?.monthly_tokens;
  const shareLine = monthlyTokens
    ? (monthlyTokens.value === null
        ? null
        : `${monthlyTokens.is_override ? 'Reserved' : 'Auto share'}: ${monthlyTokens.value.toLocaleString()} tok/mo`)
    : null;

  return (
    <View style={styles.childRow}>
      <TouchableOpacity style={styles.childMain} onPress={onDrillIn} disabled={!canGoIn}>
        <View style={styles.childNameRow}>
          <Text style={styles.childName} numberOfLines={1}>{child.name}</Text>
          <View style={[styles.dot, (isOwn ? ownFlag.is_enabled : true) ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.childStatusText}>{isOwn ? (ownFlag.is_enabled ? 'ON' : 'OFF') : 'inherit'}</Text>
        </View>
        {!!child.student_count && <Text style={styles.childMetaMuted}>{child.student_count.toLocaleString()} student{child.student_count === 1 ? '' : 's'}</Text>}
        {!!shareLine && <Text style={isCustomQuota ? styles.childMetaManual : styles.childMetaMuted}>{shareLine}</Text>}
      </TouchableOpacity>

      <View style={styles.childActions}>
        <TouchableOpacity style={styles.quotaBtn} onPress={onEditQuota}>
          <Text style={styles.quotaBtnText}>Limits</Text>
        </TouchableOpacity>
        <SmallTri label="Inh" active={!isOwn} onPress={() => onTriState(null)} busy={busy} />
        <SmallTri label="ON" active={ownFlag?.is_enabled === true} onPress={() => onTriState(true)} busy={busy} color="#16a34a" />
        <SmallTri label="OFF" active={ownFlag?.is_enabled === false} onPress={() => onTriState(false)} busy={busy} color="#dc2626" />
        {canGoIn && (
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
      style={[styles.smallTri, active && { backgroundColor: color || '#2563eb', borderColor: color || '#2563eb' }]}
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

  actorSwitch: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 6, backgroundColor: '#eef2ff', borderRadius: 12, padding: 4, gap: 4 },
  actorTab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  actorTabActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3 },
  actorTabText: { fontSize: 13, fontWeight: '700', color: '#6366f1' },
  actorTabTextActive: { color: '#1e3a8a' },
  actorNote: { fontSize: 11, color: C.textMed, fontStyle: 'italic', marginHorizontal: 16, marginBottom: 10, lineHeight: 16 },

  breadcrumbRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, marginBottom: 8 },
  crumb: { marginRight: 2 },
  crumbText: { fontSize: 12, color: C.textLight },
  crumbTextActive: { color: C.primary, fontWeight: '700' },

  card: { ...S.card, padding: 16, marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },

  statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#e5e7eb', marginRight: 8 },
  statusOn: { backgroundColor: '#dcfce7' },
  statusOff: { backgroundColor: '#fee2e2' },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#111827' },
  subtle: { fontSize: 12, color: C.textMed, lineHeight: 18 },

  triRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
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
  perStudentNote: { fontSize: 11, color: C.textMed, lineHeight: 16, marginTop: 6, fontStyle: 'italic' },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  dangerBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  dangerBtnText: { color: '#b91c1c', fontWeight: '700' },

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
  childMetaManual: { fontSize: 11, color: '#b45309', marginTop: 2, fontWeight: '700' },
  childMetaMuted: { fontSize: 11, color: C.textLight, marginTop: 2, fontStyle: 'italic' },

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

  modalBackdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 12,
  },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  modalHelp: { fontSize: 12, color: C.textMed, marginBottom: 10, lineHeight: 18 },
  modalField: { marginBottom: 8 },
  modalFieldLabel: { fontSize: 12, color: C.textMed, marginBottom: 4, fontWeight: '600' },
  modalInput: { ...S.input, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: C.textDark, marginBottom: 0 },
  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#f3f4f6' },
  modalBtnGhostText: { color: '#374151', fontWeight: '700' },
  modalBtnPrimary: { backgroundColor: '#2563eb' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '700' },
});
