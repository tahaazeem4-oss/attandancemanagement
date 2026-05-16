// frontend/src/features/aiTutor/components/AiChatMessageList.js
import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';

function Citation({ c }) {
  return (
    <View style={styles.citation}>
      <Text style={styles.citationTag}>{c.tag}</Text>
      <Text style={styles.citationSnippet} numberOfLines={3}>{c.snippet}</Text>
    </View>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, isUser ? styles.user : msg._error ? styles.error : styles.assistant]}>
        <Text style={isUser ? styles.userText : styles.assistantText}>{msg.content}</Text>
        {!isUser && Array.isArray(msg.citations) && msg.citations.length > 0 && (
          <View style={styles.citations}>
            {msg.citations.map((c) => <Citation key={c.tag} c={c} />)}
          </View>
        )}
      </View>
    </View>
  );
}

export default function AiChatMessageList({ messages }) {
  return (
    <FlatList
      data={messages}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => <Bubble msg={item} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginBottom: 10 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 14 },
  user: { backgroundColor: '#2563EB' },
  assistant: { backgroundColor: '#F3F4F6' },
  error: { backgroundColor: '#FEE2E2' },
  userText: { color: '#fff' },
  assistantText: { color: '#111827' },
  citations: { marginTop: 8, gap: 6 },
  citation: { backgroundColor: '#fff', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  citationTag: { fontWeight: '700', color: '#2563EB', marginBottom: 2 },
  citationSnippet: { color: '#374151', fontSize: 12 },
});
