// frontend/src/features/aiTutor/api/aiTutorApi.js
import api from '../../../services/api';

// ── Config & quotas ───────────────────────────────────────────
export const fetchEffectiveConfig = () => api.get('/ai-tutor/config/effective');

// ── Sessions & chat ──────────────────────────────────────────
export const createSession = (body) => api.post('/ai-tutor/chat/session', body);
export const listSessions  = () => api.get('/ai-tutor/chat/sessions');
export const fetchHistory  = (sessionId) => api.get('/ai-tutor/chat/history', { params: { session_id: sessionId } });
export const askQuestion   = (body) => api.post('/ai-tutor/chat/query', body);

// ── Materials (teacher/admin/orgadmin/superadmin) ────────────
export const listMaterials = (params = {}) => api.get('/ai-tutor/materials', { params });
export const deleteMaterial = (id) => api.delete(`/ai-tutor/materials/${id}`);
export const uploadMaterial = (formData) =>
  api.post('/ai-tutor/materials/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// ── Admin: flags & policies ──────────────────────────────────
export const setFeatureFlag   = (body) => api.post('/ai-tutor/admin/feature-flag', body);
export const listFeatureFlags = (params = {}) => api.get('/ai-tutor/admin/feature-flags', { params });
export const setQuotaPolicy   = (body) => api.post('/ai-tutor/admin/quota-policy', body);
export const listQuotaPolicies = (params = {}) => api.get('/ai-tutor/admin/quota-policies', { params });
export const fetchAiTutorHealth = () => api.get('/ai-tutor/admin/health');
export const fetchScopeOptions  = (type, parentId) =>
  api.get('/ai-tutor/admin/scope-options', { params: { type, ...(parentId ? { parent_id: parentId } : {}) } });
export const fetchPolicySummary = () => api.get('/ai-tutor/admin/policy-summary');

// ── Analytics ────────────────────────────────────────────────
export const fetchUsageAnalytics = (days = 30) => api.get('/ai-tutor/analytics/usage', { params: { days } });

// ── Jobs (super admin / cron) ────────────────────────────────
export const processIngestion = () => api.post('/ai-tutor/jobs/process-ingestion', {});
