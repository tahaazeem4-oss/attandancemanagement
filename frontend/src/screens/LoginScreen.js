import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Animated,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { C, S } from '../config/theme';
import { HeaderBlobs, useEntrance } from '../components/Deco';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState({});
  const [formError, setFormError] = useState('');
  const [focus,     setFocus]     = useState('');

  // Entrance: card slides up + fades in
  const cardAnim = useEntrance();
  // Button press scale
  const btnS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnS, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const validate = () => {
    const e = {};
    if (!email.trim())                      e.email    = 'Email is required.';
    else if (!EMAIL_REGEX.test(email.trim())) e.email    = 'Enter a valid email address.';
    if (!password)                           e.password = 'Password is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Invalid email or password.';
      // surface server error on the relevant field when possible
      if (err?.response?.status === 401) {
        setErrors({ password: msg });
      } else {
        setFormError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* ── Gradient hero with textured blobs ─────────────── */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.topSection}
      >
        <HeaderBlobs />
        <View style={{ alignItems: 'center' }}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🏫</Text>
          </View>
          <Text style={styles.appName}>EduTrack</Text>
          <Text style={styles.appTagline}>Attendance Management System</Text>
        </View>
      </LinearGradient>

      {/* ── Animated sliding card ─────────────────────────── */}
      <Animated.View style={[styles.card, cardAnim]}>
        <Text style={styles.cardTitle}>Welcome Back</Text>
        <Text style={styles.cardSub}>Sign in to your teacher account</Text>

        {!!formError && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}

        <Text style={S.label}>Email Address</Text>
        <TextInput
          style={[S.input, errors.email && S.inputError, focus === 'email' && styles.inputFocus]}
          placeholder="teacher@school.com"
          placeholderTextColor={C.textLight}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus('')}
          onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: '' })); }}
        />
        {!!errors.email && <Text style={S.errorText}>{errors.email}</Text>}

        <Text style={[S.label, { marginTop: 6 }]}>Password</Text>
        <TextInput
          style={[S.input, errors.password && S.inputError, focus === 'password' && styles.inputFocus]}
          placeholder="Enter your password"
          placeholderTextColor={C.textLight}
          secureTextEntry
          value={password}
          onFocus={() => setFocus('password')}
          onBlur={() => setFocus('')}
          onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: '' })); }}
        />
        {!!errors.password && <Text style={S.errorText}>{errors.password}</Text>}

        {/* Gradient animated button */}
        <Pressable onPress={handleLogin} onPressIn={pIn} onPressOut={pOut} disabled={loading}>
          <Animated.View style={{ transform: [{ scale: btnS }], marginTop: 14 }}>
            <LinearGradient
              colors={['#6366F1', '#4F46E5', '#3730A3']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.gradBtn}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnText}>Sign In  →</Text>}
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <Pressable
          style={({ hovered }) => [styles.linkRow, hovered && { opacity: 0.65 }]}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.linkText}>New teacher? </Text>
          <Text style={styles.linkAccent}>Create an account</Text>
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#0F0C29' },

  topSection:   {
    flex: 0.42,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 20,
    overflow: 'hidden',
  },
  logoCircle:   {
    width: 84, height: 84, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: '#6366F1', shadowOpacity: 0.7, shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  logoEmoji:    { fontSize: 38 },
  appName:      { fontSize: 30, fontWeight: '800', color: '#E0E7FF', letterSpacing: 1 },
  appTagline:   { fontSize: 13, color: '#818CF8', marginTop: 6, letterSpacing: 0.3 },

  card:         {
    flex: 0.58,
    backgroundColor: C.card,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 28, paddingTop: 30, paddingBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 }, elevation: 20,
  },
  cardTitle:    { fontSize: 24, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  cardSub:      { fontSize: 14, color: C.textLight, marginBottom: 22 },

  inputFocus:   {
    borderColor: C.primary, borderWidth: 2,
    shadowColor: C.primary, shadowOpacity: 0.2,
    shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4,
    backgroundColor: '#F5F3FF',
  },
  gradBtn:      {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#4F46E5', shadowOpacity: 0.5, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  formErrorBox:  {
    backgroundColor: C.errorBg, borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  formErrorText: { color: C.error, fontSize: 13, textAlign: 'center' },
  linkRow:      { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText:     { color: C.textMed, fontSize: 14 },
  linkAccent:   { color: C.primary, fontSize: 14, fontWeight: '700' },
});

