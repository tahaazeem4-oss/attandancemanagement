import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState({});
  const [formError, setFormError] = useState('');

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
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.appName}>🏫 Attendance</Text>
        <Text style={styles.subtitle}>School Management System</Text>

        {/* General server error */}
        {!!formError && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, errors.email && styles.inputError]}
          placeholder="teacher@school.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: '' })); }}
        />
        {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, errors.password && styles.inputError]}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: '' })); }}
        />
        {!!errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Login</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.link}>New teacher? Create account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper:       { flex: 1, backgroundColor: '#F8FAFC' },
  container:     { flex: 1, justifyContent: 'center', padding: 28 },
  appName:       { fontSize: 32, fontWeight: '800', color: '#1E3A5F', textAlign: 'center', marginBottom: 4 },
  subtitle:      { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 36 },
  label:         { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:         {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff',
    marginBottom: 4, fontSize: 15
  },
  inputError:    { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  errorText:     { color: '#DC2626', fontSize: 12, marginBottom: 10, marginLeft: 2 },
  formErrorBox:  {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 8, padding: 10, marginBottom: 16
  },
  formErrorText: { color: '#B91C1C', fontSize: 13, textAlign: 'center' },
  btn:           {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8
  },
  btnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  link:          { marginTop: 18, textAlign: 'center', color: '#2563EB', fontSize: 14 }
});
