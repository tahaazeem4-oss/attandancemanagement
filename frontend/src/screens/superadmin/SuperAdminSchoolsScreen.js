import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal, Image,
  StyleSheet, ActivityIndicator, StatusBar, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { C, S } from '../../config/theme';

// ── OrgFormModal — add/edit an organization (school) ─────────
function OrgFormModal({ visible, org, onClose, onSaved }) {
  const [name,    setName]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setName(org ? org.name : '');
    setError('');
  }, [org, visible]);

  const handleSave = async () => {
    if (!name.trim()) { setError('School name is required.'); return; }
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>{org ? 'Edit School' : 'Add New School'}</Text>
          {!!error && <View style={modal.errorBox}><Text style={modal.errorText}>{error}</Text></View>}
          <Text style={S.label}>School Name *</Text>
          <TextInput
            style={S.input}
            placeholder="e.g. Sunrise Academy"
            placeholderTextColor={C.textLight}
            value={name}
            onChangeText={setName}
          />
          <View style={modal.btnRow}>
            <Pressable style={modal.cancelBtn} onPress={onClose}>
              <Text style={modal.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={modal.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={modal.saveText}>{org ? 'Update' : 'Add School'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── CampusFormModal — add/edit a campus (with branding) ───────
function CampusFormModal({ visible, campus, orgId, onClose, onSaved }) {
  const [form,      setForm]      = useState({ name: '', tagline: '', initials: '', logo_url: '', primary_color: '#2563EB', accent_color: '#1D4ED8' });
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (campus) {
      setForm({
        name:          campus.name          || '',
        tagline:       campus.tagline       || '',
        initials:      campus.initials      || '',
        logo_url:      campus.logo_url      || '',
        primary_color: campus.primary_color || '#2563EB',
        accent_color:  campus.accent_color  || '#1D4ED8',
      });
    } else {
      setForm({ name: '', tagline: '', initials: '', logo_url: '', primary_color: '#2563EB', accent_color: '#1D4ED8' });
    }
    setError('');
  }, [campus, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const pickAndUploadLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset    = result.assets[0];
    const mimeType = asset.mimeType || asset.type || 'image/jpeg';
    const extFromMime = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const extFromUri  = asset.uri.split('.').pop().split('?')[0].toLowerCase();
    const validExts   = ['jpg', 'jpeg', 'png', 'webp'];
    const ext  = validExts.includes(extFromUri) ? extFromUri : extFromMime;
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    setUploading(true); setError('');
    try {
      const token = api.defaults.headers.common['Authorization'];
      let data;
      if (Platform.OS === 'web') {
        const blobRes = await fetch(asset.uri);
        const blob = await blobRes.blob();
        const fd = new FormData(); fd.append('logo', blob, `logo.${ext}`);
        const res = await fetch(`${api.defaults.baseURL}/upload/logo`, { method: 'POST', headers: { Authorization: token }, body: fd });
        data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
      } else {
        const fd = new FormData(); fd.append('logo', { uri: asset.uri, name: `logo.${ext}`, type: mime });
        const res = await fetch(`${api.defaults.baseURL}/upload/logo`, { method: 'POST', headers: { Authorization: token }, body: fd });
        data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
      }
      setF('logo_url', data.logo_url);
    } catch (e) {
      setError(e?.message || 'Upload failed. Please try again.');
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Campus name is required.'); return; }
    setLoading(true);
    try {
      if (campus) {
        await api.put(`/super-admin/schools/${campus.id}`, form);
      } else {
        await api.post('/super-admin/schools', { ...form, org_id: orgId });
      }
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save campus.');
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <ScrollView style={modal.sheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={modal.title}>{campus ? 'Edit Campus' : 'Add New Campus'}</Text>
          {!!error && <View style={modal.errorBox}><Text style={modal.errorText}>{error}</Text></View>}

          <Text style={S.label}>Campus Name *</Text>
          <TextInput style={S.input} placeholder="e.g. Main Campus" placeholderTextColor={C.textLight}
            value={form.name} onChangeText={v => setF('name', v)} />
          <Text style={S.label}>Tagline</Text>
          <TextInput style={S.input} placeholder="Attendance Management System" placeholderTextColor={C.textLight}
            value={form.tagline} onChangeText={v => setF('tagline', v)} />
          <Text style={S.label}>Initials (2–3 letters shown in badge)</Text>
          <TextInput style={S.input} placeholder="e.g. MC" placeholderTextColor={C.textLight}
            maxLength={3} autoCapitalize="characters"
            value={form.initials} onChangeText={v => setF('initials', v)} />

          <Text style={S.label}>Campus Logo</Text>
          <View style={modal.logoRow}>
            {form.logo_url
              ? <Image source={{ uri: form.logo_url }} style={modal.logoThumb} />
              : <View style={modal.logoPlaceholder}><Text style={modal.logoPlaceholderText}>No logo</Text></View>}
            <View style={{ flex: 1, gap: 8 }}>
              <Pressable style={modal.uploadBtn} onPress={pickAndUploadLogo} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={modal.uploadBtnText}>📁  Choose Image File</Text>}
              </Pressable>
              {!!form.logo_url && (
                <Pressable onPress={() => setF('logo_url', '')}>
                  <Text style={modal.removeLogoText}>✕ Remove logo</Text>
                </Pressable>
              )}
            </View>
          </View>

          <Text style={S.label}>Primary Color (hex)</Text>
          <TextInput style={S.input} placeholder="#2563EB" placeholderTextColor={C.textLight}
            value={form.primary_color} onChangeText={v => setF('primary_color', v)} />
          <Text style={S.label}>Accent Color (hex)</Text>
          <TextInput style={S.input} placeholder="#1D4ED8" placeholderTextColor={C.textLight}
            value={form.accent_color} onChangeText={v => setF('accent_color', v)} />

          <View style={modal.btnRow}>
            <Pressable style={modal.cancelBtn} onPress={onClose}>
              <Text style={modal.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={modal.saveBtn} onPress={handleSave} disabled={loading || uploading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={modal.saveText}>{campus ? 'Update' : 'Add Campus'}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────
function ConfirmModal({ visible, title, message, confirmLabel = 'Delete', onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={confirm.overlay} onPress={onCancel}>
        <Pressable style={confirm.box} onPress={() => {}}>
          <View style={confirm.iconWrap}><Text style={confirm.icon}>🗑</Text></View>
          <Text style={confirm.title}>{title}</Text>
          <Text style={confirm.message}>{message}</Text>
          <View style={confirm.btnRow}>
            <Pressable style={confirm.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={confirm.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={confirm.confirmBtn} onPress={onConfirm} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={confirm.confirmText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── AddAdminModal ─────────────────────────────────────────────
function AddAdminModal({ visible, campusId, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => { setForm({ first_name: '', last_name: '', email: '', password: '' }); setError(''); }, [visible]);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setError('All fields are required.'); return;
    }
    setLoading(true);
    try {
      await api.post(`/super-admin/schools/${campusId}/admins`, form);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add admin.');
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>Add Campus Admin</Text>
          {!!error && <View style={modal.errorBox}><Text style={modal.errorText}>{error}</Text></View>}
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
          <TextInput style={S.input} placeholder="admin@school.com" placeholderTextColor={C.textLight}
            keyboardType="email-address" autoCapitalize="none"
            value={form.email} onChangeText={v => setF('email', v)} />
          <Text style={S.label}>Password *</Text>
          <TextInput style={S.input} placeholder="Min 6 characters" placeholderTextColor={C.textLight}
            secureTextEntry value={form.password} onChangeText={v => setF('password', v)} />
          <View style={modal.btnRow}>
            <Pressable style={modal.cancelBtn} onPress={onClose}><Text style={modal.cancelText}>Cancel</Text></Pressable>
            <Pressable style={modal.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={modal.saveText}>Add Admin</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── EditAdminModal ────────────────────────────────────────────
function EditAdminModal({ visible, admin, campusId, onClose, onSaved }) {
  const [form,        setForm]        = useState({ first_name: '', last_name: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [resetting,   setResetting]   = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (admin) setForm({ first_name: admin.first_name, last_name: admin.last_name, email: admin.email });
    setNewPassword(''); setError('');
  }, [admin, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleUpdate = async () => {
    if (!form.first_name || !form.last_name || !form.email) { setError('All fields are required.'); return; }
    setLoading(true); setError('');
    try {
      await api.put(`/super-admin/schools/${campusId}/admins/${admin.id}`, form);
      onSaved({ ...admin, ...form });
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to update admin.');
    } finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setResetting(true); setError('');
    try {
      await api.post(`/super-admin/schools/${campusId}/admins/${admin.id}/reset-password`, { new_password: newPassword });
      setNewPassword('');
      Alert.alert('Success', 'Password reset successfully.');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to reset password.');
    } finally { setResetting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <ScrollView style={[modal.sheet, { maxHeight: '90%' }]} contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={modal.title}>Edit Admin</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}><Text style={{ fontSize: 20, color: C.textLight }}>✕</Text></Pressable>
          </View>
          {!!error && <View style={modal.errorBox}><Text style={modal.errorText}>{error}</Text></View>}
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
          <Pressable style={editModal.primaryBtn} onPress={handleUpdate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={editModal.primaryBtnText}>Save Changes</Text>}
          </Pressable>
          <View style={modal.divider} />
          <Text style={modal.sectionLabel}>Reset Password</Text>
          <TextInput style={S.input} placeholder="New password (min 6 chars)" placeholderTextColor={C.textLight}
            secureTextEntry value={newPassword} onChangeText={setNewPassword} />
          <Pressable style={editModal.resetBtn} onPress={handleResetPassword} disabled={resetting}>
            {resetting ? <ActivityIndicator color={C.primary} /> : <Text style={editModal.resetBtnText}>🔑  Reset Password</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── CampusCard ────────────────────────────────────────────────
function CampusCard({ campus, admins, onEditCampus, onDeleteCampus, onAddAdmin, onEditAdmin, onDeleteAdmin }) {
  return (
    <View style={styles.campusCard}>
      {/* Campus header */}
      <View style={styles.campusHeader}>
        {campus.logo_url ? (
          <Image source={{ uri: campus.logo_url }} style={styles.campusLogo} />
        ) : (
          <LinearGradient
            colors={[campus.primary_color || '#2563EB', campus.accent_color || '#1D4ED8']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.campusInitialsBadge}
          >
            <Text style={styles.campusInitialsText}>{campus.initials || campus.name.slice(0, 2).toUpperCase()}</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.campusName}>{campus.name}</Text>
          <Text style={styles.campusMeta}>
            {campus.teacher_count ?? 0} teachers · {campus.student_count ?? 0} students · {campus.admin_count ?? 0} admins
          </Text>
        </View>
      </View>

      {/* Campus actions */}
      <View style={styles.campusActions}>
        <Pressable style={styles.editBtn} onPress={() => onEditCampus(campus)}>
          <Text style={styles.editBtnText}>✏️  Edit</Text>
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={() => onDeleteCampus(campus)}>
          <Text style={styles.deleteBtnText}>🗑  Delete</Text>
        </Pressable>
      </View>

      {/* Admins */}
      <View style={styles.adminsSection}>
        <View style={styles.adminsTitleRow}>
          <Text style={styles.adminsTitle}>Admins</Text>
          <Pressable style={styles.addAdminBtn} onPress={() => onAddAdmin(campus.id)}>
            <Text style={styles.addAdminText}>+ Add Admin</Text>
          </Pressable>
        </View>
        {!admins
          ? <ActivityIndicator size="small" color={C.primary} />
          : admins.length === 0
            ? <Text style={styles.noAdmins}>No admins yet.</Text>
            : admins.map(adm => (
              <View key={adm.id} style={styles.adminCard}>
                <View style={styles.adminRow}>
                  <View style={styles.adminAvatar}>
                    <Text style={styles.adminAvatarText}>{adm.first_name[0]}{adm.last_name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adminName}>{adm.first_name} {adm.last_name}</Text>
                    <Text style={styles.adminEmail}>{adm.email}</Text>
                  </View>
                </View>
                <View style={styles.adminActionRow}>
                  <Pressable style={styles.adminEditBtnFull} onPress={() => onEditAdmin(campus.id, adm)}>
                    <Text style={styles.adminEditBtnFullText}>✏️  Edit</Text>
                  </Pressable>
                  <Pressable style={styles.adminDeleteBtn} onPress={() => onDeleteAdmin(campus.id, adm)}>
                    <Text style={styles.adminDeleteBtnText}>🗑  Delete</Text>
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
export default function SuperAdminSchoolsScreen() {
  const [orgs,        setOrgs]        = useState([]);
  const [campusesMap, setCampusesMap] = useState({});   // orgId → [campus]
  const [adminsMap,   setAdminsMap]   = useState({});   // campusId → [admin]
  const [loading,     setLoading]     = useState(true);

  // Modals
  const [orgModal,    setOrgModal]    = useState({ open: false, org: null });
  const [campusModal, setCampusModal] = useState({ open: false, campus: null, orgId: null });
  const [adminModal,  setAdminModal]  = useState({ open: false, campusId: null });
  const [editAdmin,   setEditAdmin]   = useState({ open: false, campusId: null, admin: null });

  // Delete confirms
  const [deleteOrgPending,    setDeleteOrgPending]    = useState(null); // org
  const [deleteCampusPending, setDeleteCampusPending] = useState(null); // campus
  const [deleteAdminPending,  setDeleteAdminPending]  = useState(null); // {campusId, admin}
  const [deleting, setDeleting] = useState(false);

  const loadAdmins = useCallback(async (campusId) => {
    try {
      const { data } = await api.get(`/super-admin/schools/${campusId}/admins`);
      setAdminsMap(p => ({ ...p, [campusId]: data }));
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
      const map = {};
      orgsData.forEach(o => { map[o.id] = []; });
      // Campuses without an org go into a catch-all (shouldn't happen after migration)
      schoolsData.forEach(s => {
        if (s.org_id && map[s.org_id]) {
          map[s.org_id].push(s);
        }
      });

      setOrgs(orgsData);
      setCampusesMap(map);

      // Load admins for all campuses
      schoolsData.forEach(s => loadAdmins(s.id));
    } catch { } finally { setLoading(false); }
  }, [loadAdmins]);

  useEffect(() => { loadData(); }, []);

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
      Alert.alert('Error', e?.response?.data?.message || 'Failed to delete school.');
    } finally { setDeleting(false); }
  };

  // Delete campus
  const confirmDeleteCampus = async () => {
    if (!deleteCampusPending) return;
    setDeleting(true);
    try {
      await api.delete(`/super-admin/schools/${deleteCampusPending.id}`);
      setDeleteCampusPending(null);
      loadData();
    } catch (e) {
      setDeleteCampusPending(null);
      Alert.alert('Error', e?.response?.data?.message || 'Failed to delete campus.');
    } finally { setDeleting(false); }
  };

  // Delete admin
  const confirmDeleteAdmin = async () => {
    if (!deleteAdminPending) return;
    const { campusId, admin } = deleteAdminPending;
    setDeleting(true);
    try {
      await api.delete(`/super-admin/schools/${campusId}/admins/${admin.id}`);
      setAdminsMap(p => ({ ...p, [campusId]: p[campusId].filter(a => a.id !== admin.id) }));
      setDeleteAdminPending(null);
      loadData();
    } catch (e) {
      setDeleteAdminPending(null);
      Alert.alert('Error', e?.response?.data?.message || 'Failed to remove admin.');
    } finally { setDeleting(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Schools</Text>
        <Pressable style={styles.addBtn} onPress={() => setOrgModal({ open: true, org: null })}>
          <Text style={styles.addBtnText}>+ Add School</Text>
        </Pressable>
      </View>

      {loading
        ? <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        : orgs.length === 0
          ? <Text style={styles.empty}>No schools yet. Tap "Add School" to create the first one.</Text>
          : orgs.map(org => (
            <View key={org.id} style={styles.orgCard}>
              {/* Org header */}
              <View style={styles.orgHeader}>
                <View style={styles.orgIcon}>
                  <Text style={styles.orgIconText}>🏫</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orgName}>{org.name}</Text>
                  <Text style={styles.orgMeta}>{(campusesMap[org.id] || []).length} campus(es)</Text>
                </View>
                <View style={styles.orgActions}>
                  <Pressable style={styles.orgEditBtn} onPress={() => setOrgModal({ open: true, org })}>
                    <Text style={styles.orgEditBtnText}>✏️</Text>
                  </Pressable>
                  <Pressable style={styles.orgDeleteBtn} onPress={() => setDeleteOrgPending(org)}>
                    <Text style={styles.orgDeleteBtnText}>🗑</Text>
                  </Pressable>
                </View>
              </View>

              {/* Campuses */}
              <View style={styles.campusesContainer}>
                <View style={styles.campusesTitleRow}>
                  <Text style={styles.campusesLabel}>CAMPUSES</Text>
                  <Pressable
                    style={styles.addCampusBtn}
                    onPress={() => setCampusModal({ open: true, campus: null, orgId: org.id })}
                  >
                    <Text style={styles.addCampusBtnText}>+ Add Campus</Text>
                  </Pressable>
                </View>

                {(campusesMap[org.id] || []).length === 0
                  ? <Text style={styles.noCampuses}>No campuses yet. Tap "+ Add Campus" to add one.</Text>
                  : (campusesMap[org.id] || []).map(campus => (
                    <CampusCard
                      key={campus.id}
                      campus={campus}
                      admins={adminsMap[campus.id]}
                      onEditCampus={(c) => setCampusModal({ open: true, campus: c, orgId: org.id })}
                      onDeleteCampus={(c) => setDeleteCampusPending(c)}
                      onAddAdmin={(id) => setAdminModal({ open: true, campusId: id })}
                      onEditAdmin={(id, adm) => setEditAdmin({ open: true, campusId: id, admin: adm })}
                      onDeleteAdmin={(id, adm) => setDeleteAdminPending({ campusId: id, admin: adm })}
                    />
                  ))
                }
              </View>
            </View>
          ))
      }

      {/* Modals */}
      <OrgFormModal
        visible={orgModal.open}
        org={orgModal.org}
        onClose={() => setOrgModal({ open: false, org: null })}
        onSaved={() => { setOrgModal({ open: false, org: null }); loadData(); }}
      />
      <CampusFormModal
        visible={campusModal.open}
        campus={campusModal.campus}
        orgId={campusModal.orgId}
        onClose={() => setCampusModal({ open: false, campus: null, orgId: null })}
        onSaved={() => { setCampusModal({ open: false, campus: null, orgId: null }); loadData(); }}
      />
      <AddAdminModal
        visible={adminModal.open}
        campusId={adminModal.campusId}
        onClose={() => setAdminModal({ open: false, campusId: null })}
        onSaved={() => {
          const cid = adminModal.campusId;
          setAdminModal({ open: false, campusId: null });
          loadAdmins(cid);
          loadData();
        }}
      />
      <EditAdminModal
        visible={editAdmin.open}
        campusId={editAdmin.campusId}
        admin={editAdmin.admin}
        onClose={() => setEditAdmin({ open: false, campusId: null, admin: null })}
        onSaved={() => {
          const cid = editAdmin.campusId;
          setEditAdmin({ open: false, campusId: null, admin: null });
          loadAdmins(cid);
        }}
      />

      {/* Delete confirms */}
      <ConfirmModal
        visible={!!deleteOrgPending}
        title="Delete School"
        message={deleteOrgPending ? `Delete "${deleteOrgPending.name}"? All campuses must be deleted first.` : ''}
        loading={deleting}
        onCancel={() => setDeleteOrgPending(null)}
        onConfirm={confirmDeleteOrg}
      />
      <ConfirmModal
        visible={!!deleteCampusPending}
        title="Delete Campus"
        message={deleteCampusPending ? `Delete campus "${deleteCampusPending.name}"? This cannot be undone.` : ''}
        loading={deleting}
        onCancel={() => setDeleteCampusPending(null)}
        onConfirm={confirmDeleteCampus}
      />
      <ConfirmModal
        visible={!!deleteAdminPending}
        title="Remove Admin"
        message={deleteAdminPending ? `Remove ${deleteAdminPending.admin?.first_name} ${deleteAdminPending.admin?.last_name}? This cannot be undone.` : ''}
        confirmLabel="Remove"
        loading={deleting}
        onCancel={() => setDeleteAdminPending(null)}
        onConfirm={confirmDeleteAdmin}
      />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  topBar:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  pageTitle:     { fontSize: 22, fontWeight: '800', color: C.textDark },
  addBtn:        { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty:         { textAlign: 'center', color: C.textLight, marginTop: 60, fontSize: 14, paddingHorizontal: 40 },

  // Org card
  orgCard:       { marginHorizontal: 16, marginBottom: 16, borderRadius: 18, backgroundColor: C.card, shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4, overflow: 'hidden' },
  orgHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 },
  orgIcon:       { width: 42, height: 42, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  orgIconText:   { fontSize: 22 },
  orgName:       { fontSize: 17, fontWeight: '800', color: C.textDark },
  orgMeta:       { fontSize: 12, color: C.textLight, marginTop: 2 },
  orgActions:    { flexDirection: 'row', gap: 6 },
  orgEditBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: C.cardAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  orgEditBtnText:{ fontSize: 14 },
  orgDeleteBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  orgDeleteBtnText: { fontSize: 14 },

  // Campuses container
  campusesContainer: { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  campusesTitleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  campusesLabel:     { fontSize: 11, fontWeight: '700', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.8 },
  addCampusBtn:      { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addCampusBtnText:  { color: C.primary, fontSize: 12, fontWeight: '700' },
  noCampuses:        { color: C.textLight, fontSize: 13, fontStyle: 'italic', paddingBottom: 10 },

  // Campus card (nested)
  campusCard:        { backgroundColor: C.cardAlt, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  campusHeader:      { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  campusInitialsBadge: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  campusInitialsText:  { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  campusLogo:        { width: 38, height: 38, borderRadius: 10, resizeMode: 'cover' },
  campusName:        { fontSize: 15, fontWeight: '700', color: C.textDark },
  campusMeta:        { fontSize: 11, color: C.textLight, marginTop: 1 },
  campusActions:     { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },

  // Buttons (reused for campus)
  editBtn:           { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: C.card, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  editBtnText:       { color: C.textMed, fontSize: 12, fontWeight: '600' },
  deleteBtn:         { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteBtnText:     { color: '#DC2626', fontSize: 12, fontWeight: '600' },

  // Admins section (inside campus card)
  adminsSection:     { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 12, paddingVertical: 12 },
  adminsTitleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  adminsTitle:       { fontSize: 11, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5 },
  addAdminBtn:       { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addAdminText:      { color: C.primary, fontSize: 12, fontWeight: '700' },
  noAdmins:          { color: C.textLight, fontSize: 12, fontStyle: 'italic' },
  adminCard:         { backgroundColor: C.card, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  adminRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  adminAvatar:       { width: 32, height: 32, borderRadius: 9, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  adminAvatarText:   { color: C.primary, fontSize: 12, fontWeight: '800' },
  adminName:         { fontSize: 13, fontWeight: '600', color: C.textDark },
  adminEmail:        { fontSize: 11, color: C.textLight },
  adminActionRow:    { flexDirection: 'row', gap: 8 },
  adminEditBtnFull:  { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: C.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  adminEditBtnFullText: { color: C.textMed, fontSize: 11, fontWeight: '600' },
  adminDeleteBtn:    { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  adminDeleteBtnText:{ color: '#DC2626', fontSize: 11, fontWeight: '600' },
});

const confirm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  box:        { backgroundColor: C.card, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  iconWrap:   { width: 60, height: 60, borderRadius: 18, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  icon:       { fontSize: 26 },
  title:      { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8, textAlign: 'center' },
  message:    { fontSize: 14, color: C.textMed, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnRow:     { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textMed, fontWeight: '700', fontSize: 15 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#DC2626', alignItems: 'center' },
  confirmText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
});

const editModal = StyleSheet.create({
  primaryBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resetBtn:       { borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  resetBtnText:   { color: C.primary, fontWeight: '700', fontSize: 15 },
});

const modal = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  title:           { fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 16 },
  errorBox:        { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA' },
  errorText:       { color: '#DC2626', fontSize: 13 },
  logoRow:         { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  logoThumb:       { width: 72, height: 72, borderRadius: 14, resizeMode: 'cover', borderWidth: 1, borderColor: C.border },
  logoPlaceholder: { width: 72, height: 72, borderRadius: 14, backgroundColor: C.cardAlt, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  logoPlaceholderText: { color: C.textLight, fontSize: 11 },
  uploadBtn:       { borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  uploadBtnText:   { color: C.primary, fontWeight: '700', fontSize: 13 },
  removeLogoText:  { color: '#DC2626', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  btnRow:          { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:       { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  cancelText:      { color: C.textMed, fontWeight: '600', fontSize: 15 },
  saveBtn:         { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center' },
  saveText:        { color: '#fff', fontWeight: '700', fontSize: 15 },
  divider:         { height: 1, backgroundColor: C.border, marginVertical: 20 },
  sectionLabel:    { fontSize: 13, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
