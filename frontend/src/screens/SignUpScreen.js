import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, Animated,
  StyleSheet, ScrollView, ActivityIndicator, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { C, S } from '../config/theme';
import { HeaderBlobs, useEntrance } from '../components/Deco';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen({ navigation }) {
  const { signup } = useAuth();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '', phone: ''
  });
  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState({});
  const [formError, setFormError] = useState('');
  const [focus,     setFocus]     = useState('');

  // Entrance animation for form card
  const cardAnim = useEntrance();
  // Button press scale
  const btnS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnS, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const setField = (key, value) => {
    setForm(p => ({ ...p, [key]: value }));
    setErrors(p => ({ ...p, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.first_name.trim())                e.first_name = 'First name is required.';
    if (!form.last_name.trim())                 e.last_name  = 'Last name is required.';
    if (!form.email.trim())                     e.email      = 'Email is required.';
    else if (!EMAIL_REGEX.test(form.email.trim())) e.email   = 'Enter a valid email address.';
    if (!form.password)                         e.password   = 'Password is required.';
    else if (form.password.length < 6)          e.password   = 'Password must be at least 6 characters.';
    if (form.phone && !/^\+?[\d\s\-]{7,15}$/.test(form.phone))
                                                e.phone      = 'Enter a valid phone number.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async () => {
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await signup(form);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Something went wrong. Please try again.';
      // surface server errors on the right field
      if (err?.response?.status === 409) {
        setErrors(p => ({ ...p, email: 'This email is already registered.' }));
      } else {
        setFormError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* ── Gradient hero with blobs ──────────────────────── */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>✏️</Text>
        </View>
        <Text style={styles.heroTitle}>Create Account</Text>
        <Text style={styles.heroSub}>Register as a teacher to get started</Text>
      </LinearGradient>

      {/* ── Animated form card ───────────────────────────── */}
      <Animated.View style={[styles.card, cardAnim]}>
        {!!formError && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={S.label}>First Name *</Text>
            <TextInput
              style={[S.input, errors.first_name && S.inputError, focus === 'first_name' && styles.inputFocus]}
              placeholder="First Name" placeholderTextColor={C.textLight}
              value={form.first_name}
              onFocus={() => setFocus('first_name')} onBlur={() => setFocus('')}
              onChangeText={v => setField('first_name', v)}
            />
            {!!errors.first_name && <Text style={S.errorText}>{errors.first_name}</Text>}
          </View>
          <View style={styles.half}>
            <Text style={S.label}>Last Name *</Text>
            <TextInput
              style={[S.input, errors.last_name && S.inputError, focus === 'last_name' && styles.inputFocus]}
              placeholder="Last Name" placeholderTextColor={C.textLight}
              value={form.last_name}
              onFocus={() => setFocus('last_name')} onBlur={() => setFocus('')}
              onChangeText={v => setField('last_name', v)}
            />
            {!!errors.last_name && <Text style={S.errorText}>{errors.last_name}</Text>}
          </View>
        </View>

        <Text style={[S.label, { marginTop: 4 }]}>Email Address *</Text>
        <TextInput
          style={[S.input, errors.email && S.inputError, focus === 'email' && styles.inputFocus]}
          placeholder="teacher@school.com" placeholderTextColor={C.textLight}
          keyboardType="email-address" autoCapitalize="none"
          value={form.email}
          onFocus={() => setFocus('email')} onBlur={() => setFocus('')}
          onChangeText={v => setField('email', v)}
        />
        {!!errors.email && <Text style={S.errorText}>{errors.email}</Text>}

        <Text style={[S.label, { marginTop: 4 }]}>Password *</Text>
        <TextInput
          style={[S.input, errors.password && S.inputError, focus === 'password' && styles.inputFocus]}
          placeholder="Min 6 characters" placeholderTextColor={C.textLight}
          secureTextEntry
          value={form.password}
          onFocus={() => setFocus('password')} onBlur={() => setFocus('')}
          onChangeText={v => setField('password', v)}
        />
        {!!errors.password && <Text style={S.errorText}>{errors.password}</Text>}

        <Text style={[S.label, { marginTop: 4 }]}>Phone (optional)</Text>
        <TextInput
          style={[S.input, errors.phone && S.inputError, focus === 'phone' && styles.inputFocus]}
          placeholder="Phone number" placeholderTextColor={C.textLight}
          keyboardType="phone-pad"
          value={form.phone}
          onFocus={() => setFocus('phone')} onBlur={() => setFocus('')}
          onChangeText={v => setField('phone', v)}
        />
        {!!errors.phone && <Text style={S.errorText}>{errors.phone}</Text>}

        {/* Gradient animated button */}
        <Pressable onPress={handleSignUp} onPressIn={pIn} onPressOut={pOut} disabled={loading}>
          <Animated.View style={{ transform: [{ scale: btnS }], marginTop: 16 }}>
            <LinearGradient
              colors={['#6366F1', '#4F46E5', '#3730A3']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.gradBtn}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnText}>Create Account  →</Text>}
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <Pressable
          style={({ hovered }) => [styles.linkRow, hovered && { opacity: 0.65 }]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.linkText}>Already have an account? </Text>
          <Text style={styles.linkAccent}>Sign In</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper:      { flex: 1, backgroundColor: '#0F0C29' },
  scrollContent: { flexGrow: 1 },

  header:       {
    paddingHorizontal: 28, paddingTop: 52, paddingBottom: 36,
    alignItems: 'center', overflow: 'hidden',
  },
  logoCircle:   {
    width: 70, height: 70, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    shadowColor: '#6366F1', shadowOpacity: 0.6, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  logoEmoji:    { fontSize: 30 },
  heroTitle:    { fontSize: 26, fontWeight: '800', color: '#E0E7FF', letterSpacing: 0.5 },
  heroSub:      { fontSize: 13, color: '#818CF8', marginTop: 6 },

  card:         {
    flex: 1,
    backgroundColor: C.card,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 }, elevation: 20,
  },
  row:          { flexDirection: 'row', gap: 12 },
  half:         { flex: 1 },
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
