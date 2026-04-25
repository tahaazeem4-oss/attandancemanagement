import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import api from '../services/api';

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

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null); // { id, first_name, last_name, email, role, school_id, ... }
  const [school,  setSchool]  = useState(null); // { id, name, tagline, initials, logo_url, primary_color, accent_color }
  const [loading, setLoading] = useState(true);

  // Computed: backward-compat teacher ref (used by existing teacher screens)
  const teacher = user?.role === 'teacher' ? user : null;

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
    return data;
  };

  const logout = async () => {
    await storage.removeItem('token');
    await storage.removeItem('user');
    await storage.removeItem('school');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setSchool(null);
  };

  return (
    <AuthContext.Provider value={{ user, teacher, school, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
