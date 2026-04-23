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
  const [role, setRole] = useState('teacher');

  const [teacherForm, setTeacherForm] = useState({
    first_name: '', last_name: '', email: '', password: '', phone: ''
  });
  const [studentForm, setStudentForm] = useState({ roll_no: '', email: '', password: '', phone: '' });

  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState({});
  const [formError, setFormError] = useState('');
  const [focus,     setFocus]     = useState('');

  const cardAnim = useEntrance();
  const btnS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnS, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const setT = (key, value) => { setTeacherForm(p => ({ ...p, [key]: value })); setErrors(p => ({ ...p, [key]: '' })); };
  const setS = (key, value) => { setStudentForm(p => ({ ...p, [key]: value })); setErrors(p => ({ ...p, [key]: '' })); };

  const validate = () => {
    const e = {};
    if (role === 'teacher') {
      if (!teacherForm.first_name.trim()) e.first_name = 'First name is required.';
      if (!teacherForm.last_name.trim())  e.last_name  = 'Last name is required.';
      if (!teacherForm.email.trim())      e.email      = 'Email is required.';
      else if (!EMAIL_REGEX.test(teacherForm.email.trim())) e.email = 'Enter a valid email.';
      if (!teacherForm.password)          e.password   = 'Password is required.';
      else if (teacherForm.password.length < 6) e.password = 'Min 6 characters.';
    } else {
      if (!studentForm.roll_no.trim()) e.roll_no  = 'Roll number is required.';
      if (!studentForm.email.trim())   e.email    = 'Email is required.';
      else if (!EMAIL_REGEX.test(studentForm.email.trim())) e.email = 'Enter a valid email.';
      if (!studentForm.password)       e.password = 'Password is required.';
      else if (studentForm.password.length < 6) e.password = 'Min 6 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async () => {
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = role === 'teacher'
        ? { role: 'teacher', ...teacherForm }
        : { role: 'student', ...studentForm };
      await signup(payload);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Something went wrong. Please try again.';
      if (err?.response?.status === 409)      setErrors(p => ({ ...p, email: msg }));
      else if (err?.response?.status === 404) setErrors(p => ({ ...p, roll_no: msg }));
      else setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isFocused = (k) => focus === k;

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      <LinearGradient colors={['#0F0C29', '#1E1B4B', '#312E81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <HeaderBlobs />
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>✏️</Text>
        </View>
        <Text style={styles.heroTitle}>Create Account</Text>
        <Text style={styles.heroSub}>Register to get started</Text>
      </LinearGradient>

      <Animated.View style={[styles.card, cardAnim]}>
        {!!formError && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}

        <Text style={[S.label, { marginBottom: 10 }]}>I am a...</Text>
        <View style={styles.roleRow}>
          <Pressable
            style={[styles.roleBtn, role === 'teacher' && styles.roleBtnActive]}
            onPress={() => { setRole('teacher'); setErrors({}); }}
          >
            <Text style={styles.roleEmoji}>👨‍🏫</Text>
            <Text style={[styles.roleLabel, role === 'teacher' && styles.roleLabelActive]}>Teacher</Text>
          </Pressable>
          <Pressable
            style={[styles.roleBtn, role === 'student' && styles.roleBtnActive]}
            onPress={() => { setRole('student'); setErrors({}); }}
          >
            <Text style={styles.roleEmoji}>🎒</Text>
            <Text style={[styles.roleLabel, role === 'student' && styles.roleLabelActive]}>Student / Parent</Text>
          </Pressable>
        </View>

        {role === 'teacher' && (
          <>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={S.label}>First Name *</Text>
                <TextInput style={[S.input, errors.first_name && S.inputError, isFocused('first_name') && styles.inputFocus]}
                  placeholder="First Name" placeholderTextColor={C.textLight} value={teacherForm.first_name}
                  onFocus={() => setFocus('first_name')} onBlur={() => setFocus('')} onChangeText={v => setT('first_name', v)} />
                {!!errors.first_name && <Text style={S.errorText}>{errors.first_name}</Text>}
              </View>
              <View style={styles.half}>
                <Text style={S.label}>Last Name *</Text>
                <TextInput style={[S.input, errors.last_name && S.inputError, isFocused('last_name') && styles.inputFocus]}
                  placeholder="Last Name" placeholderTextColor={C.textLight} value={teacherForm.last_name}
                  onFocus={() => setFocus('last_name')} onBlur={() => setFocus('')} onChangeText={v => setT('last_name', v)} />
                {!!errors.last_name && <Text style={S.errorText}>{errors.last_name}</Text>}
              </View>
            </View>
            <Text style={[S.label, { marginTop: 4 }]}>Email Address *</Text>
            <TextInput style={[S.input, errors.email && S.inputError, isFocused('email') && styles.inputFocus]}
              placeholder="teacher@school.com" placeholderTextColor={C.textLight} keyboardType="email-address" autoCapitalize="none"
              value={teacherForm.email} onFocus={() => setFocus('email')} onBlur={() => setFocus('')} onChangeText={v => setT('email', v)} />
            {!!errors.email && <Text style={S.errorText}>{errors.email}</Text>}
            <Text style={[S.label, { marginTop: 4 }]}>Password *</Text>
            <TextInput style={[S.input, errors.password && S.inputError, isFocused('password') && styles.inputFocus]}
              placeholder="Min 6 characters" placeholderTextColor={C.textLight} secureTextEntry
              value={teacherForm.password} onFocus={() => setFocus('password')} onBlur={() => setFocus('')} onChangeText={v => setT('password', v)} />
            {!!errors.password && <Text style={S.errorText}>{errors.password}</Text>}
            <Text style={[S.label, { marginTop: 4 }]}>Phone (optional)</Text>
            <TextInput style={[S.input, isFocused('phone') && styles.inputFocus]}
              placeholder="Phone number" placeholderTextColor={C.textLight} keyboardType="phone-pad"
              value={teacherForm.phone} onFocus={() => setFocus('phone')} onBlur={() => setFocus('')} onChangeText={v => setT('phone', v)} />
          </>
        )}

        {role === 'student' && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Enter your Roll Number to link this account to your student record. Ask your teacher if you don't know it.
              </Text>
            </View>
            <Text style={S.label}>Roll Number *</Text>
            <TextInput style={[S.input, errors.roll_no && S.inputError, isFocused('roll_no') && styles.inputFocus]}
              placeholder="e.g. G1A-01" placeholderTextColor={C.textLight} autoCapitalize="characters"
              value={studentForm.roll_no} onFocus={() => setFocus('roll_no')} onBlur={() => setFocus('')} onChangeText={v => setS('roll_no', v)} />
            {!!errors.roll_no && <Text style={S.errorText}>{errors.roll_no}</Text>}
            <Text style={[S.label, { marginTop: 4 }]}>Email Address *</Text>
            <TextInput style={[S.input, errors.email && S.inputError, isFocused('email') && styles.inputFocus]}
              placeholder="your@email.com" placeholderTextColor={C.textLight} keyboardType="email-address" autoCapitalize="none"
              value={studentForm.email} onFocus={() => setFocus('email')} onBlur={() => setFocus('')} onChangeText={v => setS('email', v)} />
            {!!errors.email && <Text style={S.errorText}>{errors.email}</Text>}
            <Text style={[S.label, { marginTop: 4 }]}>Password *</Text>
            <TextInput style={[S.input, errors.password && S.inputError, isFocused('password') && styles.inputFocus]}
              placeholder="Min 6 characters" placeholderTextColor={C.textLight} secureTextEntry
              value={studentForm.password} onFocus={() => setFocus('password')} onBlur={() => setFocus('')} onChangeText={v => setS('password', v)} />
            {!!errors.password && <Text style={S.errorText}>{errors.password}</Text>}
            <Text style={[S.label, { marginTop: 4 }]}>Phone (optional)</Text>
            <TextInput style={[S.input, isFocused('sphone') && styles.inputFocus]}
              placeholder="Phone number" placeholderTextColor={C.textLight} keyboardType="phone-pad"
              value={studentForm.phone} onFocus={() => setFocus('sphone')} onBlur={() => setFocus('')} onChangeText={v => setS('phone', v)} />
          </>
        )}

        <Pressable onPress={handleSignUp} onPressIn={pIn} onPressOut={pOut} disabled={loading}>
          <Animated.View style={{ transform: [{ scale: btnS }], marginTop: 20 }}>
            <LinearGradient colors={['#6366F1', '#4F46E5', '#3730A3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradBtn}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnText}>Create Account  →</Text>}
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>Already have an account? </Text>
          <Text style={styles.linkAccent}>Sign In</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper:        { flex: 1, backgroundColor: '#0F0C29' },
  scrollContent:  { flexGrow: 1 },
  header:         { paddingHorizontal: 28, paddingTop: 52, paddingBottom: 36, alignItems: 'center', overflow: 'hidden' },
  logoCircle:     { width: 70, height: 70, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  logoEmoji:      { fontSize: 30 },
  heroTitle:      { fontSize: 26, fontWeight: '800', color: '#E0E7FF', letterSpacing: 0.5 },
  heroSub:        { fontSize: 13, color: '#818CF8', marginTop: 6 },
  card:           { flex: 1, backgroundColor: C.card, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 28, shadowOffset: { width: 0, height: -8 }, elevation: 20 },
  roleRow:        { flexDirection: 'row', gap: 12, marginBottom: 20 },
  roleBtn:        { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: C.border, backgroundColor: C.cardAlt },
  roleBtnActive:  { borderColor: C.primary, backgroundColor: C.primaryLight },
  roleEmoji:      { fontSize: 24, marginBottom: 4 },
  roleLabel:      { fontSize: 13, fontWeight: '600', color: C.textMed },
  roleLabelActive:{ color: C.primary },
  infoBox:        { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 16 },
  infoText:       { fontSize: 12, color: '#1D4ED8', lineHeight: 18 },
  row:            { flexDirection: 'row', gap: 12 },
  half:           { flex: 1 },
  inputFocus:     { borderColor: C.primary, borderWidth: 2, backgroundColor: '#F5F3FF' },
  gradBtn:        { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  formErrorBox:   { backgroundColor: C.errorBg, borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 16 },
  formErrorText:  { color: C.error, fontSize: 13, textAlign: 'center' },
  linkRow:        { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText:       { color: C.textMed, fontSize: 14 },
  linkAccent:     { color: C.primary, fontSize: 14, fontWeight: '700' },
});