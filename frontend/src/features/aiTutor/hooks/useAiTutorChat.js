// frontend/src/features/aiTutor/hooks/useAiTutorChat.js
import { useCallback, useState } from 'react';
import { askQuestion, createSession, fetchHistory } from '../api/aiTutorApi';

export default function useAiTutorChat() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const startSession = useCallback(async ({ subjectId, title } = {}) => {
    setError(null);
    const { data } = await createSession({ subject_id: subjectId, title });
    setSessionId(data?.session?.id);
    setMessages([]);
    return data?.session;
  }, []);

  const loadSession = useCallback(async (id) => {
    setError(null);
    setSessionId(id);
    const { data } = await fetchHistory(id);
    setMessages(data?.messages || []);
  }, []);

  const ask = useCallback(async ({ question, subjectId }) => {
    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: question, _local: true }]);
    try {
      const { data } = await askQuestion({ question, subject_id: subjectId, session_id: sessionId });
      if (!sessionId && data?.session_id) setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data?.answer || '', citations: data?.citations || [] },
      ]);
      return data;
    } catch (e) {
      const msg = e?.response?.data?.message || 'AI request failed';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: msg, _error: true }]);
      throw e;
    } finally {
      setSending(false);
    }
  }, [sessionId]);

  return { sessionId, messages, sending, error, startSession, loadSession, ask, setMessages };
}
