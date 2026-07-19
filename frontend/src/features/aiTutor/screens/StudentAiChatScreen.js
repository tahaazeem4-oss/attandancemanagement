// frontend/src/features/aiTutor/screens/StudentAiChatScreen.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../../config/theme';
import useAiTutorConfig from '../hooks/useAiTutorConfig';
import useAiTutorChat from '../hooks/useAiTutorChat';
import AiQuotaBanner from '../components/AiQuotaBanner';

function Bubble({ msg, onOpenAnswer }) {
  const isUser = msg.role === 'user';
  if (isUser) {
    return (
      <View style={styles.rowRight}>
        <LinearGradient colors={[C.primary, C.primaryDark]} style={styles.userBubble}>
          <Text style={styles.userText}>{msg.content}</Text>
        </LinearGradient>
      </View>
    );
  }
  return (
    <View style={styles.rowLeft}>
      <View style={[styles.aiAvatar, msg._error && styles.aiAvatarError]}>
        <Ionicons name={msg._error ? 'alert-circle' : 'sparkles'} size={14} color={msg._error ? '#EF4444' : C.primary} />
      </View>
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.aiBubble, msg._error && styles.aiBubbleError]}
        onPress={() => !msg._error && onOpenAnswer?.(msg)}
        disabled={!!msg._error}
      >
        <Text style={[styles.aiText, msg._error && styles.aiTextError]}>{msg.content}</Text>
        {!msg._error && (
          <View style={styles.answerMetaRow}>
            <Text style={styles.answerMetaText}>Tap to expand</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={styles.rowLeft}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={14} color={C.primary} />
      </View>
      <View style={[styles.aiBubble, { paddingVertical: 16 }]}>
        <View style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.typingDot, { opacity: 0.3 + i * 0.3 }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function StudentAiChatScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const subjectId = route?.params?.subjectId;
  const subjectName = route?.params?.subjectName;
  const materials = Array.isArray(route?.params?.materials) ? route.params.materials : [];
  const initialMaterial = route?.params?.selectedMaterial || (materials.length === 1 ? materials[0] : null);
  const childStudentId = route?.params?.child?.student_id ?? route?.params?.child?.id ?? null;
  const child = route?.params?.child || null;
  const { enabled, blockedAt, quota, loading, refresh, error: configError } = useAiTutorConfig({ studentId: childStudentId });
  const { messages, sending, ask } = useAiTutorChat({ studentId: childStudentId });
  const [input, setInput] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState(initialMaterial);
  const [answerModal, setAnswerModal] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { const id = setInterval(refresh, 30000); return () => clearInterval(id); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    if (messages.length || sending) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length, sending]);

  const quotaBlock = (() => {
    if (!quota) return null;
    const checks = [
      [quota.remaining_daily_requests,  quota.daily_requests,  'daily'],
      [quota.remaining_monthly_requests,quota.monthly_requests,'monthly'],
    ];
    for (const [rem, lim, period] of checks) {
      if (lim !== null && rem !== null && rem <= 0) return period;
    }
    return null;
  })();

  const onSend = async () => {
    const q = input.trim();
    if (!q || !subjectId || !selectedMaterial?.id || quotaBlock || sending) return;
    setInput('');
    try { await ask({ question: q, subjectId, documentId: selectedMaterial.id }); } catch (_) {}
    refresh();
  };

  const openAnswer = (msg) => {
    setShowSources(false);
    setAnswerModal(msg);
  };

  if (loading) {
    return <View style={[styles.flex, styles.center]}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  if (!enabled) {
    return (
      <View style={[styles.flex, styles.center]}>
        <View style={styles.disabledIcon}><Ionicons name="sparkles-outline" size={36} color={C.primary} /></View>
        <Text style={styles.disabledTitle}>AI Tutor Unavailable</Text>
        <Text style={styles.disabledBody}>Disabled{blockedAt ? ` at ${blockedAt} level` : ''}.{configError ? `\n${configError}` : ''}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <LinearGradient colors={C.brandGradient} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerSub}>STUDENT PORTAL</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{subjectName || 'Chat'}</Text>
        </View>
        {quota && (
          <View style={styles.quotaBadge}>
            <Ionicons name="flash-outline" size={11} color={C.headerText} />
            <Text style={styles.quotaBadgeText}>{quota.remaining_daily_requests ?? '—'} left</Text>
          </View>
        )}
      </LinearGradient>

      <AiQuotaBanner quota={quota} />

      {quotaBlock && (
        <View style={styles.quotaWarn}>
          <Ionicons name="warning-outline" size={14} color="#B45309" />
          <Text style={styles.quotaWarnText}>
            {quotaBlock.charAt(0).toUpperCase() + quotaBlock.slice(1)} limit reached — try again later.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View style={styles.chatStage}>
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={[styles.messagesInner, { paddingBottom: 12 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            {!selectedMaterial && (
              <View style={styles.emptyChat}>
                <View style={styles.emptyChatIcon}>
                  <Ionicons name="document-text-outline" size={34} color={C.primary} />
                </View>
                <Text style={styles.emptyChatTitle}>Pick a file first</Text>
                <Text style={styles.emptyChatBody}>
                  Choose the exact uploaded file you want the AI tutor to use before starting the chat.
                </Text>
                <TouchableOpacity
                  style={styles.primaryPickBtn}
                  onPress={() => navigation.navigate('StudentAiMaterials', {
                    subjectId,
                    subjectName,
                    materials,
                    ...(child ? { child } : {}),
                  })}
                >
                  <Text style={styles.primaryPickBtnText}>Choose file</Text>
                </TouchableOpacity>
              </View>
            )}
            {selectedMaterial && messages.length === 0 && !sending && (
              <View style={styles.emptyChat}>
                <View style={styles.emptyChatIcon}>
                  <Ionicons name="sparkles" size={34} color={C.primary} />
                </View>
                <Text style={styles.emptyChatTitle}>Ready to help!</Text>
                <Text style={styles.emptyChatBody}>
                  Ask me anything about {selectedMaterial.title}. I will answer from this selected file.
                </Text>
                <View style={styles.suggestions}>
                  {['Explain the key concept', 'Quiz me on this topic', 'Summarize the material'].map((s) => (
                    <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => setInput(s)}>
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {messages.map((msg, i) => <Bubble key={i} msg={msg} onOpenAnswer={openAnswer} />)}
            {selectedMaterial && sending && <TypingBubble />}
          </ScrollView>

          <View style={[styles.inputArea, { paddingBottom: Math.max(tabBarHeight > 0 ? 6 : insets.bottom, 6) }]}>
            {selectedMaterial && (
              <View style={styles.selectedMaterialBar}>
                <Ionicons name="document-attach-outline" size={13} color={C.primary} />
                <Text style={styles.selectedMaterialBarText} numberOfLines={1}>{selectedMaterial.title}</Text>
                <TouchableOpacity
                  style={styles.changeFileBtn}
                  onPress={() => navigation.navigate('StudentAiMaterials', {
                    subjectId,
                    subjectName,
                    materials,
                    ...(child ? { child } : {}),
                  })}
                >
                  <Text style={styles.changeFileBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={input}
                onChangeText={setInput}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 120)}
                placeholder={selectedMaterial ? 'Ask about your selected file…' : 'Choose a file first…'}
                placeholderTextColor={C.textLight}
                selectionColor={C.primary}
                cursorColor={C.primary}
                multiline
                scrollEnabled
                maxLength={2000}
                editable={!quotaBlock && !sending && !!selectedMaterial}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (sending || !input.trim() || !!quotaBlock || !selectedMaterial) && styles.sendBtnOff]}
                onPress={onSend}
                disabled={sending || !input.trim() || !!quotaBlock || !selectedMaterial}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={17} color="#fff" />}
              </TouchableOpacity>
            </View>
            <Text style={styles.inputHint}>Grounded in uploaded materials · AI may make mistakes</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!answerModal} transparent animationType="fade" onRequestClose={() => setAnswerModal(null)}>
        <Pressable style={styles.modalScrim} onPress={() => setAnswerModal(null)}>
          <Pressable style={styles.answerModalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Answer</Text>
              <TouchableOpacity onPress={() => setAnswerModal(null)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.answerModalScroll} contentContainerStyle={{ paddingBottom: 12 }}>
              {selectedMaterial ? (
                <View style={styles.answerFilePill}>
                  <Ionicons name="document-text-outline" size={12} color={C.primary} />
                  <Text style={styles.answerFilePillText} numberOfLines={1}>{selectedMaterial.title}</Text>
                </View>
              ) : null}
              <Text style={styles.answerModalText}>{answerModal?.content || ''}</Text>
              {!!answerModal?.citations?.length && (
                <>
                  <TouchableOpacity style={styles.sourcesToggleBtn} onPress={() => setShowSources((v) => !v)}>
                    <Text style={styles.sourcesToggleText}>{showSources ? 'Hide source details' : 'Show source details'}</Text>
                    <Ionicons name={showSources ? 'chevron-up' : 'chevron-down'} size={14} color={C.primary} />
                  </TouchableOpacity>
                  {showSources && (
                    <View style={styles.citations}>
                      <Text style={styles.citationsLabel}>SOURCES</Text>
                      {answerModal.citations.map((c, index) => (
                        <View key={c.tag || index} style={styles.citationItem}>
                          <Text style={styles.citationSnippet}>{c.snippet}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  disabledIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  disabledTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8 },
  disabledBody: { color: C.textMed, textAlign: 'center', lineHeight: 22 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: C.brandDeep,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  backBtn: {
    marginRight: 2,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  headerSub: { color: C.headerSub, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center' },
  headerTitle: { color: C.headerText, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  quotaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  quotaBadgeText: { color: C.headerText, fontSize: 12, fontWeight: '700' },

  primaryPickBtn: { backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  primaryPickBtnText: { color: '#fff', fontWeight: '700' },

  // Quota warning
  quotaWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10 },
  quotaWarnText: { flex: 1, color: '#B45309', fontSize: 12, fontWeight: '600' },

  // Messages
  chatStage: { flex: 1 },
  messages: { flex: 1 },
  messagesInner: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingHorizontal: 20 },
  emptyChatIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyChatTitle: { fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  emptyChatBody: { color: C.textMed, textAlign: 'center', lineHeight: 22, fontSize: 13, marginBottom: 20 },
  suggestions: { gap: 8, alignItems: 'center' },
  suggestionChip: { backgroundColor: C.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE' },
  suggestionText: { color: C.primaryDark, fontSize: 12, fontWeight: '600' },

  // Bubbles
  rowRight: { alignItems: 'flex-end', marginBottom: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  userBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20, borderBottomRightRadius: 4 },
  userText: { color: '#fff', fontSize: 14, lineHeight: 21 },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 4 },
  aiAvatarError: { backgroundColor: '#FEE2E2' },
  aiBubble: { maxWidth: '80%', backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20, borderBottomLeftRadius: 4, shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  aiBubbleError: { backgroundColor: '#FEF2F2' },
  aiText: { color: C.textDark, fontSize: 14, lineHeight: 22 },
  aiTextError: { color: '#B91C1C' },
  answerMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 8 },
  answerMetaText: { fontSize: 11, fontWeight: '700', color: C.primary },
  citations: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  citationsLabel: { fontSize: 9, fontWeight: '700', color: C.textLight, letterSpacing: 1, marginBottom: 6 },
  citationItem: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 6, borderLeftWidth: 2, borderLeftColor: C.primary },
  citationSnippet: { fontSize: 12, color: C.textMed, lineHeight: 18 },
  typingDots: { flexDirection: 'row', gap: 5 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },

  // Input
  inputArea: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37,99,235,0.12)',
    backgroundColor: '#F8FBFF',
    shadowColor: C.brandDeep,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  selectedMaterialBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF2FF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6, borderWidth: 1, borderColor: '#CFE0FF' },
  selectedMaterialBarText: { flex: 1, fontSize: 12, color: C.primaryDark, fontWeight: '700' },
  changeFileBtn: { backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#DBEAFE' },
  changeFileBtnText: { color: C.primary, fontSize: 11, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2 },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 140,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: C.textDark,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  sendBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primaryDark, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  sendBtnOff: { backgroundColor: '#93C5FD' },
  inputHint: { fontSize: 10, color: C.textLight, textAlign: 'center', fontWeight: '500', marginBottom: 0 },

  modalScrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  answerModalCard: { maxHeight: '78%', marginHorizontal: 14, marginBottom: 24, backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 16, paddingTop: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textDark },
  modalBody: { color: C.textMed, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  answerModalScroll: { maxHeight: '100%' },
  answerModalText: { color: C.textDark, fontSize: 15, lineHeight: 24 },
  answerFilePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 12, maxWidth: '100%' },
  answerFilePillText: { color: C.primaryDark, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  sourcesToggleBtn: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  sourcesToggleText: { color: C.primary, fontWeight: '700', fontSize: 12 },
});
