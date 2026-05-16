// frontend/src/features/aiTutor/screens/StudentAiChatScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAiTutorConfig from '../hooks/useAiTutorConfig';
import useAiTutorChat from '../hooks/useAiTutorChat';
import AiQuotaPill from '../components/AiQuotaPill';
import AiQuotaBanner from '../components/AiQuotaBanner';
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
    if (quotaBlock) return;
    setInput('');
    try { await ask({ question: q, subjectId }); } catch (_) { /* shown inline */ }
    refresh();
  };

  const quotaBlock = (() => {
    if (!quota) return null;
    const checks = [
      ['daily',   quota.remaining_daily_requests,   quota.daily_requests,   'today'],
      ['weekly',  quota.remaining_weekly_requests,  quota.weekly_requests,  'this week'],
      ['monthly', quota.remaining_monthly_requests, quota.monthly_requests, 'this month'],
    ];
    for (const [p, remReq, limReq, label] of checks) {
      if (limReq !== null && remReq !== null && remReq <= 0) return { period: p, label, kind: 'requests' };
    }
    const tokChecks = [
      ['daily',   quota.used_today_tokens, quota.daily_tokens,   'today'],
      ['weekly',  quota.used_week_tokens,  quota.weekly_tokens,  'this week'],
      ['monthly', quota.used_month_tokens, quota.monthly_tokens, 'this month'],
    ];
    for (const [p, used, lim, label] of tokChecks) {
      if (lim !== null && (used || 0) >= lim) return { period: p, label, kind: 'tokens' };
    }
    return null;
  })();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Tutor{subjectName ? ` · ${subjectName}` : ''}</Text>
        <AiQuotaPill quota={quota} />
      </View>
      <AiQuotaBanner quota={quota} />
      {quotaBlock && (
        <View style={styles.quotaWarn}>
          <Text style={styles.quotaWarnText}>
            You’ve reached your {quotaBlock.label} {quotaBlock.kind === 'tokens' ? 'token' : 'request'} limit. Try again later.
          </Text>
        </View>
      )}
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
          <TouchableOpacity style={[styles.sendBtn, (sending || !input.trim() || !!quotaBlock) && styles.sendBtnDisabled]} onPress={onSend} disabled={sending || !input.trim() || !!quotaBlock}>
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
  quotaWarn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 10 },
  quotaWarnText: { color: '#B91C1C', fontWeight: '600', fontSize: 12 },
});
