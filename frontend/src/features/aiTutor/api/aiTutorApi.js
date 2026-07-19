// frontend/src/features/aiTutor/api/aiTutorApi.js
import api from '../../../services/api';

const withStudentParams = (studentId) => (
  studentId != null ? { params: { student_id: studentId } } : undefined
);

// ── Config & quotas ───────────────────────────────────────────
export const fetchEffectiveConfig = (studentId) =>
  api.get('/ai-tutor/config/effective', withStudentParams(studentId));

export const fetchStudentMaterials = (studentId) =>
  api.get('/ai-tutor/student/materials', withStudentParams(studentId));

// ── Sessions & chat ──────────────────────────────────────────
export const createSession = (body, studentId) =>
  api.post('/ai-tutor/chat/session', body, withStudentParams(studentId));
export const listSessions  = (studentId) =>
  api.get('/ai-tutor/chat/sessions', withStudentParams(studentId));
export const fetchHistory  = (sessionId, studentId) =>
  api.get('/ai-tutor/chat/history', {
    params: {
      session_id: sessionId,
      ...(studentId != null ? { student_id: studentId } : {}),
    },
  });
export const askQuestion   = (body, studentId) =>
  api.post('/ai-tutor/chat/query', body, withStudentParams(studentId));

// ── Materials (teacher/admin/orgadmin/superadmin) ────────────
export const listMaterials = (params = {}) => api.get('/ai-tutor/materials', { params });
export const deleteMaterial = (id) => api.delete(`/ai-tutor/materials/${id}`);
export const uploadMaterial = (formData) =>
  api.post('/ai-tutor/materials/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// ── Admin: flags & policies ──────────────────────────────────
export const setFeatureFlag   = (body) => api.post('/ai-tutor/admin/feature-flag', body);
export const setFeatureFlagsBulk = (body) => api.post('/ai-tutor/admin/feature-flag/bulk', body);
export const listFeatureFlags = (params = {}) => api.get('/ai-tutor/admin/feature-flags', { params });
export const setQuotaPolicy   = (body) => api.post('/ai-tutor/admin/quota-policy', body);
export const listQuotaPolicies = (params = {}) => api.get('/ai-tutor/admin/quota-policies', { params });
export const fetchAiTutorHealth = () => api.get('/ai-tutor/admin/health');
export const fetchScopeOptions  = (type, parentId) =>
  api.get('/ai-tutor/admin/scope-options', { params: { type, ...(parentId ? { parent_id: parentId } : {}) } });
export const fetchPolicySummary = (actorType = 'student') => api.get('/ai-tutor/admin/policy-summary', { params: { actor_type: actorType } });
export const deleteScopeConfig  = (scopeType, scopeId, target = 'both', actorType = 'student') =>
  api.delete('/ai-tutor/admin/scope', { params: { scope_type: scopeType, scope_id: scopeId, target, actor_type: actorType } });
export const fetchHierarchy     = (nodeType = 'root', nodeId, actorType = 'student') =>
  api.get('/ai-tutor/admin/hierarchy', { params: { node_type: nodeType, actor_type: actorType, ...(nodeId ? { node_id: nodeId } : {}) } });
export const cascadeFeatureFlag = (body) => api.post('/ai-tutor/admin/cascade-flag', body);

// ── Provider key sync (super admin only) ─────────────────────
export const fetchProviderStatus  = () => api.get('/ai-tutor/admin/provider-status');
export const syncProviderQuota    = (overrides = {}) => api.post('/ai-tutor/admin/sync-provider-quota', overrides);
export const resetQuotaCounters   = () => api.post('/ai-tutor/admin/reset-counters', {});

// ── Analytics ────────────────────────────────────────────────
export const fetchUsageAnalytics = (days = 30) => api.get('/ai-tutor/analytics/usage', { params: { days } });
export const fetchStudentAnalytics = (days = 30, studentId) =>
  api.get('/ai-tutor/analytics/student', {
    params: { days, ...(studentId != null ? { student_id: studentId } : {}) },
  });
export const fetchScopeAnalytics = (nodeType = 'root', nodeId, days = 30) =>
  api.get('/ai-tutor/analytics/scope', {
    params: { node_type: nodeType, ...(nodeId ? { node_id: nodeId } : {}), days },
  });

// ── Jobs (super admin / cron) ────────────────────────────────
export const processIngestion = () => api.post('/ai-tutor/jobs/process-ingestion', {});
