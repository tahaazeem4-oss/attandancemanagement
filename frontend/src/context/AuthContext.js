import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import api, { setUnauthorizedHandler } from '../services/api';

// expo-secure-store has no web implementation — fall back to localStorage
const storage = {
  async setItem(key, value) {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); }
    else { await SecureStore.setItemAsync(key, value); }
  },
  async getItem(key) {
    if (Platform.OS === 'web') { return localStorage.getItem(key); }
    return await SecureStore.getItemAsync(key);
  },
  async removeItem(key) {
    if (Platform.OS === 'web') { localStorage.removeItem(key); }
    else { await SecureStore.deleteItemAsync(key); }
  },
};

const AuthContext = createContext(null);

// ── Push notification helper ──────────────────────────────────
// Requests permission, gets the Expo push token, and saves it to the backend.
// Silently ignores errors so it never breaks the login flow.
async function registerPushToken() {
  try {
    if (Platform.OS === 'web') return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token     = tokenData.data;

    if (token) {
      await api.post('/push-token', { token });
    }
  } catch { /* silently ignore — never block login */ }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null); // { id, first_name, last_name, email, role, school_id, ... }
  const [school,  setSchool]  = useState(null); // { id, name, tagline, initials, logo_url, primary_color, accent_color }
  const [loading, setLoading] = useState(true);

  // Computed: backward-compat teacher ref (used by existing teacher screens)
  const teacher = user?.role === 'teacher' ? user : null;

  const resolveSchoolById = async (schoolId) => {
    if (!schoolId) return null;
    try {
      const { data } = await api.get('/schools');
      const list = Array.isArray(data) ? data : [];
      return list.find((s) => Number(s?.id) === Number(schoolId)) || null;
    } catch {
      return null;
    }
  };

  // Restore session from storage on launch
  useEffect(() => {
    (async () => {
      try {
        const token      = await storage.getItem('token');
        const userJson   = await storage.getItem('user');
        const schoolJson = await storage.getItem('school');

        if (token && userJson) {
          const parsed = JSON.parse(userJson);
          if (!parsed.role) parsed.role = 'teacher';
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setUser(parsed);
          if (schoolJson) setSchool(JSON.parse(schoolJson));
          registerPushToken(); // re-register token on app restart
        } else {
          // Migrate old 'teacher' storage key
          const oldJson = await storage.getItem('teacher');
          if (token && oldJson) {
            const parsed = JSON.parse(oldJson);
            if (!parsed.role) parsed.role = 'teacher';
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(parsed);
            await storage.setItem('user', JSON.stringify(parsed));
            await storage.removeItem('teacher');
            registerPushToken();
          }
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const u = data.user;
    const sc = data.school || null;
    await storage.setItem('token', data.token);
    await storage.setItem('user',  JSON.stringify(u));
    if (sc) await storage.setItem('school', JSON.stringify(sc));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(u);
    setSchool(sc);
    registerPushToken();
    return data;
  };

  const parentLogin = async (email, password) => {
    const { data } = await api.post('/parent/login', { email: email.trim().toLowerCase(), password });
    const u = {
      id: data.id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      role: 'parent',
      school_id: data.school_id,
    };
    await storage.setItem('token', data.token);
    await storage.setItem('user',  JSON.stringify(u));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(u);

    const sc = await resolveSchoolById(data.school_id);
    if (sc) {
      await storage.setItem('school', JSON.stringify(sc));
      setSchool(sc);
    } else {
      await storage.removeItem('school');
      setSchool(null);
    }
    return data;
  };

  const parentSignup = async (payload) => {
    const { data } = await api.post('/parent/signup', payload);
    const u = {
      id: data.id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      role: 'parent',
      school_id: data.school_id,
    };
    await storage.setItem('token', data.token);
    await storage.setItem('user',  JSON.stringify(u));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(u);

    const sc = await resolveSchoolById(data.school_id);
    if (sc) {
      await storage.setItem('school', JSON.stringify(sc));
      setSchool(sc);
    } else {
      await storage.removeItem('school');
      setSchool(null);
    }
    return data;
  };

  const signup = async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    const u = data.user;
    const sc = data.school || null;
    await storage.setItem('token', data.token);
    await storage.setItem('user',  JSON.stringify(u));
    if (sc) await storage.setItem('school', JSON.stringify(sc));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(u);
    setSchool(sc);
    registerPushToken();
    return data;
  };

  const logout = async () => {
    // Best-effort: remove push token from server before clearing session
    try { await api.delete('/push-token'); } catch { /* ignore */ }
    await storage.removeItem('token');
    await storage.removeItem('user');
    await storage.removeItem('school');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setSchool(null);
  };

  // Register the 401 → auto-logout handler so expired/invalid tokens
  // are cleared immediately and the user is returned to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await storage.removeItem('token');
      await storage.removeItem('user');
      await storage.removeItem('school');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
      setSchool(null);
      Alert.alert('Session Expired', 'Please log in again.');
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, teacher, school, loading, login, parentLogin, parentSignup, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
