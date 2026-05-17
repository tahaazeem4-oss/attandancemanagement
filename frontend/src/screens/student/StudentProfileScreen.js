import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';
import { useAuth } from '../../context/AuthContext';

function DetailRow({ icon, label, value, subtle = false }) {
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIconWrap, subtle && styles.detailIconWrapSubtle]}>
        <Ionicons name={icon} size={18} color={subtle ? C.textMed : C.primary} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || 'Not available yet'}</Text>
      </View>
    </View>
  );
}

export default function StudentProfileScreen({ route }) {
  const { user, school } = useAuth();
  const child = route?.params?.child || null;
  const isParentViewing = !!child;
  const studentId = child?.student_id ?? child?.id ?? user?.student_id ?? user?.id ?? null;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!studentId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const endpoint = isParentViewing
        ? `/parent/children/${studentId}/profile`
        : '/student-portal/profile';
      const { data } = await api.get(endpoint);
      setProfile(data || null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [isParentViewing, studentId]);

  useEffect(() => {
    setLoading(true);
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);

  const displayProfile = profile || child || user || {};
  const campusName = profile?.campus_name || profile?.school_name || child?.school_name || displayProfile?.school_name || school?.name || 'Campus';
  const campusLogo = profile?.campus_image_url || profile?.school_logo_url || child?.school_logo_url || displayProfile?.school_logo_url || school?.logo_url || null;
  const campusInitials = String(campusName || 'CP').slice(0, 2).toUpperCase();
  const teacherNames = Array.isArray(profile?.teacher_names) && profile.teacher_names.length
    ? profile.teacher_names.join(', ')
    : profile?.primary_teacher_name || 'Not assigned yet';
  const teacherCount = profile?.teacher_names?.length ?? (profile?.primary_teacher_name ? 1 : null) ?? '—';
  const stats = useMemo(() => ([
    { key: 'roll', label: 'Roll No', value: displayProfile.roll_no || '—' },
    { key: 'age', label: 'Age', value: displayProfile.age ?? '—' },
    { key: 'teachers', label: 'Teachers', value: teacherCount },
  ]), [displayProfile.age, displayProfile.roll_no, teacherCount]);

  if (loading && !profile) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={C.primary} size="large" />
        <Text style={styles.loaderText}>Loading student profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
    >
      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroOrb} pointerEvents="none" />
        <Text style={styles.heroEyebrow}>{isParentViewing ? 'Parent Student Profile' : 'Student Profile'}</Text>
        <Text style={styles.heroTitle}>{displayProfile.first_name} {displayProfile.last_name}</Text>
        <Text style={styles.heroMeta}>{profile?.class_name || displayProfile.class_name || 'Class'} • Sec {profile?.section_name || displayProfile.section_name || '—'} • #{displayProfile.roll_no || '—'}</Text>

        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <Ionicons name="school-outline" size={14} color="#DBEAFE" />
            <Text style={styles.heroBadgeText}>{campusName}</Text>
          </View>
          {isParentViewing && profile?.relationship ? (
            <View style={styles.heroBadge}>
              <Ionicons name="people-outline" size={14} color="#DBEAFE" />
              <Text style={styles.heroBadgeText}>{profile.relationship}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroStatRow}>
          {stats.map((item) => (
            <View key={item.key} style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{item.value}</Text>
              <Text style={styles.heroStatLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.campusCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Campus</Text>
          <Text style={styles.sectionSub}>School and campus details for this student.</Text>
        </View>

        <View style={styles.campusMain}>
          {campusLogo ? (
            <Image source={{ uri: campusLogo }} style={styles.campusImage} resizeMode="cover" />
          ) : (
            <View style={styles.campusImageFallback}>
              <Text style={styles.campusImageFallbackText}>{campusInitials}</Text>
            </View>
          )}
          <View style={styles.campusCopy}>
            <Text style={styles.campusName}>{campusName}</Text>
            <Text style={styles.campusMeta}>{profile?.school_city || 'City not available'}</Text>
            <Text style={styles.campusBody}>{profile?.school_address || 'Address details have not been added yet for this campus.'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.detailCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Student Details</Text>
          <Text style={styles.sectionSub}>Core academic and campus information.</Text>
        </View>

        <DetailRow icon="id-card-outline" label="Student ID" value={String(displayProfile.student_id || displayProfile.id || '—')} subtle />
        <DetailRow icon="person-outline" label="Full Name" value={`${displayProfile.first_name || ''} ${displayProfile.last_name || ''}`.trim()} />
        <DetailRow icon="library-outline" label="Class" value={profile?.class_name || displayProfile.class_name} />
        <DetailRow icon="albums-outline" label="Section" value={profile?.section_name || displayProfile.section_name} subtle />
        <DetailRow icon="ribbon-outline" label="Roll Number" value={String(displayProfile.roll_no || '—')} subtle />
        <DetailRow icon="people-circle-outline" label="Assigned Teacher" value={teacherNames} />
        <DetailRow icon="business-outline" label="School / Campus" value={campusName} subtle />
        <DetailRow icon="call-outline" label="Campus Phone" value={profile?.school_phone || 'Not available yet'} subtle />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 32 },
  loaderWrap: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loaderText: { marginTop: 12, color: C.textMed, fontSize: 13 },
  heroCard: {
    marginTop: 12,
    marginHorizontal: 14,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    overflow: 'hidden',
  },
  heroOrb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -52,
    top: -54,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroEyebrow: { color: '#93C5FD', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 6 },
  heroMeta: { color: '#DBEAFE', fontSize: 12, lineHeight: 18, marginTop: 4 },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.25)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroBadgeText: { color: '#DBEAFE', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  heroStatRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  heroStatItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.18)',
  },
  heroStatValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroStatLabel: { color: '#BFDBFE', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.45, marginTop: 4 },
  campusCard: {
    marginTop: 14,
    marginHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  sectionHead: { marginBottom: 12 },
  sectionTitle: { color: C.textDark, fontSize: 16, fontWeight: '800' },
  sectionSub: { color: C.textMed, fontSize: 12, lineHeight: 18, marginTop: 4 },
  campusMain: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  campusImage: { width: 88, height: 88, borderRadius: 18, backgroundColor: '#E2E8F0' },
  campusImageFallback: {
    width: 88,
    height: 88,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  campusImageFallbackText: { color: '#1D4ED8', fontSize: 24, fontWeight: '900' },
  campusCopy: { flex: 1 },
  campusName: { color: C.textDark, fontSize: 17, fontWeight: '800' },
  campusMeta: { color: C.primary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  campusBody: { color: C.textMed, fontSize: 12, lineHeight: 18, marginTop: 6 },
  detailCard: {
    marginTop: 14,
    marginHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
  },
  detailIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailIconWrapSubtle: { backgroundColor: '#F8FAFC' },
  detailCopy: { flex: 1 },
  detailLabel: { color: C.textMed, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { color: C.textDark, fontSize: 14, fontWeight: '700', marginTop: 4, lineHeight: 20 },
});