import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, Alert, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C } from '../config/theme';
import { HeaderBlobs } from '../components/Deco';

const STATUS_COLOR = { present: C.present, absent: C.absent, leave: C.leave, not_marked: C.textLight };
const STATUS_BG    = { present: C.presentBg, absent: C.absentBg, leave: C.leaveBg, not_marked: '#F1F5F9' };
const STATUS_LABEL = { present: 'Present', absent: 'Absent', leave: 'On Leave', not_marked: 'Not Marked' };

export default function ReportScreen({ route }) {
  const { class_id, section_id, class_name, section_name } = route.params;

  const [records,  setRecords]  = useState([]);
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const btnS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnS, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();
  // Summary card entrance animations
  const s1o = useRef(new Animated.Value(0)).current, s1y = useRef(new Animated.Value(20)).current;
  const s2o = useRef(new Animated.Value(0)).current, s2y = useRef(new Animated.Value(20)).current;
  const s3o = useRef(new Animated.Value(0)).current, s3y = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([ Animated.timing(s1o, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.spring(s1y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }) ]),
      Animated.parallel([ Animated.timing(s2o, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.spring(s2y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }) ]),
      Animated.parallel([ Animated.timing(s3o, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.spring(s3y, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }) ]),
    ]).start();
  }, []);

  useEffect(() => { fetchReport(); }, [date]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/report', {
        params: { class_id, section_id, date }
      });
      setRecords(data.records || []);
    } catch {
      Alert.alert('Error', 'Could not load report');
    } finally {
      setLoading(false);
    }
  };

  const sendToWhatsApp = async () => {
    setSending(true);
    try {
      await api.post('/attendance/send-whatsapp', { class_id, section_id, date });
      Alert.alert('Sent!', 'Attendance report sent to WhatsApp group successfully 📲');
    } catch (err) {
      Alert.alert('Failed', err?.response?.data?.message || 'Could not send to WhatsApp');
    } finally {
      setSending(false);
    }
  };

  const counts = {
    present: records.filter(r => r.status === 'present').length,
    absent:  records.filter(r => r.status === 'absent').length,
    leave:   records.filter(r => r.status === 'leave').length
  };

  const CARD_ANIMS = [
    { o: s1o, y: s1y, key: 'present', icon: '✓', colors: ['#ECFDF5','#D1FAE5'] },
    { o: s2o, y: s2y, key: 'absent',  icon: '✗', colors: ['#FEF2F2','#FEE2E2'] },
    { o: s3o, y: s3y, key: 'leave',   icon: '~', colors: ['#FFFBEB','#FEF3C7'] },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* Gradient header */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <Text style={styles.headerTitle}>{class_name} — Section {section_name}</Text>
        <Text style={styles.headerDate}>📅  {date}</Text>
      </LinearGradient>

      {/* Animated summary cards */}
      <View style={styles.summary}>
        {CARD_ANIMS.map(({ o, y, key, icon, colors }) => (
          <Animated.View key={key} style={{ flex: 1, opacity: o, transform: [{ translateY: y }] }}>
            <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
              <Text style={[styles.summaryIcon, { color: STATUS_COLOR[key] }]}>{icon}</Text>
              <Text style={[styles.summaryNum, { color: STATUS_COLOR[key] }]}>{counts[key]}</Text>
              <Text style={[styles.summaryLabel, { color: STATUS_COLOR[key] }]}>{key.toUpperCase()}</Text>
            </LinearGradient>
          </Animated.View>
        ))}
      </View>

      {/* Student records */}
      {loading
        ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={C.primary} size="large" />
          </View>
        )
        : (
          <FlatList
            data={records}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 110, paddingTop: 8 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <LinearGradient
                  colors={['#EEF2FF', '#E0E7FF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{item.first_name[0]}{item.last_name[0]}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.first_name} {item.last_name}</Text>
                  {item.roll_no && <Text style={styles.rowRoll}>#{item.roll_no}</Text>}
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_BG[item.status] }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status] || item.status}
                  </Text>
                </View>
              </View>
            )}
          />
        )}

      {/* Footer */}
      <View style={styles.footer}>
        <Animated.View style={{ transform: [{ scale: btnS }] }}>
          <Pressable onPress={sendToWhatsApp} disabled={sending || loading} onPressIn={pIn} onPressOut={pOut}>
            <LinearGradient
              colors={['#25D366', '#1DA851', '#128C3E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.waBtn}
            >
              {sending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.waBtnText}>📲  Send to WhatsApp Group</Text>}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },

  header:       {
    paddingHorizontal: 20, paddingVertical: 22, overflow: 'hidden',
  },
  headerTitle:  { color: '#E0E7FF', fontSize: 17, fontWeight: '800' },
  headerDate:   { color: C.headerSub, fontSize: 13, marginTop: 4 },

  summary:      {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderBottomWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 12,
    gap: 10,
  },
  summaryCard:  {
    flex: 1, alignItems: 'center', borderRadius: 14,
    paddingVertical: 12,
  },
  summaryIcon:  { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  summaryNum:   { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 9, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },

  row:          {
    backgroundColor: C.card, borderRadius: 14, marginVertical: 4,
    paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: C.shadow, shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar:       {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText:   { color: C.primary, fontWeight: '800', fontSize: 12 },
  rowName:      { fontSize: 14, fontWeight: '700', color: C.textDark },
  rowRoll:      { fontSize: 11, color: C.textLight, marginTop: 1 },
  statusPill:   { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:   { fontSize: 11, fontWeight: '700' },

  footer:       {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 24,
    backgroundColor: C.card,
    borderTopWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 }, elevation: 8,
  },
  waBtn:        {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#25D366', shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  waBtnText:    { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
