const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ojodojygymwvxchzxjsj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2RvanlneW13dnhjaHp4anNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzY3OTMsImV4cCI6MjA5MjcxMjc5M30.XQT4fofUyLo9jDvyK_gPmOeQ_J3H_fcwXPF-E1fnClE';

export const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/server`;
const REQUEST_TIMEOUT_MS = 20000;

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

function buildHeaders({ token, data, headers, omitContentType = false } = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(token ? { 'X-User-Token': `Bearer ${token}` } : {}),
    ...(!omitContentType && data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(headers || {}),
  };
}

function buildUrl(path, params) {
  return `${FUNCTION_BASE}${path}${toQuery(params)}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Request timed out. Please try again.');
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function apiRequest(method, path, { token, data, params, headers } = {}) {
  const res = await fetchWithTimeout(buildUrl(path, params), {
    method,
    headers: buildHeaders({ token, data, headers }),
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error(payload?.message || `Request failed with ${res.status}`);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function loginRequest(email, password) {
  return apiRequest('POST', '/auth/login', { data: { email, password } });
}

export async function apiBlobRequest(method, path, { token, data, params, headers } = {}) {
  const res = await fetchWithTimeout(buildUrl(path, params), {
    method,
    headers: buildHeaders({ token, data, headers }),
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();
    const error = new Error(payload?.message || `Request failed with ${res.status}`);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1] || match[2]) : null;
  return { blob, filename };
}

export async function apiFormRequest(method, path, { token, formData, params, headers } = {}) {
  const res = await fetchWithTimeout(buildUrl(path, params), {
    method,
    headers: buildHeaders({ token, headers, omitContentType: true }),
    body: formData,
  });

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error(payload?.message || `Request failed with ${res.status}`);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
