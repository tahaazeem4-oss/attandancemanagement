import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen({ navigation }) {
  const { signup } = useAuth();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '', phone: ''
  });
  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState({});
  const [formError, setFormError] = useState('');

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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Create Teacher Account</Text>

      {/* General server error */}
      {!!formError && (
        <View style={styles.formErrorBox}>
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      )}

      <Text style={styles.label}>First Name *</Text>
      <TextInput
        style={[styles.input, errors.first_name && styles.inputError]}
        placeholder="First Name"
        value={form.first_name}
        onChangeText={v => setField('first_name', v)}
      />
      {!!errors.first_name && <Text style={styles.errorText}>{errors.first_name}</Text>}

      <Text style={styles.label}>Last Name *</Text>
      <TextInput
        style={[styles.input, errors.last_name && styles.inputError]}
        placeholder="Last Name"
        value={form.last_name}
        onChangeText={v => setField('last_name', v)}
      />
      {!!errors.last_name && <Text style={styles.errorText}>{errors.last_name}</Text>}

      <Text style={styles.label}>Email *</Text>
      <TextInput
        style={[styles.input, errors.email && styles.inputError]}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={form.email}
        onChangeText={v => setField('email', v)}
      />
      {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

      <Text style={styles.label}>Password *</Text>
      <TextInput
        style={[styles.input, errors.password && styles.inputError]}
        placeholder="Password (min 6 chars)"
        secureTextEntry
        value={form.password}
        onChangeText={v => setField('password', v)}
      />
      {!!errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

      <Text style={styles.label}>Phone (optional)</Text>
      <TextInput
        style={[styles.input, errors.phone && styles.inputError]}
        placeholder="Phone number"
        keyboardType="phone-pad"
        value={form.phone}
        onChangeText={v => setField('phone', v)}
      />
      {!!errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

      <TouchableOpacity style={styles.btn} onPress={handleSignUp} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Sign Up</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:     { flexGrow: 1, padding: 24, backgroundColor: '#F8FAFC' },
  title:         { fontSize: 24, fontWeight: '700', color: '#1E3A5F', marginBottom: 24, textAlign: 'center' },
  label:         { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:         {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff',
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
  link:          { marginTop: 16, textAlign: 'center', color: '#2563EB', fontSize: 14 }
});
