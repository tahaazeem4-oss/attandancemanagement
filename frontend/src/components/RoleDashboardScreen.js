import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../config/theme';
import DashboardCardGrid from './DashboardCardGrid';

export default function RoleDashboardScreen({
  user,
  school,
  logout,
  loading,
  cards,
  stats,
  sectionTitle = 'Management',
  headerLabel,
  subtitle,
  superBadgeText,
  badgeByKey,
  navigation,
  refreshing = false,
  onRefresh,
  preferenceKey,
}) {
  const insets = useSafeAreaInsets();
  const statusInset = StatusBar.currentHeight ?? 0;
  const topInset = Math.max(insets.top, statusInset, 0);
  const headerTopMargin = topInset + 12;
  const heroEyebrow = headerLabel || superBadgeText || 'Management Portal';
  const heroTitle = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || headerLabel || 'Management Portal';
  const heroSubtitle = subtitle || 'Manage people, classes, and activity from one place.';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} /> : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.brandDeep} translucent={false} />

      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { marginTop: headerTopMargin }]}
      >
        <View style={styles.headerDeco} pointerEvents="none" />
        <View style={styles.headerDecoSecondary} pointerEvents="none" />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {school ? (
              <View style={styles.schoolRow}>
                {school.logo_url ? (
                  <Image source={{ uri: school.logo_url }} style={styles.schoolBadge} resizeMode="contain" />
                ) : (
                  <View style={styles.schoolBadgeFallback}>
                    <Text style={styles.schoolBadgeText}>{school.initials || school.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.schoolName} numberOfLines={1}>{school.name}</Text>
              </View>
            ) : null}

            <Text style={styles.roleLabel}>{heroEyebrow}</Text>
            <Text style={styles.name}>{heroTitle}</Text>
            <Text style={styles.subtitle}>{heroSubtitle}</Text>
          </View>

          <Pressable onPress={logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="log-out-outline" size={14} color="#DBEAFE" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          {loading ? (
            <ActivityIndicator color="rgba(255,255,255,0.6)" />
          ) : (
            stats.map((s) => (
              <View key={s.label} style={styles.statItem}>
                <Text style={[styles.statNum, { color: s.color }]}>{s.value ?? '-'}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))
          )}
        </View>
      </LinearGradient>
      <DashboardCardGrid
        cards={cards}
        navigation={navigation}
        badgeByKey={badgeByKey}
        sectionTitle={sectionTitle}
        preferenceKey={preferenceKey}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 18,
    minHeight: 220,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: C.brandDeep,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerDeco: {
    position: 'absolute', width: 190, height: 190, borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.08)', right: -50, top: -68,
  },
  headerDecoSecondary: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(96,165,250,0.12)', left: -48, bottom: -56,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  schoolBadge: { width: 30, height: 30, borderRadius: 9 },
  schoolBadgeFallback: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  schoolBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  schoolName: { color: '#DBEAFE', fontSize: 13, fontWeight: '700', flex: 1 },
  roleLabel: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  subtitle: { color: '#DBEAFE', fontSize: 12, marginTop: 4, lineHeight: 17 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.45)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 12,
  },
  logoutText: { color: '#DBEAFE', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800' },
  statLabel: {
    color: '#BFDBFE',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
