import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';

// ── Config ────────────────────────────────────────────────────
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/server`;

// ── Mutable state ─────────────────────────────────────────────
let _onUnauthorized = null;

// axios-compatible `defaults` object — screens that reference
// api.defaults.headers.common['Authorization'] or api.defaults.baseURL
// still work without changes.
const defaults = {
  baseURL: FUNCTION_BASE,
  headers: {
    common: {
      Authorization: '',
    },
  },
};

export const setUnauthorizedHandler = (fn) => { _onUnauthorized = fn; };

// ── Core fetch wrapper ────────────────────────────────────────
async function request(method, path, data, config = {}) {
  const url = new URL(`${FUNCTION_BASE}${path}`);

  // Append query params
  if (config.params) {
    Object.entries(config.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    });
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    // Always send anon key to the Supabase gateway — it only accepts anon/service-role JWTs.
    // Our custom user JWT (role: teacher/admin/etc.) goes in X-User-Token so the gateway
    // never sees it and our edge function picks it up via verifyToken.
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const authToken = defaults.headers.common['Authorization'];
  if (authToken) headers['X-User-Token'] = authToken;

  // Detect FormData uploads — don't set Content-Type (fetch adds boundary)
  const isFormData =
    data instanceof FormData ||
    (config.headers && config.headers['Content-Type'] === 'multipart/form-data');

  if (!isFormData && data !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions = { method, headers };

  if (data !== undefined) {
    fetchOptions.body = isFormData ? data : JSON.stringify(data);
  }

  console.log(`[API] ${method} ${url.pathname}${url.search}`);

  let res;
  try {
    res = await fetch(url.toString(), fetchOptions);
  } catch (networkErr) {
    console.error('[API NETWORK]', networkErr.message);
    throw { response: null, message: networkErr.message };
  }

  const ct = res.headers.get('content-type') || '';
  let responseData;

  if (config.responseType === 'arraybuffer') {
    responseData = await res.arrayBuffer();
  } else if (ct.includes('application/json')) {
    responseData = await res.json();
  } else if (
    ct.includes('spreadsheetml') ||
    ct.includes('octet-stream') ||
    ct.includes('binary')
  ) {
    responseData = await res.blob();
  } else {
    const text = await res.text();
    try { responseData = JSON.parse(text); } catch { responseData = text; }
  }

  console.log(`[API] ${res.status} ${url.pathname}`, typeof responseData !== 'object' ? responseData : '');

  if (res.status === 401) {
    const isLoginPath = url.pathname.includes('/login');
    const isPushToken = url.pathname.includes('/push-token');
    if (_onUnauthorized && !isLoginPath && !isPushToken) _onUnauthorized();
    throw { response: { status: 401, data: responseData } };
  }

  if (!res.ok) {
    throw { response: { status: res.status, data: responseData } };
  }

  return { data: responseData, status: res.status };
}

// ── Public api object (axios-compatible interface) ────────────
const api = {
  defaults,
  get:    (path, config = {})       => request('GET',    path, undefined, config),
  post:   (path, data, config = {}) => request('POST',   path, data,      config),
  put:    (path, data, config = {}) => request('PUT',    path, data,      config),
  patch:  (path, data, config = {}) => request('PATCH',  path, data,      config),
  delete: (path, config = {})       => request('DELETE', path, undefined, config),
};

export default api;

