import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function HomeScreen({ navigation }) {
  const { teacher, logout } = useAuth();
  const [todayStatus,  setTodayStatus]  = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [marking,      setMarking]      = useState(false);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  const fetchTodayStatus = async () => {
    try {
      const { data } = await api.get('/teachers/attendance/today');
      setTodayStatus(data);
    } catch {
      setTodayStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  const markOwnAttendance = async (status) => {
    setMarking(true);
    try {
      await api.post('/teachers/attendance', { status });
      setTodayStatus({ status });
      Alert.alert('Attendance Marked', `Your attendance has been marked as ${status.toUpperCase()}`);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const statusColor = {
    present: '#16A34A',
    absent:  '#DC2626',
    leave:   '#D97706',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning,</Text>
          <Text style={styles.name}>{teacher.first_name} {teacher.last_name}</Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Teacher's own attendance */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Attendance Today</Text>
        {loadingStatus ? (
          <ActivityIndicator color="#2563EB" />
        ) : todayStatus ? (
          <View style={[styles.statusBadge, { backgroundColor: statusColor[todayStatus.status] + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor[todayStatus.status] }]}>
              {todayStatus.status.toUpperCase()}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.cardSub}>Mark your attendance for today:</Text>
            <View style={styles.attBtns}>
              {['present', 'absent', 'leave'].map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.attBtn, { backgroundColor: statusColor[s] }]}
                  onPress={() => markOwnAttendance(s)}
                  disabled={marking}
                >
                  {marking
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.attBtnText}>{s.toUpperCase()}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('ClassSelection')}
      >
        <Text style={styles.actionIcon}>📋</Text>
        <View>
          <Text style={styles.actionTitle}>Mark Student Attendance</Text>
          <Text style={styles.actionSub}>Select class & section to begin</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('AddStudent')}
      >
        <Text style={styles.actionIcon}>➕</Text>
        <View>
          <Text style={styles.actionTitle}>Add New Student</Text>
          <Text style={styles.actionSub}>Register a student in the system</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('ClassSelection', { mode: 'report' })}
      >
        <Text style={styles.actionIcon}>📊</Text>
        <View>
          <Text style={styles.actionTitle}>View & Send Report</Text>
          <Text style={styles.actionSub}>Send attendance to WhatsApp group</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F1F5F9' },
  header:       {
    backgroundColor: '#2563EB', padding: 24, paddingTop: 48,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'
  },
  greeting:     { color: '#BFDBFE', fontSize: 14 },
  name:         { color: '#fff', fontSize: 22, fontWeight: '700' },
  date:         { color: '#93C5FD', fontSize: 12, marginTop: 2 },
  logoutBtn:    { backgroundColor: '#1D4ED8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  logoutText:   { color: '#fff', fontSize: 13 },
  card:         {
    margin: 16, backgroundColor: '#fff', borderRadius: 16,
    padding: 20, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 8, elevation: 3
  },
  cardTitle:    { fontSize: 16, fontWeight: '700', color: '#1E3A5F', marginBottom: 12 },
  cardSub:      { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  statusBadge:  { borderRadius: 8, padding: 12, alignItems: 'center' },
  statusText:   { fontSize: 18, fontWeight: '800' },
  attBtns:      { flexDirection: 'row', gap: 8 },
  attBtn:       { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  attBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionTitle: { marginHorizontal: 16, marginTop: 4, marginBottom: 8, fontSize: 15, fontWeight: '700', color: '#374151' },
  actionBtn:    {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff',
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center',
    gap: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2
  },
  actionIcon:   { fontSize: 28 },
  actionTitle:  { fontSize: 15, fontWeight: '600', color: '#1E3A5F' },
  actionSub:    { fontSize: 12, color: '#9CA3AF', marginTop: 2 }
});
