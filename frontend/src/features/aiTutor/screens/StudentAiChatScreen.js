// frontend/src/features/aiTutor/screens/StudentAiChatScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAiTutorConfig from '../hooks/useAiTutorConfig';
import useAiTutorChat from '../hooks/useAiTutorChat';
import AiQuotaPill from '../components/AiQuotaPill';
import AiChatMessageList from '../components/AiChatMessageList';

export default function StudentAiChatScreen({ route }) {
  const subjectId = route?.params?.subjectId;
  const subjectName = route?.params?.subjectName;
  const { enabled, blockedAt, quota, loading, refresh } = useAiTutorConfig();
  const { messages, sending, ask } = useAiTutorChat();
  const [input, setInput] = useState('');

  useEffect(() => {
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>
    );
  }
  if (!enabled) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.disabledTitle}>AI Tutor is unavailable</Text>
        <Text style={styles.disabledBody}>This feature is currently disabled{blockedAt ? ` at the ${blockedAt} level` : ''}.</Text>
      </SafeAreaView>
    );
  }

  const onSend = async () => {
    const q = input.trim();
    if (!q || !subjectId) return;
    setInput('');
    try { await ask({ question: q, subjectId }); } catch (_) { /* shown inline */ }
    refresh();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Tutor{subjectName ? ` · ${subjectName}` : ''}</Text>
        <AiQuotaPill quota={quota} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
          <AiChatMessageList messages={messages} />
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your study material…"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={[styles.sendBtn, (sending || !input.trim()) && styles.sendBtnDisabled]} onPress={onSend} disabled={sending || !input.trim()}>
            <Text style={styles.sendText}>{sending ? '…' : 'Ask'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 16, fontWeight: '700' },
  disabledTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  disabledBody: { color: '#6B7280', textAlign: 'center' },
  inputRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#E5E7EB', alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F9FAFB' },
  sendBtn: { marginLeft: 8, backgroundColor: '#2563EB', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },
  sendText: { color: '#fff', fontWeight: '700' },
});
