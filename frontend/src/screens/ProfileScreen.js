import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { C } from '../config/theme';

const ROLE_LABELS = {
  teacher:     'Teacher',
  admin:       'Admin',
  super_admin: 'Super Admin',
  student:     'Student',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, school, logout } = useAuth();

  const [oldPassword,     setOldPassword]     = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [showOld,         setShowOld]         = useState(false);
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const statusInset = StatusBar.currentHeight ?? 0;
  const headerTopPad = Math.max(insets.top, statusInset) + 18;

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Too Short', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (newPassword === oldPassword) {
      Alert.alert('Same Password', 'New password must be different from the current one.');
      return;
    }

    setLoading(true);
    try {
      await api.put('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      Alert.alert('Success', 'Password updated successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.brandDeep} translucent={false} />

      {/* ── Header ────────────────────────────────────────── */}
      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: headerTopPad }]}
      >
        <View style={styles.headerDeco} pointerEvents="none" />
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.nameText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {user?.first_name} {user?.last_name}
        </Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[user?.role] || user?.role}</Text>
        </View>
        {school && <Text style={styles.schoolText}>{school.name}</Text>}
      </LinearGradient>

      {/* ── Account Info ──────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account Info</Text>

        <View style={styles.infoRow}>
          <View style={styles.infoIcon}><Ionicons name="mail-outline" size={16} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
        </View>

        {user?.roll_no ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}><Ionicons name="id-card-outline" size={16} color={C.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Roll Number</Text>
              <Text style={styles.infoValue}>{user.roll_no}</Text>
            </View>
          </View>
        ) : null}

        {user?.class_name ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}><Ionicons name="library-outline" size={16} color={C.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Class</Text>
              <Text style={styles.infoValue}>{user.class_name} — {user.section_name}</Text>
            </View>
          </View>
        ) : null}

        {school ? (
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIcon}><Ionicons name="business-outline" size={16} color={C.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>School</Text>
              <Text style={styles.infoValue}>{school.name}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Change Password ───────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Change Password</Text>

        {/* Current password */}
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.input}
            placeholder="Current Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry={!showOld}
            value={oldPassword}
            onChangeText={setOldPassword}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Pressable onPress={() => setShowOld(v => !v)} style={styles.eyeBtn}>
            <Ionicons name={showOld ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
          </Pressable>
        </View>

        {/* New password */}
        <View style={styles.inputWrap}>
          <Ionicons name="lock-open-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry={!showNew}
            value={newPassword}
            onChangeText={setNewPassword}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Pressable onPress={() => setShowNew(v => !v)} style={styles.eyeBtn}>
            <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
          </Pressable>
        </View>

        {/* Confirm password */}
        <View style={styles.inputWrap}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry={!showConfirm}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleChangePassword}
          />
          <Pressable onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
            <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, (pressed || loading) && { opacity: 0.8 }]}
          onPress={handleChangePassword}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Update Password</Text>
          }
        </Pressable>
      </View>

      {/* ── Sign Out ──────────────────────────────────────── */}
      <Pressable
        onPress={() => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: logout },
        ])}
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingTop: 52, paddingBottom: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60,
  },
  avatarWrap: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  },
  avatarText:  { color: '#fff', fontSize: 28, fontWeight: '900' },
  nameText:    { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  roleBadge:   { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 6 },
  roleText:    { color: '#BFDBFE', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  schoolText:  { color: 'rgba(191,219,254,0.7)', fontSize: 12, marginTop: 2 },

  // ── Cards ──────────────────────────────────────────────
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginTop: 16, padding: 16,
    shadowColor: '#94A3B8', shadowOpacity: 0.10, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardTitle: {
    fontSize: 11, fontWeight: '800', color: C.textMed,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14,
  },

  // ── Info rows ──────────────────────────────────────────
  infoRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoIcon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  infoLabel: { fontSize: 11, color: C.textLight, fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 14, color: C.textDark, fontWeight: '500' },

  // ── Password inputs ────────────────────────────────────
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12, marginBottom: 12, paddingHorizontal: 12,
  },
  input:   { flex: 1, height: 50, color: C.textDark, fontSize: 15 },
  eyeBtn:  { padding: 6 },
  saveBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Sign Out ───────────────────────────────────────────
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16, padding: 16,
    backgroundColor: '#FEF2F2', borderRadius: 16,
  },
  signOutText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
});
