import axios from 'axios';

// ⚠️  Change this to your machine's local IP when testing on a physical device
//      (e.g. 'http://192.168.1.10:5000/api')
const BASE_URL = 'http://192.168.100.36:5000/api';  // 10.0.2.2 = localhost from Android emulator

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

export default api;
