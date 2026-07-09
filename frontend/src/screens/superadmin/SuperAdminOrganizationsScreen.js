import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal,
  StyleSheet, ActivityIndicator, StatusBar, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { C, S } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import ScreenIntroCard from '../../components/ScreenIntroCard';
import { useFocusEffect } from '@react-navigation/native';
import { toLocalPhone } from '../../lib/phoneUtils';

// ── Shared helpers ────────────────────────────────────────────
function ConfirmModal({ visible, title, message, confirmLabel = 'Delete', onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={cm.overlay} onPress={onCancel}>
        <Pressable style={cm.box} onPress={() => {}}>
          <View style={cm.iconWrap}><Text style={cm.icon}>🗑</Text></View>
          <Text style={cm.title}>{title}</Text>
          <Text style={cm.message}>{message}</Text>
          <View style={cm.btnRow}>
            <Pressable style={cm.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={cm.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={cm.confirmBtn} onPress={onConfirm} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={cm.confirmText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── OrgFormModal — add / edit an organization ─────────────────
function OrgFormModal({ visible, org, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setName(org ? org.name : ''); setError(''); }, [org, visible]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Organization name is required.'); return; }
    setLoading(true);
    try {
      if (org) {
        await api.put(`/super-admin/organizations/${org.id}`, { name: name.trim() });
      } else {
        await api.post('/super-admin/organizations', { name: name.trim() });
      }
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save.');
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <ScrollView contentContainerStyle={m.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={m.sheet}>
              <Text style={m.title}>{org ? 'Edit Organization' : 'Add Organization'}</Text>
              {!!error && <View style={m.errorBox}><Text style={m.errorText}>{error}</Text></View>}
              <Text style={S.label}>Organization Name *</Text>
              <TextInput
                style={S.input}
                placeholder="e.g. Sunrise Education Group"
                placeholderTextColor={C.textLight}
                value={name}
                onChangeText={setName}
              />
              <View style={m.btnRow}>
                <Pressable style={m.cancelBtn} onPress={onClose}>
                  <Text style={m.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={m.saveBtn} onPress={handleSave} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={m.saveText}>{org ? 'Update' : 'Add'}</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── AddOrgAdminModal ──────────────────────────────────────────
function AddOrgAdminModal({ visible, orgId, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', phone: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ first_name: '', last_name: '', email: '', password: '', phone: '' });
    setShowPw(false);
    setError('');
  }, [visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.password || !form.phone) {
      setError('All fields including phone are required.'); return;
    }
    if (!/^03[0-9]{9}$/.test(form.phone.trim())) {
      setError('Phone must be in format 03XXXXXXXXX (11 digits, starts with 03, no spaces).'); return;
    }
    setLoading(true);
    try {
      await api.post(`/super-admin/organizations/${orgId}/org-admins`, { ...form, phone: form.phone.trim() });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add org admin.');
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <Text style={m.title}>Add Organization Admin</Text>
          {!!error && <View style={m.errorBox}><Text style={m.errorText}>{error}</Text></View>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>First Name *</Text>
              <TextInput style={S.input} placeholder="First" placeholderTextColor={C.textLight}
                value={form.first_name} onChangeText={v => setF('first_name', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>Last Name *</Text>
              <TextInput style={S.input} placeholder="Last" placeholderTextColor={C.textLight}
                value={form.last_name} onChangeText={v => setF('last_name', v)} />
            </View>
          </View>
          <Text style={S.label}>Email *</Text>
          <TextInput style={S.input} placeholder="orgadmin@example.com" placeholderTextColor={C.textLight}
            keyboardType="email-address" autoCapitalize="none"
            value={form.email} onChangeText={v => setF('email', v)} />
          <Text style={S.label}>Phone * (03XXXXXXXXX)</Text>
          <TextInput style={S.input} placeholder="03XXXXXXXXX" placeholderTextColor={C.textLight}
            keyboardType="phone-pad" maxLength={11}
            value={form.phone} onChangeText={v => setF('phone', v)} />
          <Text style={S.label}>Password *</Text>
          <View style={m.passwordWrap}>
            <TextInput style={[S.input, m.passwordInput]} placeholder="Min 6 characters" placeholderTextColor={C.textLight}
              secureTextEntry={!showPw} value={form.password} onChangeText={v => setF('password', v)} />
            <Pressable onPress={() => setShowPw(p => !p)} style={m.eyeToggle} hitSlop={8}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
            </Pressable>
          </View>
          <View style={m.btnRow}>
            <Pressable style={m.cancelBtn} onPress={onClose}><Text style={m.cancelText}>Cancel</Text></Pressable>
            <Pressable style={m.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={m.saveText}>Add Admin</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── EditOrgAdminModal ─────────────────────────────────────────
function EditOrgAdminModal({ visible, admin, orgId, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [newPassword, setNewPassword] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (admin) setForm({ first_name: admin.first_name, last_name: admin.last_name, email: admin.email, phone: toLocalPhone(admin.phone) });
    setNewPassword(''); setShowResetPw(false); setError('');
  }, [admin, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleUpdate = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.phone) { setError('All fields including phone are required.'); return; }
    if (!/^03[0-9]{9}$/.test(form.phone.trim())) { setError('Phone must be in format 03XXXXXXXXX (11 digits, starts with 03).'); return; }
    setLoading(true); setError('');
    try {
      await api.put(`/super-admin/organizations/${orgId}/org-admins/${admin.id}`, { ...form, phone: form.phone.trim() });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to update.');
    } finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setResetting(true); setError('');
    try {
      await api.post(`/super-admin/organizations/${orgId}/org-admins/${admin.id}/reset-password`, { new_password: newPassword });
      setNewPassword('');
      Alert.alert('Success', 'Password reset successfully.');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to reset password.');
    } finally { setResetting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <ScrollView style={[m.sheet, { maxHeight: '90%' }]} contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={m.title}>Edit Org Admin</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}><Text style={{ fontSize: 20, color: C.textLight }}>✕</Text></Pressable>
          </View>
          {!!error && <View style={m.errorBox}><Text style={m.errorText}>{error}</Text></View>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>First Name *</Text>
              <TextInput style={S.input} placeholderTextColor={C.textLight}
                value={form.first_name} onChangeText={v => setF('first_name', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>Last Name *</Text>
              <TextInput style={S.input} placeholderTextColor={C.textLight}
                value={form.last_name} onChangeText={v => setF('last_name', v)} />
            </View>
          </View>
          <Text style={S.label}>Email *</Text>
          <TextInput style={S.input} placeholderTextColor={C.textLight}
            keyboardType="email-address" autoCapitalize="none"
            value={form.email} onChangeText={v => setF('email', v)} />
          <Text style={S.label}>Phone (03XXXXXXXXX)</Text>
          <TextInput style={S.input} placeholderTextColor={C.textLight}
            keyboardType="phone-pad" placeholder="03XXXXXXXXX" maxLength={11}
            value={form.phone} onChangeText={v => setF('phone', v)} />
          <Pressable style={em.primaryBtn} onPress={handleUpdate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={em.primaryBtnText}>Save Changes</Text>}
          </Pressable>
          <View style={m.divider} />
          <Text style={m.sectionLabel}>Reset Password</Text>
          <View style={m.passwordWrap}>
            <TextInput style={[S.input, m.passwordInput]} placeholder="New password (min 6 chars)" placeholderTextColor={C.textLight}
              secureTextEntry={!showResetPw} value={newPassword} onChangeText={setNewPassword} />
            <Pressable onPress={() => setShowResetPw(p => !p)} style={m.eyeToggle} hitSlop={8}>
              <Ionicons name={showResetPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
            </Pressable>
          </View>
          <Pressable style={em.resetBtn} onPress={handleResetPassword} disabled={resetting}>
            {resetting ? <ActivityIndicator color={C.primary} /> : <Text style={em.resetBtnText}>🔑  Reset Password</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── OrgCard ───────────────────────────────────────────────────
function OrgCard({ org, orgAdmins, campuses, onEdit, onDelete, onAddAdmin, onEditAdmin, onDeleteAdmin }) {
  return (
    <View style={styles.orgCard}>
      {/* Org header */}
      <View style={styles.orgHeader}>
        <View style={styles.orgIconBox}>
          <Text style={styles.orgEmoji}>🏢</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.orgName}>{org.name}</Text>
          <Text style={styles.orgMeta}>
            {campuses.length} campus{campuses.length !== 1 ? 'es' : ''}
            {orgAdmins ? `  ·  ${orgAdmins.length} org admin${orgAdmins.length !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        <View style={styles.actionBtns}>
          <Pressable style={styles.editBtn} onPress={() => onEdit(org)}>
            <Text style={styles.editBtnText}>✏️</Text>
          </Pressable>
          <Pressable style={styles.deleteBtn} onPress={() => onDelete(org)}>
            <Text style={styles.deleteBtnText}>🗑</Text>
          </Pressable>
        </View>
      </View>

      {/* Linked campuses (read-only badges) */}
      {campuses.length > 0 && (
        <View style={styles.campusBadgesWrap}>
          <Text style={styles.subSectionLabel}>CAMPUSES</Text>
          <View style={styles.badgeRow}>
            {campuses.map(c => (
              <View key={c.id} style={styles.campusBadge}>
                <Text style={styles.campusBadgeTxt}>{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Org Admins */}
      <View style={styles.adminsSection}>
        <View style={styles.adminsTitleRow}>
          <Text style={styles.subSectionLabel}>ORG ADMINS</Text>
          <Pressable style={styles.addAdminBtn} onPress={() => onAddAdmin(org.id)}>
            <Text style={styles.addAdminBtnText}>+ Add Admin</Text>
          </Pressable>
        </View>

        {!orgAdmins
          ? <ActivityIndicator size="small" color={C.primary} />
          : orgAdmins.length === 0
            ? <Text style={styles.emptyAdmins}>No org admins yet.</Text>
            : orgAdmins.map(adm => (
              <View key={adm.id} style={styles.adminCard}>
                <View style={styles.adminRow}>
                  <View style={styles.adminAvatar}>
                    <Text style={styles.adminAvatarText}>{adm.first_name[0]}{adm.last_name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adminName}>{adm.first_name} {adm.last_name}</Text>
                    <Text style={styles.adminEmail}>{adm.email}</Text>
                    {!!adm.phone && <Text style={styles.adminEmail}>{toLocalPhone(adm.phone)}</Text>}
                  </View>
                </View>
                <View style={styles.adminActionRow}>
                  <Pressable style={styles.adminEditBtn} onPress={() => onEditAdmin(org.id, adm)}>
                    <Text style={styles.adminEditBtnText}>✏️  Edit</Text>
                  </Pressable>
                  <Pressable style={styles.adminDelBtn} onPress={() => onDeleteAdmin(org.id, adm)}>
                    <Text style={styles.adminDelBtnText}>🗑  Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
        }
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function SuperAdminOrganizationsScreen({ navigation }) {
  const [orgs,       setOrgs]       = useState([]);
  const [campusMap,  setCampusMap]  = useState({}); // orgId → [campus]
  const [adminsMap,  setAdminsMap]  = useState({}); // orgId → [orgAdmin]
  const [loading,    setLoading]    = useState(true);

  // Modals
  const [orgModal,     setOrgModal]     = useState({ open: false, org: null });
  const [addAdminModal, setAddAdminModal] = useState({ open: false, orgId: null });
  const [editAdminModal, setEditAdminModal] = useState({ open: false, orgId: null, admin: null });

  // Delete confirms
  const [deleteOrgPending,   setDeleteOrgPending]   = useState(null);
  const [deleteAdminPending, setDeleteAdminPending] = useState(null); // { orgId, admin }
  const [deleting, setDeleting] = useState(false);

  const loadOrgAdmins = useCallback(async (orgId) => {
    try {
      const { data } = await api.get(`/super-admin/organizations/${orgId}/org-admins`);
      setAdminsMap(p => ({ ...p, [orgId]: data }));
    } catch { }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: orgsData }, { data: schoolsData }] = await Promise.all([
        api.get('/super-admin/organizations'),
        api.get('/super-admin/schools'),
      ]);

      // Group campuses by org_id
      const cMap = {};
      orgsData.forEach(o => { cMap[o.id] = []; });
      schoolsData.forEach(s => {
        if (s.org_id && cMap[s.org_id]) cMap[s.org_id].push(s);
      });

      setOrgs(orgsData);
      setCampusMap(cMap);

      // Load org admins for each org
      orgsData.forEach(o => loadOrgAdmins(o.id));
    } catch {
      Alert.alert('Error', 'Could not load organizations.');
    } finally { setLoading(false); }
  }, [loadOrgAdmins]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Delete org
  const confirmDeleteOrg = async () => {
    if (!deleteOrgPending) return;
    setDeleting(true);
    try {
      await api.delete(`/super-admin/organizations/${deleteOrgPending.id}`);
      setDeleteOrgPending(null);
      loadData();
    } catch (e) {
      setDeleteOrgPending(null);
      Alert.alert('Error', e?.response?.data?.message || 'Failed to delete organization.');
    } finally { setDeleting(false); }
  };

  // Delete org admin
  const confirmDeleteAdmin = async () => {
    if (!deleteAdminPending) return;
    const { orgId, admin } = deleteAdminPending;
    setDeleting(true);
    try {
      await api.delete(`/super-admin/organizations/${orgId}/org-admins/${admin.id}`);
      setDeleteAdminPending(null);
      loadOrgAdmins(orgId);
    } catch (e) {
      setDeleteAdminPending(null);
      Alert.alert('Error', e?.response?.data?.message || 'Failed to delete org admin.');
    } finally { setDeleting(false); }
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Organizations" navigation={navigation} />
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenIntroCard
          title="Organization Setup"
          description="Organizations sit above campuses. Create or edit them here before assigning campuses, campus admins, and higher-level policy controls."
          icon="business-outline"
          tone="blue"
        />
        <View style={styles.topBar}>
          <Text style={styles.subtitle}>{orgs.length} organization{orgs.length !== 1 ? 's' : ''}</Text>
          <Pressable style={styles.addOrgBtn} onPress={() => setOrgModal({ open: true, org: null })}>
            <Text style={styles.addOrgBtnText}>+ Add Organization</Text>
          </Pressable>
        </View>

        {loading
          ? <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 60 }} />
          : orgs.length === 0
            ? <Text style={styles.empty}>No organizations yet. Tap "+ Add Organization" to create one.</Text>
            : orgs.map(org => (
              <OrgCard
                key={org.id}
                org={org}
                orgAdmins={adminsMap[org.id]}
                campuses={campusMap[org.id] || []}
                onEdit={(o) => setOrgModal({ open: true, org: o })}
                onDelete={(o) => setDeleteOrgPending(o)}
                onAddAdmin={(id) => setAddAdminModal({ open: true, orgId: id })}
                onEditAdmin={(id, adm) => setEditAdminModal({ open: true, orgId: id, admin: adm })}
                onDeleteAdmin={(id, adm) => setDeleteAdminPending({ orgId: id, admin: adm })}
              />
            ))
        }
      </ScrollView>

      {/* Modals */}
      <OrgFormModal
        visible={orgModal.open}
        org={orgModal.org}
        onClose={() => setOrgModal({ open: false, org: null })}
        onSaved={() => { setOrgModal({ open: false, org: null }); loadData(); }}
      />
      <AddOrgAdminModal
        visible={addAdminModal.open}
        orgId={addAdminModal.orgId}
        onClose={() => setAddAdminModal({ open: false, orgId: null })}
        onSaved={() => {
          const id = addAdminModal.orgId;
          setAddAdminModal({ open: false, orgId: null });
          loadOrgAdmins(id);
        }}
      />
      <EditOrgAdminModal
        visible={editAdminModal.open}
        orgId={editAdminModal.orgId}
        admin={editAdminModal.admin}
        onClose={() => setEditAdminModal({ open: false, orgId: null, admin: null })}
        onSaved={() => {
          const id = editAdminModal.orgId;
          setEditAdminModal({ open: false, orgId: null, admin: null });
          loadOrgAdmins(id);
        }}
      />

      {/* Delete confirms */}
      <ConfirmModal
        visible={!!deleteOrgPending}
        title="Delete Organization"
        message={deleteOrgPending
          ? `Delete "${deleteOrgPending.name}"? All campuses must be removed from it first.`
          : ''}
        loading={deleting}
        onCancel={() => setDeleteOrgPending(null)}
        onConfirm={confirmDeleteOrg}
      />
      <ConfirmModal
        visible={!!deleteAdminPending}
        title="Remove Org Admin"
        message={deleteAdminPending
          ? `Remove ${deleteAdminPending.admin?.first_name} ${deleteAdminPending.admin?.last_name}?`
          : ''}
        confirmLabel="Remove"
        loading={deleting}
        onCancel={() => setDeleteAdminPending(null)}
        onConfirm={confirmDeleteAdmin}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  topBar:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  subtitle:   { fontSize: 13, color: C.textLight, fontWeight: '600' },
  addOrgBtn:  { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  addOrgBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty:      { textAlign: 'center', color: C.textLight, marginTop: 60, fontSize: 14, paddingHorizontal: 40 },

  // Org card
  orgCard:    { marginHorizontal: 16, marginBottom: 16, borderRadius: 18, backgroundColor: C.card, shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4, overflow: 'hidden' },
  orgHeader:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  orgIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  orgEmoji:   { fontSize: 22 },
  orgName:    { fontSize: 17, fontWeight: '800', color: C.textDark },
  orgMeta:    { fontSize: 12, color: C.textLight, marginTop: 2 },
  actionBtns: { flexDirection: 'row', gap: 6 },
  editBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: C.cardAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  editBtnText:{ fontSize: 14 },
  deleteBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteBtnText: { fontSize: 14 },

  // Campus badges
  campusBadgesWrap: { paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  badgeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  campusBadge: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#BFDBFE' },
  campusBadgeTxt: { color: '#2563EB', fontSize: 12, fontWeight: '600' },

  // Admins section
  adminsSection:  { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 16, paddingVertical: 12 },
  adminsTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  subSectionLabel: { fontSize: 10, fontWeight: '700', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.8 },
  addAdminBtn:    { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addAdminBtnText:{ color: C.primary, fontSize: 12, fontWeight: '700' },
  emptyAdmins:    { color: C.textLight, fontSize: 12, fontStyle: 'italic', marginBottom: 4 },

  adminCard:       { backgroundColor: C.cardAlt, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  adminRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  adminAvatar:     { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' },
  adminAvatarText: { color: '#7C3AED', fontSize: 13, fontWeight: '800' },
  adminName:       { fontSize: 13, fontWeight: '700', color: C.textDark },
  adminEmail:      { fontSize: 11, color: C.textLight },
  adminActionRow:  { flexDirection: 'row', gap: 8 },
  adminEditBtn:    { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: C.card, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  adminEditBtnText:{ color: C.textMed, fontSize: 11, fontWeight: '600' },
  adminDelBtn:     { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FFF7ED', alignItems: 'center', borderWidth: 1, borderColor: '#FDBA74' },
  adminDelBtnText: { color: '#9A3412', fontSize: 11, fontWeight: '600' },
});

const cm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  box:        { backgroundColor: C.card, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  iconWrap:   { width: 60, height: 60, borderRadius: 18, backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  icon:       { fontSize: 26 },
  title:      { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8, textAlign: 'center' },
  message:    { fontSize: 14, color: C.textMed, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnRow:     { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textMed, fontWeight: '700', fontSize: 15 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', alignItems: 'center' },
  confirmText:{ color: '#9A3412', fontWeight: '700', fontSize: 15 },
});

const em = StyleSheet.create({
  primaryBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resetBtn:       { borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  resetBtnText:   { color: C.primary, fontWeight: '700', fontSize: 15 },
});

const m = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll:  { flexGrow: 1, justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  title:        { fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 16 },
  errorBox:     { backgroundColor: '#FFF7ED', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FDBA74' },
  errorText:    { color: '#9A3412', fontSize: 13 },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput:{ paddingRight: 44 },
  eyeToggle:    { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
  btnRow:       { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  cancelText:   { color: C.textMed, fontWeight: '600', fontSize: 15 },
  saveBtn:      { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center' },
  saveText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  divider:      { height: 1, backgroundColor: C.border, marginVertical: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
