import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Modal, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';
import { useAuth } from '../../context/AuthContext';
import { emitChatUnreadRefresh } from '../../lib/chatEvents';
import AppHeader from '../../components/AppHeader';

const POLL_INTERVAL = 6000; // 6 seconds

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Double-tick read receipt icon
function TickIcon({ msg, myRole, myId }) {
  const isMine = msg.sender_type === myRole && msg.sender_id === myId;
  if (!isMine || msg.deleted_at) return null;

  // Check if recipient read it
  const reads = msg.reads || [];
  const recipientRead = reads.some(
    (r) => !(r.reader_type === myRole && r.reader_id === myId),
  );

  if (recipientRead) {
    // Double blue ticks
    return (
      <View style={styles.tickRow}>
        <Ionicons name="checkmark-done" size={14} color="#4FC3F7" />
      </View>
    );
  }
  // Single gray tick
  return (
    <View style={styles.tickRow}>
      <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.6)" />
    </View>
  );
}

function MessageBubble({ msg, myRole, myId, onOpenActions }) {
  const isMine = msg.sender_type === myRole && msg.sender_id === myId;
  const isDeleted = !!msg.deleted_at;

  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
      <Pressable
        onLongPress={!isDeleted && isMine ? () => onOpenActions(msg) : undefined}
        onPress={!isDeleted && isMine ? () => onOpenActions(msg) : undefined}
        style={({ pressed }) => [
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
          pressed && { opacity: 0.85 },
        ]}
      >
        {isDeleted ? (
          <Text style={styles.deletedText}>🚫 This message was deleted</Text>
        ) : (
          <>
            <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {msg.content}
            </Text>
            {msg.is_edited && !isDeleted && (
              <Text style={styles.editedLabel}>edited</Text>
            )}
          </>
        )}
        <View style={styles.bubbleMeta}>
          <Text style={[styles.timeText, isMine && styles.timeTextMine]}>
            {formatTime(msg.created_at)}
          </Text>
          <TickIcon msg={msg} myRole={myRole} myId={myId} />
        </View>
      </Pressable>
    </View>
  );
}

export default function ChatScreen({ route, navigation }) {
  const { conversation } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Edit/delete modal
  const [menuMsg, setMenuMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const [chatMenuOpen, setChatMenuOpen] = useState(false);

  const listRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const scrollTimeoutRef = useRef(null);

  const myRole = user?.role;
  const myId = user?.id;

  const participantName = conversation.participant_name || 'Chat';

  const goBackToHome = useCallback(() => {
    // Prefer switching to Home tab so back from chat never lands on Profile.
    const parentNav = navigation.getParent?.();
    const parentRouteNames = parentNav?.getState?.()?.routeNames || [];
    if (parentRouteNames.includes('HomeTab')) {
      parentNav.navigate('HomeTab');
      return;
    }

    const grandParentNav = parentNav?.getParent?.();
    const grandRouteNames = grandParentNav?.getState?.()?.routeNames || [];
    if (grandRouteNames.includes('HomeTab')) {
      grandParentNav.navigate('HomeTab');
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  }, [navigation]);

  // ── Load messages ─────────────────────────────────────────
  const loadMessages = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/chat/conversations/${conversation.id}/messages`);
      if (mountedRef.current) setMessages(data.messages || []);
    } catch {
      // ignore silent poll failures
    } finally {
      if (!silent && mountedRef.current) setLoading(false);
    }
  }, [conversation.id]);

  // ── Mark all as read ─────────────────────────────────────
  const markRead = useCallback(async () => {
    try {
      await api.post(`/chat/conversations/${conversation.id}/read`);
      emitChatUnreadRefresh();
    } catch { /* non-critical */ }
  }, [conversation.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      markRead();

      pollRef.current = setInterval(() => {
        loadMessages(true);
        markRead();
      }, POLL_INTERVAL);

      return () => {
        // Ensure unread counts are flushed when user leaves this conversation.
        markRead();
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [loadMessages, markRead]),
  );

  // ── Set nav header ────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({ title: participantName });
  }, [navigation, participantName]);

  // ── Scroll to bottom on new messages ─────────────────────
  useEffect(() => {
    if (messages.length > 0) {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  // ── Send message ──────────────────────────────────────────
  const sendMessage = async () => {
    const content = text.trim();
    if (!content || sending) return;
    const tempId = `tmp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: myId,
      sender_type: myRole,
      content,
      created_at: new Date().toISOString(),
      reads: [],
      _optimistic: true,
    };
    try {
      setSending(true);
      setText('');
      setMessages((prev) => [...prev, optimisticMsg]);
      const { data: msg } = await api.post(`/chat/conversations/${conversation.id}/messages`, { content });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...msg, reads: [] } : m)));
    } catch (err) {
      // Reconcile once: some transient responses may fail client-side even though message was persisted.
      try {
        const { data } = await api.get(`/chat/conversations/${conversation.id}/messages`);
        const serverMessages = data?.messages || [];
        setMessages(serverMessages);
        const sentOnServer = serverMessages.some((m) =>
          m?.sender_id === myId &&
          m?.sender_type === myRole &&
          String(m?.content || '') === content,
        );
        if (sentOnServer) return;
      } catch {
        // Fall through to user-facing error below.
      }

      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = err?.response?.data?.message || 'Failed to send message. Please try again.';
      Alert.alert('Error', msg);
      setText(content);
    } finally {
      setSending(false);
    }
  };

  // ── Long press menu ───────────────────────────────────────
  const onOpenActions = (msg) => setMenuMsg(msg);

  const handleDeleteConversation = () => {
    setChatMenuOpen(false);
    Alert.alert(
      'Delete Chat',
      'Delete this complete chat and all messages?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Chat',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/chat/conversations/${conversation.id}`);
              emitChatUnreadRefresh();
              Alert.alert('Deleted', 'Chat deleted successfully.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err) {
              const msg = err?.response?.data?.message || 'Failed to delete chat.';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleEdit = () => {
    setEditingMsg(menuMsg);
    setEditText(menuMsg.content);
    setMenuMsg(null);
  };

  const handleDelete = () => {
    const target = menuMsg;
    setMenuMsg(null);
    Alert.alert(
      'Delete Message',
      'Delete this message for everyone?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/chat/messages/${target.id}`);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === target.id
                    ? { ...m, deleted_at: new Date().toISOString() }
                    : m,
                ),
              );
            } catch {
              Alert.alert('Error', 'Failed to delete message.');
            }
          },
        },
      ],
    );
  };

  const submitEdit = async () => {
    const content = editText.trim();
    if (!content) return;
    try {
      const { data: updated } = await api.put(`/chat/messages/${editingMsg.id}`, { content });
      setMessages((prev) =>
        prev.map((m) => (m.id === editingMsg.id ? { ...updated, reads: m.reads } : m)),
      );
      setEditingMsg(null);
      setEditText('');
    } catch {
      Alert.alert('Error', 'Failed to edit message.');
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 12}
    >
      <AppHeader
        title={participantName}
        subtitle={conversation.participant_type === 'admin' ? 'Admin' : conversation.participant_type === 'parent' ? 'Parent' : 'Teacher'}
        navigation={navigation}
        onBackPress={goBackToHome}
        rightSlot={(
          <Pressable onPress={() => setChatMenuOpen(true)} style={styles.headerActionBtn}>
            <Ionicons name="ellipsis-vertical" size={18} color="#F8FAFC" />
          </Pressable>
        )}
      />

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <MessageBubble
              msg={item}
              myRole={myRole}
              myId={myId}
              onOpenActions={onOpenActions}
            />
          )}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            </View>
          }
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
        />
      )}

      {/* Input area */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor={C.textLight}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* Long-press action modal */}
      <Modal
        visible={!!menuMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMsg(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setMenuMsg(null)}>
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
              <Ionicons name="pencil-outline" size={22} color={C.primary} />
              <Text style={styles.actionText}>Edit message</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color={C.absent} />
              <Text style={[styles.actionText, { color: C.absent }]}>Delete message</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionItem} onPress={() => setMenuMsg(null)}>
              <Ionicons name="close-outline" size={22} color={C.textMed} />
              <Text style={[styles.actionText, { color: C.textMed }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Chat menu modal */}
      <Modal
        visible={chatMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChatMenuOpen(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setChatMenuOpen(false)}>
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionItem} onPress={handleDeleteConversation}>
              <Ionicons name="trash-outline" size={22} color={C.absent} />
              <Text style={[styles.actionText, { color: C.absent }]}>Delete complete chat</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionItem} onPress={() => setChatMenuOpen(false)}>
              <Ionicons name="close-outline" size={22} color={C.textMed} />
              <Text style={[styles.actionText, { color: C.textMed }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit message modal */}
      <Modal
        visible={!!editingMsg}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingMsg(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setEditingMsg(null)}>
          <View style={styles.editSheet}>
            <Text style={styles.editTitle}>Edit Message</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              maxLength={2000}
              autoFocus
              placeholderTextColor={C.textLight}
            />
            <View style={styles.editActions}>
              <Pressable style={styles.editCancel} onPress={() => setEditingMsg(null)}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.editSave, !editText.trim() && styles.sendBtnDisabled]}
                onPress={submitEdit}
                disabled={!editText.trim()}
              >
                <Text style={styles.editSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  // Messages
  messageList: { padding: 12, paddingBottom: 8 },
  bubbleRow: { marginBottom: 4, flexDirection: 'row' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },

  bubble: {
    maxWidth: '78%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleMine: {
    backgroundColor: C.primary,
    borderBottomRightRadius: 2,
    borderColor: C.primary,
  },
  bubbleTheirs: {
    backgroundColor: C.card,
    borderBottomLeftRadius: 2,
  },
  bubbleTextMine: { color: '#fff', fontSize: 15, lineHeight: 20 },
  bubbleTextTheirs: { color: C.textDark, fontSize: 15, lineHeight: 20 },
  deletedText: { color: C.textLight, fontSize: 14, fontStyle: 'italic' },
  editedLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },

  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timeText: { fontSize: 11, color: C.textLight, marginRight: 4 },
  timeTextMine: { color: 'rgba(255,255,255,0.7)' },
  tickRow: { marginLeft: 1 },

  emptyText: { color: C.textLight, fontSize: 14, textAlign: 'center' },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: C.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  input: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: C.textDark,
    maxHeight: 120,
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.textLight },

  // Modal / action sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    paddingTop: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionText: { fontSize: 16, fontWeight: '500', color: C.textDark, marginLeft: 14 },
  actionDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },

  // Edit modal
  editSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
  },
  editTitle: { fontSize: 17, fontWeight: '700', color: C.textDark, marginBottom: 12 },
  editInput: {
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    fontSize: 15,
    color: C.textDark,
    minHeight: 80,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 10 },
  editCancel: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
  },
  editCancelText: { color: C.textMed, fontWeight: '600' },
  editSave: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, backgroundColor: C.primary,
  },
  editSaveText: { color: '#fff', fontWeight: '700' },
});
