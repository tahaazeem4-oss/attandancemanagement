import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Animated,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../config/theme';

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
}) {
  const insets = useSafeAreaInsets();
  const statusInset = StatusBar.currentHeight ?? 0;
  const headerTopPad = Math.max(insets.top, statusInset) + 18;

  const fadeAnims = useRef(cards.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(cards.map(() => new Animated.Value(20))).current;

  useEffect(() => {
    Animated.stagger(
      55,
      cards.map((_, i) =>
        Animated.parallel([
          Animated.timing(fadeAnims[i], { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.spring(slideAnims[i], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
        ])
      )
    ).start();
  }, [cards, fadeAnims, slideAnims]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} /> : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" translucent={false} />

      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: headerTopPad }]}
      >
        <View style={styles.headerDeco} pointerEvents="none" />

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

            {superBadgeText ? (
              <View style={styles.superBadge}>
                <Text style={styles.superBadgeText}>{superBadgeText}</Text>
              </View>
            ) : null}

            {headerLabel ? <Text style={styles.roleLabel}>{headerLabel}</Text> : null}
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          <Pressable onPress={logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}>
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

      <Text style={styles.sectionTitle}>{sectionTitle}</Text>

      <View style={styles.grid}>
        {cards.map((card, i) => (
          <Animated.View
            key={card.key}
            style={[styles.cardWrap, { opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] }]}
          >
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => navigation.navigate(card.key)}
            >
              <View style={[styles.iconBox, { backgroundColor: card.bg }]}>
                <Ionicons name={card.icon} size={24} color={card.tint} />
              </View>
              <Text style={styles.navLabel}>{card.label}</Text>

              {(badgeByKey?.[card.key] ?? 0) > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{badgeByKey[card.key]}</Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 28, overflow: 'hidden' },
  headerDeco: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -80,
    right: -60,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  schoolBadge: { width: 28, height: 28, borderRadius: 8 },
  schoolBadgeFallback: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  schoolBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  schoolName: { color: '#BFDBFE', fontSize: 13, fontWeight: '600', flex: 1 },
  superBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(147,197,253,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.4)',
  },
  superBadgeText: { color: '#93C5FD', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  roleLabel: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#BFDBFE', fontSize: 12, marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  statsRow: { flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800' },
  statLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textLight,
    marginHorizontal: 20,
    marginTop: 28,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12 },
  cardWrap: { width: '30%', flexGrow: 1 },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    position: 'relative',
    minHeight: 100,
    justifyContent: 'center',
  },
  navCardPressed: { opacity: 0.75 },
  iconBox: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  navLabel: { color: C.textDark, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
