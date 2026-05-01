import axios from 'axios';
import { Alert } from 'react-native';

// ⚠️  Change this to your machine's local IP when testing on a physical device
//      (e.g. 'http://192.168.100.113:5000/api')
const BASE_URL = 'http://192.168.100.36:5000/api';  // 10.0.2.2 = localhost from Android emulator

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Log every outgoing request
api.interceptors.request.use(config => {
  console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data || '');
  return config;
});

// Log every response; surface auth errors immediately
api.interceptors.response.use(
  response => {
    console.log(`[API] ${response.status} ${response.config?.url}`, response.data);
    return response;
  },
  error => {
    const status  = error?.response?.status;
    const message = error?.response?.data?.message || error?.message || 'Unknown error';
    console.error(`[API ERROR] ${status || 'NETWORK'} ${error?.config?.url}`, message);
    if (status === 401) {
      Alert.alert('Session Expired', 'Please log in again.');
    }
    return Promise.reject(error);
  },
);

export default api;
