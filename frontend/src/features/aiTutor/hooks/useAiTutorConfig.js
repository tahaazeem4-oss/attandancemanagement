// frontend/src/features/aiTutor/hooks/useAiTutorConfig.js
import { useCallback, useEffect, useState } from 'react';
import { fetchEffectiveConfig } from '../api/aiTutorApi';

export default function useAiTutorConfig() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [blockedAt, setBlockedAt] = useState(null);
  const [quota, setQuota] = useState(null);
  const [scope, setScope] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchEffectiveConfig();
      setEnabled(Boolean(data?.enabled));
      setBlockedAt(data?.blocked_at || null);
      setQuota(data?.quota || null);
      setScope(data?.scope || null);
    } catch (e) {
      setEnabled(false);
      setError(e?.response?.data?.message || 'Failed to load AI Tutor config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { loading, enabled, blockedAt, quota, scope, error, refresh };
}
