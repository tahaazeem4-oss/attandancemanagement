// frontend/src/features/aiTutor/screens/StudentAiTutorHomeScreen.js
// Entry card for students; navigates into chat per subject. Hides itself if disabled.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../../services/api';
import useAiTutorConfig from '../hooks/useAiTutorConfig';
import AiQuotaPill from '../components/AiQuotaPill';

export default function StudentAiTutorHomeScreen({ navigation, route }) {
  const initialSubjects = route?.params?.subjects;
  const [subjects, setSubjects] = useState(Array.isArray(initialSubjects) ? initialSubjects : []);
  const [subjLoading, setSubjLoading] = useState(!Array.isArray(initialSubjects));
  const { loading, enabled, blockedAt, quota } = useAiTutorConfig();

  useEffect(() => {
    if (Array.isArray(initialSubjects)) return;
    let mounted = true;
    api.get('/subjects')
      .then(({ data }) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data.filter((s) => s && s.id != null) : [];
        setSubjects(list);
      })
      .catch(() => mounted && setSubjects([]))
      .finally(() => mounted && setSubjLoading(false));
    return () => { mounted = false; };
  }, [initialSubjects]);

  if (loading || subjL [subjLoading, setSubjLoading] = useState(!Array.isArray(initialSubjects));
  const { loading, enabled, blockedAt, quota } = useAiTutorConfig();

  useEffect(() => {
    if (Array.isArray(initialSubjects)) return;
    let mounted = true;
    api.get('/subjects')
      .then(({ data }) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data.filter((s) => s && s.id != null) : [];
        setSubjects(list);
      })
      .catch(() => mounted && setSubjects([]))
      .finally(() => mounted && setSubjLoading(false));
    return () => { mounted = false; };
  }, [initialSubjects]);

  if (loading || subjLoading) return <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>;
  if (!enabled) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>AI Tutor unavailable</Text>
        <Text style={styles.body}>Disabled{blockedAt ? ` at ${blockedAt} level` : ''}.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Text style={styles.title}>Pick a subject</Text>
        <AiQuotaPill quota={quota} />
      </View>
      <FlatList
        data={subjects}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>No subjects available.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('StudentAiChat', { subjectId: item.id, subjectName: item.name })}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardHint}>Ask grounded questions from your uploaded material</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { color: '#6B7280', marginTop: 6 },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 30 },
  card: { padding: 14, backgroundColor: '#F3F4F6', borderRadius: 12, marginBottom: 10 },
  cardTitle: { fontWeight: '700', fontSize: 16, color: '#111827' },
  cardHint: { color: '#6B7280', marginTop: 4, fontSize: 12 },
});
