// frontend/src/features/aiTutor/hooks/useAiTutorConfig.js
import { useCallback, useEffect, useState } from 'react';
import { useRef } from 'react';
import { fetchEffectiveConfig } from '../api/aiTutorApi';

export default function useAiTutorConfig({ studentId } = {}) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [blockedAt, setBlockedAt] = useState(null);
  const [quota, setQuota] = useState(null);
  const [scope, setScope] = useState(null);
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchEffectiveConfig(studentId);
      if (requestId !== requestSeqRef.current) return;
      setEnabled(Boolean(data?.enabled));
      setBlockedAt(data?.blocked_at || null);
      setQuota(data?.quota || null);
      setScope(data?.scope || null);
    } catch (e) {
      if (requestId !== requestSeqRef.current) return;
      setEnabled(false);
      setError(e?.response?.data?.message || 'Failed to load AI Tutor config');
    } finally {
      if (requestId !== requestSeqRef.current) return;
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { loading, enabled, blockedAt, quota, scope, error, refresh };
}
