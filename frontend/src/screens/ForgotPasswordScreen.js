import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation, route }) {
  const initialEmail = route?.params?.email || '';

  const [email, setEmail] = useState(String(initialEmail).trim().toLowerCase());
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [step, setStep] = useState('request');
  const [errors, setErrors] = useState({});

  const title = useMemo(() => {
    if (step === 'request') return 'Forgot Password';
    if (step === 'verify') return 'Verify Code';
    return 'Set New Password';
  }, [step]);

  const setFieldError = (key, value = '') => {
    setErrors((prev) => ({ ...prev, [key]: value }));
  };

  const validateEmail = () => {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned) {
      setFieldError('email', 'Email is required.');
      return false;
    }
    if (!EMAIL_REGEX.test(cleaned)) {
      setFieldError('email', 'Enter a valid email address.');
      return false;
    }
    return true;
  };

  const requestCode = async () => {
    setErrors({});
    if (!validateEmail()) return;

    setSending(true);
    try {
      const cleaned = email.trim().toLowerCase();
      setEmail(cleaned);
      const { data } = await api.post('/auth/forgot-password/request', { email: cleaned });
      Alert.alert('Check your email', data?.message || 'If your email is registered, we sent a verification code.');
      setStep('verify');
    } catch (err) {
      const message = err?.response?.data?.message || 'Could not send code right now. Please try again.';
      if (err?.response?.status === 429) {
        Alert.alert('Please wait', message);
      } else {
        setFieldError('email', message);
      }
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    setErrors({});
    const cleanedCode = code.trim();
    if (!/^\d{6}$/.test(cleanedCode)) {
      setFieldError('code', 'Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password/verify', {
        email: email.trim().toLowerCase(),
        code: cleanedCode,
      });
      setResetToken(data.reset_token);
      setStep('reset');
    } catch (err) {
      setFieldError('code', err?.response?.data?.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setErrors({});
    if (!newPassword || newPassword.length < 6) {
      setFieldError('newPassword', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError('confirmPassword', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password/reset', {
        reset_token: resetToken,
        new_password: newPassword,
      });

      Alert.alert('Password updated', data?.message || 'Your password has been reset.', [
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Login', { email: email.trim().toLowerCase() }),
        },
      ]);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Could not reset password. Please try again.';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('verify')) {
        setStep('verify');
      }
      Alert.alert('Reset failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {step === 'request' && 'Enter your registered email to receive a verification code.'}
            {step === 'verify' && 'Enter the 6-digit code sent to your email.'}
            {step === 'reset' && 'Create a new password for your account.'}
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputErr]}
            value={email}
            editable={step !== 'reset'}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@school.com"
            placeholderTextColor="#94A3B8"
            onChangeText={(v) => {
              setEmail(v);
              setFieldError('email');
            }}
          />
          {!!errors.email && <Text style={styles.fieldErr}>{errors.email}</Text>}

          {step === 'verify' && (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>Verification Code</Text>
              <TextInput
                style={[styles.input, errors.code && styles.inputErr]}
                value={code}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
                placeholderTextColor="#94A3B8"
                onChangeText={(v) => {
                  setCode(v.replace(/[^0-9]/g, ''));
                  setFieldError('code');
                }}
              />
              {!!errors.code && <Text style={styles.fieldErr}>{errors.code}</Text>}
            </>
          )}

          {step === 'reset' && (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>New Password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  style={[styles.input, styles.pwInput, errors.newPassword && styles.inputErr]}
                  value={newPassword}
                  secureTextEntry={!showPw}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor="#94A3B8"
                  onChangeText={(v) => {
                    setNewPassword(v);
                    setFieldError('newPassword');
                  }}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowPw((p) => !p)}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                </Pressable>
              </View>
              {!!errors.newPassword && <Text style={styles.fieldErr}>{errors.newPassword}</Text>}

              <Text style={[styles.label, { marginTop: 16 }]}>Confirm Password</Text>
              <View style={styles.pwWrap}>
                <TextInput
                  style={[styles.input, styles.pwInput, errors.confirmPassword && styles.inputErr]}
                  value={confirmPassword}
                  secureTextEntry={!showConfirmPw}
                  placeholder="Re-enter new password"
                  placeholderTextColor="#94A3B8"
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    setFieldError('confirmPassword');
                  }}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowConfirmPw((p) => !p)}>
                  <Ionicons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                </Pressable>
              </View>
              {!!errors.confirmPassword && <Text style={styles.fieldErr}>{errors.confirmPassword}</Text>}
            </>
          )}

          <Pressable
            style={[styles.primaryBtn, (loading || sending) && styles.btnDisabled]}
            onPress={step === 'request' ? requestCode : step === 'verify' ? verifyCode : resetPassword}
            disabled={loading || sending}
          >
            {(loading || sending) ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {step === 'request' && 'Send Verification Code'}
                {step === 'verify' && 'Verify Code'}
                {step === 'reset' && 'Reset Password'}
              </Text>
            )}
          </Pressable>

          {step !== 'request' && (
            <Pressable
              style={styles.secondaryBtn}
              onPress={requestCode}
              disabled={loading || sending}
            >
              <Text style={styles.secondaryText}>Resend Code</Text>
            </Pressable>
          )}

          <Pressable onPress={() => navigation.navigate('Login')} style={styles.backLink}>
            <Text style={styles.backText}>Back to Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2563EB' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 8, color: '#475569', fontSize: 14, lineHeight: 20 },
  label: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  inputErr: {
    borderColor: '#F87171',
    backgroundColor: '#FFF1F2',
  },
  fieldErr: {
    color: '#DC2626',
    marginTop: 4,
    fontSize: 12,
  },
  pwWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  pwInput: {
    paddingRight: 40,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  backLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  backText: {
    color: '#475569',
    fontWeight: '600',
  },
});
