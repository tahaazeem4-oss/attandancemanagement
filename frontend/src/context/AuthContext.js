import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import api from '../services/api';

// expo-secure-store has no web implementation — fall back to localStorage
const storage = {
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key) {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async removeItem(key) {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading]  = useState(true);

  // Restore session from secure storage on app launch
  useEffect(() => {
    (async () => {
      try {
        const token        = await storage.getItem('token');
        const teacherJson  = await storage.getItem('teacher');
        if (token && teacherJson) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setTeacher(JSON.parse(teacherJson));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await storage.setItem('token',   data.token);
    await storage.setItem('teacher', JSON.stringify(data.teacher));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setTeacher(data.teacher);
    return data;
  };

  const signup = async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    await storage.setItem('token',   data.token);
    await storage.setItem('teacher', JSON.stringify(data.teacher));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setTeacher(data.teacher);
    return data;
  };

  const logout = async () => {
    await storage.removeItem('token');
    await storage.removeItem('teacher');
    delete api.defaults.headers.common['Authorization'];
    setTeacher(null);
  };

  return (
    <AuthContext.Provider value={{ teacher, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
