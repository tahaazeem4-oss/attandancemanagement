import axios from 'axios';

// ⚠️  Change this to your machine's local IP when testing on a physical device
//      (e.g. 'http://192.168.100.113:5000/api')
const BASE_URL = 'http://192.168.100.36:5000/api';  // 10.0.2.2 = localhost from Android emulator

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// ── Logout callback ───────────────────────────────────────────
// AuthContext registers this so api.js can trigger logout on 401
// without creating a circular dependency.
let _onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { _onUnauthorized = fn; };

// Log every outgoing request
api.interceptors.request.use(config => {
  console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data || '');
  return config;
});

// Log every response; clear session on 401
api.interceptors.response.use(
  response => {
    console.log(`[API] ${response.status} ${response.config?.url}`, response.data);
    return response;
  },
  error => {
    const status  = error?.response?.status;
    const message = error?.response?.data?.message || error?.message || 'Unknown error';
    console.error(`[API ERROR] ${status || 'NETWORK'} ${error?.config?.url}`, message);
    if (status === 401 && _onUnauthorized) {
      _onUnauthorized();
    }
    return Promise.reject(error);
  },
);

export default api;
