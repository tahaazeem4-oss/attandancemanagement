import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Animated, Alert,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, StatusBar, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { C } from '../config/theme';
import { LogoHero } from '../components/Logo';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState({});
  const [formError, setFormError] = useState('');
  const [focus,     setFocus]     = useState('');
  const [showPw,    setShowPw]    = useState(false);

  const cardY    = useRef(new Animated.Value(48)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardFade, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.spring(cardY,    { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const btnScale = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const validate = () => {
    const e = {};
    if (!email.trim())                        e.email    = 'Email is required.';
    else if (!EMAIL_REGEX.test(email.trim())) e.email    = 'Enter a valid email.';
    if (!password)                            e.password = 'Password is required.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleLogin = async () => {
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Invalid email or password.';
      if (err?.response?.status === 401) setErrors({ password: msg });
      else setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Reset Password',
      'Please contact your school administrator to reset your password.',
      [{ text: 'OK' }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />

      <View style={styles.hero}>
        <View style={styles.deco1} pointerEvents="none" />
        <View style={styles.deco2} pointerEvents="none" />
        <LogoHero markSize={72} />
      </View>

      <Animated.View style={[styles.card, { opacity: cardFade, transform: [{ translateY: cardY }] }]}>
        <View style={{ paddingBottom: 8 }}>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.sub}>Sign in to your account</Text>

          {!!formError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          )}

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputErr, focus === 'email' && styles.inputFocus]}
            placeholder="teacher@school.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            value={email}
            onFocus={() => setFocus('email')}
            onBlur={() => setFocus('')}
            onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: '' })); }}
          />
          {!!errors.email && <Text style={styles.fieldErr}>{errors.email}</Text>}

          <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
          <View style={styles.pwWrap}>
            <TextInput
              style={[styles.input, styles.pwInput, errors.password && styles.inputErr, focus === 'password' && styles.inputFocus]}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showPw}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              value={password}
              onFocus={() => setFocus('password')}
              onBlur={() => setFocus('')}
              onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: '' })); }}
            />
            <Pressable onPress={() => setShowPw(p => !p)} style={styles.eyeBtn} hitSlop={8}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94A3B8" />
            </Pressable>
          </View>
          {!!errors.password && <Text style={styles.fieldErr}>{errors.password}</Text>}

          <Pressable onPress={handleForgotPassword} style={styles.forgotRow}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable onPress={handleLogin} onPressIn={pIn} onPressOut={pOut} disabled={loading}>
            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Sign In</Text>
                }
              </LinearGradient>
            </Animated.View>
          </Pressable>

          <Pressable style={styles.signupRow} onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.signupText}>New here? </Text>
            <Text style={styles.signupLink}>Create an account</Text>
          </Pressable>
        </View>
      </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2563EB' },

  hero: {
    flex: 0.40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  deco1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -100, right: -80,
  },
  deco2: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -40, left: -40,
  },

  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 28, paddingTop: 32, paddingBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.16,
    shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  heading: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  sub:     { fontSize: 14, color: '#64748B', marginBottom: 24 },

  errorBanner:     { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorBannerText: { color: '#DC2626', fontSize: 13, textAlign: 'center' },

  label: {
    fontSize: 12, fontWeight: '700', color: '#475569',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7,
  },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: '#0F172A',
  },
  inputErr:   { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  inputFocus: {
    borderColor: '#2563EB', backgroundColor: '#EFF6FF',
    shadowColor: '#2563EB', shadowOpacity: 0.12, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 }, elevation: 2,
  },
  fieldErr: { color: '#EF4444', fontSize: 12, marginTop: 4, marginLeft: 2 },

  pwWrap:  { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingRight: 46 },
  eyeBtn:  { position: 'absolute', right: 14, height: '100%', justifyContent: 'center' },

  forgotRow:  { alignItems: 'flex-end', marginTop: 10, marginBottom: 22 },
  forgotText: { color: '#2563EB', fontSize: 13, fontWeight: '600' },

  btn: {
    borderRadius: 13, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#1D4ED8', shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  signupRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  signupText: { color: '#64748B', fontSize: 14 },
  signupLink: { color: '#2563EB', fontSize: 14, fontWeight: '700' },
});
