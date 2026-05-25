import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { C, S } from '../../config/theme';

const PHONE_REGEX = /^03[0-9]{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeIdentifier(val) {
  const v = val.trim();
  if (PHONE_REGEX.test(v)) {
    return '+92' + v.slice(1);
  }
  return v.toLowerCase();
}

export default function ParentLoginScreen({ navigation }) {
  const { parentLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const v = email.trim().replace(/[\s\-]/g, '');
    if (!email.trim() || !password) {
      setError('Email or phone, and password are required');
      return;
    }
    if (!PHONE_REGEX.test(email.trim()) && !EMAIL_REGEX.test(email.trim())) {
      setError('Enter a valid email, or phone in format 03XXXXXXXXX (11 digits, no spaces)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await parentLogin(normalizeIdentifier(email), password);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Login failed';
      setError(msg);
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.icon}>👨‍👩‍👧‍👦</Text>
          <Text style={styles.title}>Parent Portal</Text>
          <Text style={styles.subtitle}>Track all your children in one place</Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={S.label}>Email or Phone Number</Text>
        <TextInput
          style={S.input}
          placeholder="email@example.com  or  03XXXXXXXXX"
          keyboardType="default"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <Text style={S.label}>Password</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[S.input, styles.passwordInput]}
            placeholder="Enter password"
            secureTextEntry={!showPw}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <Pressable onPress={() => setShowPw(p => !p)} style={styles.eyeBtn} hitSlop={8}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
          </Pressable>
        </View>

        <Pressable
          style={[styles.loginBtn, loading && { opacity: 0.6 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.loginBtnTxt}>Login</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 40, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textMed, textAlign: 'center' },
  error: { backgroundColor: '#FEE2E2', color: '#DC2626', padding: 12, borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: '600' },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeBtn: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center' },
  loginBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  loginBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
