import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { C, S } from '../../config/theme';

export default function ParentLoginScreen({ navigation }) {
  const { parentLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await parentLogin(email, password);
      // AuthContext sets user → AppNavigator automatically shows ParentTabs
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

        <Text style={S.label}>Email</Text>
        <TextInput
          style={S.input}
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <Text style={S.label}>Password</Text>
        <TextInput
          style={S.input}
          placeholder="Enter password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

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
  loginBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  loginBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
