import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, RefreshControl, Animated, StatusBar, Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { C } from '../../config/theme';
import DashboardCardGrid from '../../components/DashboardCardGrid';
import { buildDashboardCards } from '../../config/dashboardCards';
import useAiTutorConfig from '../../features/aiTutor/hooks/useAiTutorConfig';
import AiUsageCard from '../../features/aiTutor/components/AiUsageCard';

const ACTIONS = buildDashboardCards([
  { type: 'attendanceHistory', key: 'StudentHistory' },
  { type: 'timetable', key: 'StudentTimetable' },
  { type: 'leaveApplications', key: 'StudentLeaves' },
  { type: 'classWork', key: 'StudentClasswork' },
  { type: 'homework', key: 'StudentHomework' },
  { type: 'circulars', key: 'StudentNotifications' },
  { type: 'aiTutor', key: 'StudentAiTutorHome' },
]);

const HIGHLIGHT_TONES = {
  success: {
    iconBg: 'rgba(16,185,129,0.2)',
    icon: '#A7F3D0',
  },
  warn: {
    iconBg: 'rgba(245,158,11,0.2)',
    icon: '#FDE68A',
  },
  info: {
    iconBg: 'rgba(96,165,250,0.18)',
    icon: '#BFDBFE',
  },
};

export default function StudentHomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, school, logout } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvedCampus, setResolvedCampus] = useState(null);
  const entrance = useRef(new Animated.Value(0)).current;

  // Support parent viewing child's portal
  const childData = route?.params?.child;
  const isParentViewing = !!childData;
  const childStudentId = childData?.student_id ?? childData?.id ?? null;
  const { loading: aiConfigLoading, enabled: aiEnabled, quota: aiQuota, refresh: refreshAiConfig } = useAiTutorConfig({ studentId: childStudentId });
  const displayUser = childData || user;

  useEffect(() => {
    const now = new Date();
    const endpoint = isParentViewing
      ? `/parent/children/${childData.student_id}/attendance`
      : '/student-portal/attendance';
    
    api.get(endpoint, { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
      .then(({ data }) => {
        if (data?.stats) {
          setStats(data.stats);
          return;
        }
        const records = data?.records || data?.attendance || [];
        if (!Array.isArray(records)) {
          setStats(null);
          return;
        }
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const leave = records.filter(r => r.status === 'leave').length;
        setStats({ present, absent, leave, total: records.length });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isParentViewing, childData?.student_id]);

  useEffect(() => {
    const schoolId = childData?.school_id || displayUser?.school_id || user?.school_id;
    if (!schoolId) {
      setResolvedCampus(null);
      return;
    }

    let mounted = true;
    api.get('/schools')
      .then(({ data }) => {
        const schools = Array.isArray(data) ? data : [];
        const found = schools.find((s) => Number(s?.id) === Number(schoolId)) || null;
        if (mounted) setResolvedCampus(found);
      })
      .catch(() => {
        if (mounted) setResolvedCampus(null);
      });

    return () => { mounted = false; };
  }, [childData?.school_id, displayUser?.school_id, user?.school_id]);

  useFocusEffect(
    useCallback(() => {
      refreshAiConfig();
    }, [refreshAiConfig])
  );

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: loading ? 0 : 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, loading, stats?.total]);

  const openStudentProfile = useCallback(() => {
    if (isParentViewing) {
      navigation.navigate('StudentProfile', { child: childData });
      return;
    }
    navigation.navigate('StudentProfile');
  }, [childData, isParentViewing, navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const now = new Date();
      const endpoint = isParentViewing
        ? `/parent/children/${childData.student_id}/attendance`
        : '/student-portal/attendance';

      const { data } = await api.get(endpoint, { params: { month: now.getMonth() + 1, year: now.getFullYear() } });
      if (data?.stats) {
        setStats(data.stats);
      } else {
        const records = data?.records || data?.attendance || [];
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const leave = records.filter(r => r.status === 'leave').length;
        setStats({ present, absent, leave, total: records.length });
      }
    } finally {
      setRefreshing(false);
    }
  }, [isParentViewing, childData?.student_id]);

  const attendancePct = stats && stats.total > 0
    ? Math.round((stats.present / stats.total) * 100)
    : null;
  const topInset = Math.max(insets.top, 0);
  const heroMarginTop = topInset + 6;
  const attendanceSummary = useMemo(() => {
    if (loading) {
      return {
        title: 'Preparing your dashboard',
        body: 'Attendance and portal shortcuts are loading now.',
        tone: 'info',
        icon: 'hourglass-outline',
      };
    }

    if (!stats || !stats.total) {
      return {
        title: 'No attendance records yet',
        body: 'Your latest attendance summary will appear here once records are available.',
        tone: 'info',
        icon: 'sparkles-outline',
      };
    }

    if (stats.absent > 0) {
      return {
        title: `${stats.absent} absence${stats.absent === 1 ? '' : 's'} recorded`,
        body: 'Open attendance history to review recent records and totals.',
        tone: 'warn',
        icon: 'alert-circle-outline',
      };
    }

    if (stats.leave > 0) {
      return {
        title: `${stats.leave} leave day${stats.leave === 1 ? '' : 's'} on record`,
        body: 'Use the leave screen to review status updates or submit another request.',
        tone: 'info',
        icon: 'document-text-outline',
      };
    }

    return {
      title: 'Attendance is looking strong',
      body: `${stats.present} present day${stats.present === 1 ? '' : 's'} recorded${attendancePct !== null ? ` with a ${attendancePct}% rate` : ''}.`,
      tone: 'success',
      icon: 'checkmark-circle-outline',
    };
  }, [attendancePct, loading, stats]);

  const snapshotCards = useMemo(() => {
    const cards = [
      {
        key: 'present',
        label: 'Present Days',
        value: stats?.present ?? '--',
        note: 'On record this period',
        icon: 'checkmark-done-outline',
        accent: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
      },
      {
        key: 'rate',
        label: 'Attendance Rate',
        value: attendancePct !== null ? `${attendancePct}%` : '--',
        note: stats?.total ? `${stats.total} total entries` : 'Waiting for records',
        icon: 'analytics-outline',
        accent: '#2563EB',
        bg: '#EFF6FF',
        border: '#BFDBFE',
      },
    ];

    if ((stats?.leave ?? 0) > 0 || (stats?.absent ?? 0) > 0) {
      cards.push({
        key: 'attention',
        label: 'Needs Review',
        value: (stats?.leave ?? 0) + (stats?.absent ?? 0),
        note: 'Leaves and absences combined',
        icon: 'alert-outline',
        accent: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
      });
    } else {
      cards.push({
        key: 'profile',
        label: 'Student Profile',
        value: 'Open',
        note: 'School, class, teacher, and campus details',
        icon: 'person-circle-outline',
        accent: '#7C3AED',
        bg: '#F5F3FF',
        border: '#DDD6FE',
        onPress: openStudentProfile,
      });
    }

    return cards;
  }, [attendancePct, isParentViewing, openStudentProfile, stats?.absent, stats?.leave, stats?.present, stats?.total]);

  const heroTone = HIGHLIGHT_TONES[attendanceSummary.tone] || HIGHLIGHT_TONES.info;
  const quickActions = ACTIONS
    .filter((card) => !(card.key === 'StudentAiTutorHome' && !aiConfigLoading && !aiEnabled))
    .map((card) => ({
      ...card,
      onPress: () => {
        if (isParentViewing) {
          navigation.navigate(card.key, { child: childData });
          return;
        }
        navigation.navigate(card.key);
      },
    }));

  const animatedContentStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.wrapper}>
      <StatusBar barStyle="light-content" backgroundColor={C.brandDeep} translucent={false} />
      <View style={styles.bgOrbTop} pointerEvents="none" />
      <View style={styles.bgOrbBottom} pointerEvents="none" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
      >
        <Animated.View style={animatedContentStyle}>
          <LinearGradient
            colors={C.brandGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[
              styles.header,
              {
                marginTop: heroMarginTop,
                paddingTop: 20,
              },
            ]}
          >
            <View style={styles.headerDeco} pointerEvents="none" />
            <View style={styles.headerDecoSecondary} pointerEvents="none" />

            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.roleLabel}>{isParentViewing ? 'Child Portal' : 'Student Portal'}</Text>
                <Text style={styles.name}>{displayUser?.first_name} {displayUser?.last_name}</Text>
                <Text style={styles.meta}>{displayUser?.class_name} · Sec {displayUser?.section_name} · ID: {displayUser?.roll_no}</Text>
              </View>
              {isParentViewing ? (
                <View style={styles.liveBadge}>
                  <Ionicons name="eye-outline" size={13} color="#DBEAFE" />
                  <Text style={styles.liveText}>LIVE VIEW</Text>
                </View>
              ) : (
                <Pressable
                  onPress={logout}
                  style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="log-out-outline" size={14} color="#DBEAFE" />
                  <Text style={styles.logoutText}>Sign Out</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.heroHighlightCard}>
              <View style={[styles.heroHighlightIcon, { backgroundColor: heroTone.iconBg }]}>
                <Ionicons name={attendanceSummary.icon} size={18} color={heroTone.icon} />
              </View>
              <View style={styles.heroHighlightCopy}>
                <Text style={styles.heroHighlightTitle}>{attendanceSummary.title}</Text>
                <Text style={styles.heroHighlightBody}>{attendanceSummary.body}</Text>
              </View>
            </View>

            {!loading && stats ? (
              <View style={styles.summaryRow}>
                {[
                  { label: 'Present', value: stats.present, color: '#6EE7B7' },
                  { label: 'Absent',  value: stats.absent,  color: '#FCA5A5' },
                  { label: 'Leave',   value: stats.leave,   color: '#FDE68A' },
                  ...(attendancePct !== null ? [{ label: 'Rate', value: `${attendancePct}%`, color: '#93C5FD' }] : []),
                ].map((s) => (
                  <View key={s.label} style={styles.summaryItem}>
                    <Text style={[styles.summaryNum, { color: s.color }]}>{s.value}</Text>
                    <Text style={styles.summaryLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {loading ? <ActivityIndicator color="rgba(255,255,255,0.65)" style={{ marginTop: 20 }} /> : null}
          </LinearGradient>

          <View style={styles.snapshotGrid}>
            {snapshotCards.map((card, index) => {
              const isOddTrailingCard = snapshotCards.length % 2 === 1 && index === snapshotCards.length - 1;
              const cardStyle = [
                styles.snapshotCard,
                isOddTrailingCard && styles.snapshotCardFull,
                { backgroundColor: card.bg, borderColor: card.border },
                card.onPress && styles.snapshotCardInteractive,
              ];

              if (card.onPress) {
                return (
                  <Pressable
                    key={card.key}
                    onPress={card.onPress}
                    style={({ pressed }) => [cardStyle, pressed && styles.snapshotCardPressed]}
                  >
                    <View style={[styles.snapshotIconWrap, { backgroundColor: `${card.accent}18` }]}>
                      <Ionicons name={card.icon} size={18} color={card.accent} />
                    </View>
                    <Text style={styles.snapshotLabel}>{card.label}</Text>
                    <Text style={styles.snapshotValue}>{card.value}</Text>
                    <Text style={styles.snapshotNote}>{card.note}</Text>
                    <View style={styles.snapshotActionRow}>
                      <Text style={[styles.snapshotActionText, { color: card.accent }]}>View profile</Text>
                      <Ionicons name="arrow-forward" size={14} color={card.accent} />
                    </View>
                  </Pressable>
                );
              }

              return (
                <View
                  key={card.key}
                  style={cardStyle}
                >
                  <View style={[styles.snapshotIconWrap, { backgroundColor: `${card.accent}18` }]}>
                    <Ionicons name={card.icon} size={18} color={card.accent} />
                  </View>
                  <Text style={styles.snapshotLabel}>{card.label}</Text>
                  <Text style={styles.snapshotValue}>{card.value}</Text>
                  <Text style={styles.snapshotNote}>{card.note}</Text>
                </View>
              );
            })}
          </View>

          {aiEnabled && aiQuota ? (
            <AiUsageCard
              quota={aiQuota}
              onPress={() => {
                if (isParentViewing) {
                  navigation.navigate('StudentAiAnalytics', { child: childData });
                } else {
                  navigation.navigate('StudentAiAnalytics');
                }
              }}
            />
          ) : null}

          <DashboardCardGrid
            cards={quickActions}
            sectionTitle="Quick Actions"
            columns={2}
            allowReorder={!isParentViewing}
            sectionInset={20}
            gridInset={14}
            preferenceKey={isParentViewing ? null : `dashboard:student:${displayUser?.student_id || displayUser?.id || displayUser?.email || 'anon'}`}
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },
  bgOrbTop: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(37,99,235,0.08)',
    top: -120,
    right: -90,
  },
  bgOrbBottom: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(124,58,237,0.06)',
    left: -100,
    bottom: 80,
  },

  header: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  headerDeco: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)', top: -70, right: -50 },
  headerDecoSecondary: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(96,165,250,0.14)', bottom: -50, left: -32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1 },
  roleLabel: { color: '#93C5FD', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800' },
  meta: { color: '#BFDBFE', fontSize: 12, marginTop: 5, lineHeight: 18 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoutText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  liveBadge: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(191,219,254,0.4)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { color: '#DBEAFE', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  heroHighlightCard: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.24)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroHighlightIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHighlightCopy: { flex: 1 },
  heroHighlightTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  heroHighlightBody: { color: '#DBEAFE', fontSize: 12, lineHeight: 18, marginTop: 4 },
  summaryRow: { flexDirection: 'row', marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  snapshotGrid: {
    marginTop: 14,
    marginHorizontal: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 14,
  },
  snapshotCard: {
    width: '48.5%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 110,
  },
  snapshotCardFull: { width: '100%' },
  snapshotCardInteractive: { shadowColor: '#7C3AED', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  snapshotCardPressed: { opacity: 0.92 },
  snapshotIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotLabel: { color: C.textMed, fontSize: 10, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase', marginTop: 10 },
  snapshotValue: { color: C.textDark, fontSize: 21, fontWeight: '800', marginTop: 6 },
  snapshotNote: { color: C.textMed, fontSize: 11, lineHeight: 16, marginTop: 3 },
  snapshotActionRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  snapshotActionText: { fontSize: 12, fontWeight: '800' },
});
