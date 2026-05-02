import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal, Image,
  StyleSheet, ActivityIndicator, StatusBar, Alert, Animated, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { C, S } from '../../config/theme';

// ── Add/Edit School Modal ─────────────────────────────────────
function SchoolFormModal({ visible, school, onClose, onSaved }) {
  const [form,      setForm]      = useState({ name: '', tagline: '', initials: '', logo_url: '', primary_color: '#2563EB', accent_color: '#1D4ED8' });
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (school) {
      setForm({
        name:          school.name          || '',
        tagline:       school.tagline       || '',
        initials:      school.initials      || '',
        logo_url:      school.logo_url      || '',
        primary_color: school.primary_color || '#2563EB',
        accent_color:  school.accent_color  || '#1D4ED8',
      });
    } else {
      setForm({ name: '', tagline: '', initials: '', logo_url: '', primary_color: '#2563EB', accent_color: '#1D4ED8' });
    }
    setError('');
  }, [school, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const pickAndUploadLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    // Derive extension from URI, mimeType, or fall back to jpg
    const mimeType = asset.mimeType || asset.type || 'image/jpeg';
    const extFromMime = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const extFromUri  = asset.uri.split('.').pop().split('?')[0].toLowerCase();
    const validExts   = ['jpg', 'jpeg', 'png', 'webp'];
    const ext  = validExts.includes(extFromUri) ? extFromUri : extFromMime;
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

    setUploading(true);
    setError('');
    try {
      const token = api.defaults.headers.common['Authorization'];
      let data;

      if (Platform.OS === 'web') {
        // On web: fetch blob from the picker URI, then POST with FormData
        const blobRes = await fetch(asset.uri);
        const blob = await blobRes.blob();
        const fd = new FormData();
        fd.append('logo', blob, `logo.${ext}`);
        const res = await fetch(`${api.defaults.baseURL}/upload/logo`, {
          method: 'POST',
          headers: { Authorization: token },
          body: fd,
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
      } else {
        // On native (iOS/Android): use fetch with FormData
        const fd = new FormData();
        fd.append('logo', { uri: asset.uri, name: `logo.${ext}`, type: mime });
        const res = await fetch(`${api.defaults.baseURL}/upload/logo`, {
          method: 'POST',
          headers: { Authorization: token },
          body: fd,
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
      }

      setF('logo_url', data.logo_url);
    } catch (e) {
      setError(e?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('School name is required.'); return; }
    setLoading(true);
    try {
      if (school) {
        await api.put(`/super-admin/schools/${school.id}`, form);
      } else {
        await api.post('/super-admin/schools', form);
      }
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save school.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <ScrollView style={modal.sheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={modal.title}>{school ? 'Edit School' : 'Add New School'}</Text>

          {!!error && <View style={modal.errorBox}><Text style={modal.errorText}>{error}</Text></View>}

          <Text style={S.label}>School Name *</Text>
          <TextInput style={S.input} placeholder="e.g. Sunrise Academy" placeholderTextColor={C.textLight}
            value={form.name} onChangeText={v => setF('name', v)} />
          <Text style={S.label}>Tagline</Text>
          <TextInput style={S.input} placeholder="Attendance Management System" placeholderTextColor={C.textLight}
            value={form.tagline} onChangeText={v => setF('tagline', v)} />
          <Text style={S.label}>Initials (2–3 letters shown in badge)</Text>
          <TextInput style={S.input} placeholder="e.g. SA" placeholderTextColor={C.textLight}
            maxLength={3} autoCapitalize="characters"
            value={form.initials} onChangeText={v => setF('initials', v)} />

          <Text style={S.label}>School Logo</Text>
          <View style={modal.logoRow}>
            {form.logo_url ? (
              <Image source={{ uri: form.logo_url }} style={modal.logoThumb} />
            ) : (
              <View style={modal.logoPlaceholder}>
                <Text style={modal.logoPlaceholderText}>No logo</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 8 }}>
              <Pressable style={modal.uploadBtn} onPress={pickAndUploadLogo} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <Text style={modal.uploadBtnText}>📁  Choose Image File</Text>}
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
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={modal.saveText}>{school ? 'Update' : 'Add School'}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────
function ConfirmModal({ visible, title, message, confirmLabel = 'Delete', onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={confirm.overlay} onPress={onCancel}>
        <Pressable style={confirm.box} onPress={() => {}}>
          <View style={confirm.iconWrap}>
            <Text style={confirm.icon}>🗑</Text>
          </View>
          <Text style={confirm.title}>{title}</Text>
          <Text style={confirm.message}>{message}</Text>
          <View style={confirm.btnRow}>
            <Pressable style={confirm.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={confirm.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={confirm.confirmBtn} onPress={onConfirm} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={confirm.confirmText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Add Admin Modal ───────────────────────────────────────────
function AddAdminModal({ visible, schoolId, onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setForm({ first_name: '', last_name: '', email: '', password: '' });
    setError('');
  }, [visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setError('All fields are required.'); return;
    }
    setLoading(true);
    try {
      await api.post(`/super-admin/schools/${schoolId}/admins`, form);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add admin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>Add School Admin</Text>
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

// ── Edit Admin Modal ──────────────────────────────────────────
function EditAdminModal({ visible, admin, schoolId, onClose, onSaved }) {
  const [form,        setForm]        = useState({ first_name: '', last_name: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [resetting,   setResetting]   = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (admin) setForm({ first_name: admin.first_name, last_name: admin.last_name, email: admin.email });
    setNewPassword('');
    setError('');
  }, [admin, visible]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleUpdate = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      setError('All fields are required.'); return;
    }
    setLoading(true); setError('');
    try {
      await api.put(`/super-admin/schools/${schoolId}/admins/${admin.id}`, form);
      onSaved({ ...admin, ...form });
    } catch (e) {
      console.error('Update admin error:', e?.response?.status, e?.response?.data, e?.message);
      setError(e?.response?.data?.message || `Failed to update admin (${e?.message || 'unknown error'})`);
    } finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }
    setResetting(true); setError('');
    try {
      await api.post(`/super-admin/schools/${schoolId}/admins/${admin.id}/reset-password`, { new_password: newPassword });
      setNewPassword('');
      Alert.alert('Success', 'Password reset successfully.');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to reset password.');
    } finally { setResetting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <ScrollView
          style={[modal.sheet, { maxHeight: '90%' }]}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={modal.title}>Edit Admin</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 20, color: C.textLight }}>✕</Text>
            </Pressable>
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

// ── Main Screen ───────────────────────────────────────────────
export default function SuperAdminSchoolsScreen() {
  const [schools,      setSchools]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [adminsMap,    setAdminsMap]    = useState({});
  const [deleteAdminPending, setDeleteAdminPending] = useState(null); // { schoolId, admin }
  const [deletingAdmin,      setDeletingAdmin]      = useState(false);
  const [schoolModal,  setSchoolModal]  = useState({ open: false, school: null });
  const [adminModal,   setAdminModal]   = useState({ open: false, schoolId: null });
  const [editAdmin,    setEditAdmin]    = useState({ open: false, schoolId: null, admin: null });

  const loadAdmins = useCallback(async (schoolId) => {
    try {
      const { data } = await api.get(`/super-admin/schools/${schoolId}/admins`);
      setAdminsMap(p => ({ ...p, [schoolId]: data }));
    } catch { }
  }, []);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/super-admin/schools');
      setSchools(data);
      // Load admins for every school in parallel
      data.forEach(sc => loadAdmins(sc.id));
    } catch { } finally { setLoading(false); }
  }, [loadAdmins]);

  useEffect(() => { loadSchools(); }, []);

  const deleteSchool = (school) => {
    Alert.alert('Delete School', `Delete "${school.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/super-admin/schools/${school.id}`);
            loadSchools();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.message || 'Failed to delete school.');
          }
        }
      }
    ]);
  };

  const removeAdmin = async () => {
    if (!deleteAdminPending) return;
    const { schoolId, admin } = deleteAdminPending;
    setDeletingAdmin(true);
    try {
      await api.delete(`/super-admin/schools/${schoolId}/admins/${admin.id}`);
      setAdminsMap(p => ({ ...p, [schoolId]: p[schoolId].filter(a => a.id !== admin.id) }));
      setDeleteAdminPending(null);
      loadSchools();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Delete failed';
      setDeleteAdminPending(null);
      Alert.alert('Error', msg);
    } finally {
      setDeletingAdmin(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Schools</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => setSchoolModal({ open: true, school: null })}
        >
          <Text style={styles.addBtnText}>+ Add School</Text>
        </Pressable>
      </View>

      {loading
        ? <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        : schools.length === 0
          ? <Text style={styles.empty}>No schools yet. Tap "Add School" to create the first one.</Text>
          : schools.map(sc => (
            <View key={sc.id} style={styles.schoolCard}>
              {/* School header row */}
              <View style={styles.schoolHeader}>
                {sc.logo_url ? (
                  <Image source={{ uri: sc.logo_url }} style={styles.schoolLogo} />
                ) : (
                  <LinearGradient
                    colors={[sc.primary_color || '#2563EB', sc.accent_color || '#1D4ED8']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.schoolInitialsBadge}
                  >
                    <Text style={styles.schoolInitialsText}>{sc.initials || sc.name.slice(0,2).toUpperCase()}</Text>
                  </LinearGradient>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.schoolName}>{sc.name}</Text>
                  <Text style={styles.schoolMeta}>
                    {sc.teacher_count ?? 0} teachers · {sc.student_count ?? 0} students · {sc.admin_count ?? 0} admins
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <Pressable style={styles.editBtn} onPress={() => setSchoolModal({ open: true, school: sc })}>
                  <Text style={styles.editBtnText}>✏️  Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteBtn} onPress={() => deleteSchool(sc)}>
                  <Text style={styles.deleteBtnText}>🗑  Delete</Text>
                </Pressable>
              </View>

              {/* Admins section — always visible */}
              <View style={styles.adminsSection}>
                <View style={styles.adminsTitleRow}>
                  <Text style={styles.adminsTitle}>Admins</Text>
                  <Pressable
                    style={styles.addAdminBtn}
                    onPress={() => setAdminModal({ open: true, schoolId: sc.id })}
                  >
                    <Text style={styles.addAdminText}>+ Add Admin</Text>
                  </Pressable>
                </View>
                {!adminsMap[sc.id]
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : adminsMap[sc.id].length === 0
                    ? <Text style={styles.noAdmins}>No admins yet.</Text>
                    : adminsMap[sc.id].map(adm => (
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
                          <Pressable
                            style={styles.adminEditBtnFull}
                            onPress={() => setEditAdmin({ open: true, schoolId: sc.id, admin: adm })}
                          >
                            <Text style={styles.adminEditBtnFullText}>✏️  Edit</Text>
                          </Pressable>
                          <Pressable
                            style={styles.adminDeleteBtn}
                            onPress={() => setDeleteAdminPending({ schoolId: sc.id, admin: adm })}
                          >
                            <Text style={styles.adminDeleteBtnText}>🗑  Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                }
              </View>
            </View>
          ))
      }

      {/* Modals */}
      <SchoolFormModal
        visible={schoolModal.open}
        school={schoolModal.school}
        onClose={() => setSchoolModal({ open: false, school: null })}
        onSaved={() => { setSchoolModal({ open: false, school: null }); setAdminsMap({}); loadSchools(); }}
      />
      <AddAdminModal
        visible={adminModal.open}
        schoolId={adminModal.schoolId}
        onClose={() => setAdminModal({ open: false, schoolId: null })}
        onSaved={() => {
          const sid = adminModal.schoolId;
          setAdminModal({ open: false, schoolId: null });
          loadAdmins(sid);
          loadSchools();
        }}
      />
      <EditAdminModal
        visible={editAdmin.open}
        schoolId={editAdmin.schoolId}
        admin={editAdmin.admin}
        onClose={() => setEditAdmin({ open: false, schoolId: null, admin: null })}
        onSaved={(updated) => {
          const sid = editAdmin.schoolId;
          setEditAdmin({ open: false, schoolId: null, admin: null });
          loadAdmins(sid);
        }}
      />
      <ConfirmModal
        visible={!!deleteAdminPending}
        title="Remove Admin"
        message={deleteAdminPending ? `Remove ${deleteAdminPending.admin.first_name} ${deleteAdminPending.admin.last_name} from this school? This cannot be undone.` : ''}
        confirmLabel="Remove"
        loading={deletingAdmin}
        onCancel={() => setDeleteAdminPending(null)}
        onConfirm={removeAdmin}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: C.bg },
  topBar:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  pageTitle:           { fontSize: 22, fontWeight: '800', color: C.textDark },
  addBtn:              { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText:          { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty:               { textAlign: 'center', color: C.textLight, marginTop: 60, fontSize: 14, paddingHorizontal: 40 },

  schoolCard:          { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, backgroundColor: C.card, shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4, overflow: 'hidden' },
  schoolHeader:        { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  schoolInitialsBadge: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  schoolInitialsText:  { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  schoolLogo:          { width: 46, height: 46, borderRadius: 13, resizeMode: 'cover' },
  schoolName:          { fontSize: 16, fontWeight: '800', color: C.textDark },
  schoolMeta:          { fontSize: 12, color: C.textLight, marginTop: 2 },
  expandArrow:         { color: C.textMed, fontSize: 13 },

  actionRow:           { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  editBtn:             { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: C.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  editBtnText:         { color: C.textMed, fontSize: 13, fontWeight: '600' },
  deleteBtn:           { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteBtnText:       { color: '#DC2626', fontSize: 13, fontWeight: '600' },

  adminsSection:       { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 16, paddingVertical: 14 },
  adminsTitleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  adminsTitle:         { fontSize: 13, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5 },
  addAdminBtn:         { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addAdminText:        { color: C.primary, fontSize: 12, fontWeight: '700' },
  noAdmins:            { color: C.textLight, fontSize: 13, fontStyle: 'italic' },
  adminCard:           { backgroundColor: C.cardAlt, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  adminRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  adminAvatar:         { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  adminAvatarText:     { color: C.primary, fontSize: 13, fontWeight: '800' },
  adminName:           { fontSize: 14, fontWeight: '600', color: C.textDark },
  adminEmail:          { fontSize: 12, color: C.textLight },
  adminActionRow:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  adminEditBtnFull:    { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: C.card, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  adminEditBtnFullText:{ color: C.textMed, fontSize: 12, fontWeight: '600' },
  adminDeleteBtn:      { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  adminDeleteBtnText:  { color: '#DC2626', fontSize: 12, fontWeight: '600' },
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
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  title:      { fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 16 },
  errorBox:   { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA' },
  errorText:  { color: '#DC2626', fontSize: 13 },
  logoPreview: { width: '100%', height: 80, borderRadius: 12, resizeMode: 'contain', backgroundColor: C.cardAlt, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  logoRow:         { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  logoThumb:       { width: 72, height: 72, borderRadius: 14, resizeMode: 'cover', borderWidth: 1, borderColor: C.border },
  logoPlaceholder: { width: 72, height: 72, borderRadius: 14, backgroundColor: C.cardAlt, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  logoPlaceholderText: { color: C.textLight, fontSize: 11 },
  uploadBtn:       { borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  uploadBtnText:   { color: C.primary, fontWeight: '700', fontSize: 13 },
  removeLogoText:  { color: C.error, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  btnRow:     { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textMed, fontWeight: '600', fontSize: 15 },
  saveBtn:    { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center' },
  saveText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  successBox:     { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#86EFAC' },
  successText:    { color: '#16A34A', fontSize: 13 },
  divider:        { height: 1, backgroundColor: C.border, marginVertical: 20 },
  sectionLabel:   { fontSize: 13, fontWeight: '700', color: C.textMed, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  resetBtn:       { borderWidth: 1.5, borderColor: C.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  resetBtnText:   { color: C.primary, fontWeight: '700', fontSize: 14 },
});
