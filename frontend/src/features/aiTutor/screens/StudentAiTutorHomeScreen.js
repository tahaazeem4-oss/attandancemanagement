// frontend/src/features/aiTutor/screens/StudentAiTutorHomeScreen.js
// Subject selection: only subjects that have ready materials for the student's class.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../../config/theme';
import api from '../../../services/api';
import useAiTutorConfig from '../hooks/useAiTutorConfig';
import AiQuotaPill from '../components/AiQuotaPill';
import AiQuotaBanner from '../components/AiQuotaBanner';
import { fetchStudentMaterials } from '../api/aiTutorApi';

const PALETTE = [
  ['#1E40AF', '#2563EB'],
  ['#2563EB', '#60A5FA'],
  ['#0F766E', '#14B8A6'],
  ['#D97706', '#FBBF24'],
  ['#DC2626', '#F87171'],
  ['#0284C7', '#38BDF8'],
  ['#0891B2', '#22D3EE'],
  ['#1D4ED8', '#60A5FA'],
];

function subjectIcon(name) {
  const n = (name || '').toLowerCase();
  if (/math|calc|algebra|geom|trig/.test(n))   return 'calculator-outline';
  if (/physics|phys/.test(n))                   return 'planet-outline';
  if (/chem/.test(n))                           return 'flask-outline';
  if (/bio/.test(n))                            return 'leaf-outline';
  if (/english|liter/.test(n))                  return 'book-outline';
  if (/history|social|geo/.test(n))             return 'earth-outline';
  if (/comp|ict|tech/.test(n))                  return 'laptop-outline';
  if (/art|draw|design/.test(n))                return 'color-palette-outline';
  if (/music/.test(n))                          return 'musical-notes-outline';
  if (/sport|pe\b|phys.ed/.test(n))            return 'football-outline';
  if (/islam|relig|quran/.test(n))              return 'moon-outline';
  if (/urdu|arabic|french|span/.test(n))        return 'language-outline';
  if (/science/.test(n))                        return 'beaker-outline';
  return 'school-outline';
}

export default function StudentAiTutorHomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const childStudentId = route?.params?.child?.student_id ?? route?.params?.child?.id ?? null;
  const child = route?.params?.child || null;
  const { loading: configLoading, enabled, blockedAt, quota, error: configError, refresh } = useAiTutorConfig({ studentId: childStudentId });
  const [subjects, setSubjects] = useState([]);
  const [materialsMap, setMaterialsMap] = useState({});
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const matsRes = await fetchStudentMaterials(childStudentId);
      const materials = matsRes.data?.materials || [];
      const map = {};
      const subjMap = {};
      for (const m of materials) {
        const sid = m.subject_id;
        if (sid == null) continue;
        if (!map[sid]) map[sid] = [];
        map[sid].push(m);
        if (!subjMap[sid]) {
          subjMap[sid] = { id: sid, name: m.subject_name || `Subject #${sid}` };
        }
      }
      setSubjects(Object.values(subjMap));
      setMaterialsMap(map);
    } catch {
      setSubjects([]);
      setMaterialsMap({});
    } finally {
      setDataLoading(false);
    }
  }, [childStudentId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (configLoading || dataLoading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <View style={styles.loaderIcon}>
          <Ionicons name="sparkles" size={36} color={C.primary} />
        </View>
        <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Loading AI Tutor…</Text>
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={[styles.flex, styles.center]}>
        <View style={styles.disabledIcon}>
          <Ionicons name="sparkles-outline" size={36} color={C.primary} />
        </View>
        <Text style={styles.disabledTitle}>AI Tutor Unavailable</Text>
        <Text style={styles.disabledBody}>
          {configError || `Disabled${blockedAt ? ` at ${blockedAt} level` : ''}.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {/* Custom gradient header */}
      <LinearGradient
        colors={C.brandGradient}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>STUDENT PORTAL</Text>
            <Text style={styles.headerTitle}>Choose a Subject</Text>
          </View>
          <AiQuotaPill quota={quota} />
        </View>
        <Text style={styles.headerSub}>
          {subjects.length > 0
            ? `${subjects.length} subject${subjects.length !== 1 ? 's' : ''} with study material`
            : 'Study materials from your teacher'}
        </Text>
      </LinearGradient>

      <AiQuotaBanner quota={quota} />

      {subjects.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="documents-outline" size={44} color={C.primary} />
          </View>
          <Text style={styles.emptyTitle}>No materials yet</Text>
          <Text style={styles.emptyBody}>
            Your teacher hasn't uploaded study materials for your class yet. Check back soon!
          </Text>
        </View>
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={styles.grid}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item, index }) => {
            const mats = materialsMap[item.id] || [];
            const [c1, c2] = PALETTE[index % PALETTE.length];
            const firstMat = mats[0];
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.82}
                onPress={() =>
                  navigation.navigate('StudentAiMaterials', {
                    subjectId: item.id,
                    subjectName: item.name,
                    materials: mats,
                    ...(child ? { child } : {}),
                  })
                }
              >
                <LinearGradient colors={[c1, c2]} style={styles.cardGrad}>
                  <View style={styles.cardIconWrap}>
                    <Ionicons name={subjectIcon(item.name)} size={26} color="rgba(255,255,255,0.95)" />
                  </View>
                  <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.cardBadge}>
                    <Ionicons name="document-text-outline" size={11} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.cardBadgeText}>
                      {mats.length} file{mats.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </LinearGradient>
                {firstMat && (
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardFooterText} numberOfLines={2}>
                      {firstMat.title}
                    </Text>
                  </View>
                )}
                <View style={styles.cardArrow}>
                  <Ionicons name="arrow-forward" size={13} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loaderIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  loadingText: { marginTop: 12, color: C.primary, fontWeight: '600', fontSize: 14 },
  disabledIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  disabledTitle: { fontSize: 20, fontWeight: '800', color: C.textDark, marginBottom: 8 },
  disabledBody: { color: C.textMed, textAlign: 'center', lineHeight: 22 },

  header: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: C.brandDeep,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  headerLabel: { color: C.headerSub, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  headerTitle: { color: C.headerText, fontSize: 24, fontWeight: '800' },
  headerSub: { color: C.headerSub, fontSize: 13, marginTop: 2 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8 },
  emptyBody: { color: C.textLight, textAlign: 'center', lineHeight: 22, fontSize: 13 },

  grid: { padding: 14, paddingBottom: 36 },
  gridRow: { justifyContent: 'space-between', marginBottom: 14 },
  card: {
    width: '48.5%', borderRadius: 20, backgroundColor: C.card, overflow: 'hidden',
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13, shadowRadius: 12, elevation: 5,
  },
  cardGrad: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 14 },
  cardIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  cardName: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 20, marginBottom: 10 },
  cardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  cardBadgeText: { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: '700' },
  cardFooter: { paddingHorizontal: 12, paddingVertical: 10, paddingRight: 30 },
  cardFooterText: { fontSize: 11, color: C.textMed, lineHeight: 16 },
  cardArrow: {
    position: 'absolute', bottom: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
});

