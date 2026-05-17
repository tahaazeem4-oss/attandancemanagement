// frontend/src/features/aiTutor/hooks/useAiTutorConfig.js
import { useCallback, useEffect, useState } from 'react';
import { useRef } from 'react';
import { fetchEffectiveConfig } from '../api/aiTutorApi';

// Module-level in-memory cache — persists for the app session.
// Key: `ai_config_<studentId|"self">`, Value: { enabled, blockedAt, quota, scope, expiresAt }
const _cache = {};
const CACHE_TTL_MS = 60_000; // 1 minute

function getCached(key) {
  const entry = _cache[key];
  return entry && Date.now() < entry.expiresAt ? entry : null;
}

export default function useAiTutorConfig({ studentId } = {}) {
  const cacheKey = `ai_config_${studentId ?? 'self'}`;
  const initialCache = getCached(cacheKey);

  const [loading, setLoading] = useState(!initialCache);
  const [enabled, setEnabled] = useState(initialCache ? initialCache.enabled : false);
  const [blockedAt, setBlockedAt] = useState(initialCache ? initialCache.blockedAt : null);
  const [quota, setQuota] = useState(initialCache ? initialCache.quota : null);
  const [scope, setScope] = useState(initialCache ? initialCache.scope : null);
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    // Only show loading spinner when there is no valid cached data
    const hasCached = !!getCached(cacheKey);
    if (!hasCached) setLoading(true);
    setError(null);
    try {
      const { data } = await fetchEffectiveConfig(studentId);
      if (requestId !== requestSeqRef.current) return;
      const newEnabled = Boolean(data?.enabled);
      const newBlockedAt = data?.blocked_at || null;
      const newQuota = data?.quota || null;
      const newScope = data?.scope || null;
      _cache[cacheKey] = {
        enabled: newEnabled,
        blockedAt: newBlockedAt,
        quota: newQuota,
        scope: newScope,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      setEnabled(newEnabled);
      setBlockedAt(newBlockedAt);
      setQuota(newQuota);
      setScope(newScope);
    } catch (e) {
      if (requestId !== requestSeqRef.current) return;
      // Preserve cached enabled state on transient errors
      if (!hasCached) setEnabled(false);
      setError(e?.response?.data?.message || 'Failed to load AI Tutor config');
    } finally {
      if (requestId !== requestSeqRef.current) return;
      setLoading(false);
    }
  }, [studentId, cacheKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { loading, enabled, blockedAt, quota, scope, error, refresh };
}
