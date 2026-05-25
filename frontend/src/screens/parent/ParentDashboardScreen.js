import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl, Animated, StatusBar, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { C } from '../../config/theme';
import { useAuth } from '../../context/AuthContext';

const CHILD_ACCENTS = [
  {
    gradient: ['#1D4ED8', '#2563EB'],
    tint: '#DBEAFE',
    glow: 'rgba(37,99,235,0.14)',
    icon: 'rgba(37,99,235,0.1)',
  },
  {
    gradient: ['#0F766E', '#14B8A6'],
    tint: '#CCFBF1',
    glow: 'rgba(20,184,166,0.14)',
    icon: 'rgba(20,184,166,0.12)',
  },
  {
    gradient: ['#B45309', '#F59E0B'],
    tint: '#FEF3C7',
    glow: 'rgba(245,158,11,0.16)',
    icon: 'rgba(245,158,11,0.12)',
  },
  {
    gradient: ['#7C3AED', '#A855F7'],
    tint: '#EDE9FE',
    glow: 'rgba(168,85,247,0.14)',
    icon: 'rgba(168,85,247,0.12)',
  },
];

export default function ParentDashboardScreen({ navigation }) {
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [overview, setOverview] = useState({
    totalChildren: 0,
    markedToday: 0,
    presentToday: 0,
    unreadNotifications: 0,
    pendingLeaves: 0,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const topInset = Math.max(insets.top, 0);
  const heroMarginTop = topInset + 6;
  const entrance = useRef(new Animated.Value(0)).current;

  const summarizeChildren = useCallback(async (list) => {
    if (!Array.isArray(list) || list.length === 0) {
      setOverview({
        totalChildren: 0,
        markedToday: 0,
        presentToday: 0,
        unreadNotifications: 0,
        pendingLeaves: 0,
      });
      return;
    }

    setOverviewLoading(true);
    try {
      const summary = {
        totalChildren: list.length,
        markedToday: 0,
        presentToday: 0,
        unreadNotifications: 0,
        pendingLeaves: 0,
      };

      await Promise.all(list.map(async (child) => {
        const id = child.student_id;
        const [attRes, notifRes, leavesRes] = await Promise.allSettled([
          api.get(`/parent/children/${id}/attendance`),
          api.get(`/parent/children/${id}/notifications`),
          api.get(`/parent/children/${id}/leaves`),
        ]);

        if (attRes.status === 'fulfilled') {
          const records = attRes.value?.data?.records || [];
          const todayRecord = records.find((r) => String(r?.date || '').slice(0, 10) === todayIso);
          if (todayRecord) {
            summary.markedToday += 1;
            if (todayRecord.status === 'present') summary.presentToday += 1;
          }
        }

        if (notifRes.status === 'fulfilled') {
          const notifications = notifRes.value?.data?.notifications || [];
          summary.unreadNotifications += notifications.filter((n) => !n?.is_read).length;
        }

        if (leavesRes.status === 'fulfilled') {
          const leaves = leavesRes.value?.data?.leaves || [];
          summary.pendingLeaves += leaves.filter((l) => l?.status === 'pending' || l?.withdrawal_status === 'pending').length;
        }
      }));

      setOverview(summary);
    } catch {
      setOverview((prev) => ({ ...prev, totalChildren: list.length }));
    } finally {
      setOverviewLoading(false);
    }
  }, [todayIso]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/parent/dashboard');
      const list = data.children || [];
      setChildren(list);
      summarizeChildren(list);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      Alert.alert('Error', 'Could not load your children');
    } finally {
      setLoading(false);
    }
  }, [summarizeChildren]);

  const loadChatUnread = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      const total = (data || []).reduce((sum, conv) => sum + (Number(conv?.unread_count) || 0), 0);
      setChatUnread(total);
    } catch {
      setChatUnread(0);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadChatUnread();
  }, [loadDashboard]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      loadChatUnread();
    }, [loadChatUnread, loadDashboard]),
  );

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: loading ? 0 : 1,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, loading, children.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get('/parent/dashboard');
      const list = data.children || [];
      setChildren(list);
      summarizeChildren(list);
      loadChatUnread();
    } catch (err) {
      Alert.alert('Error', 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [summarizeChildren, loadChatUnread]);

  const handleChildPressed = (child) => {
    const selectionToken = Date.now();
    navigation.navigate('ChildStudentPortal', {
      child,
      selectionToken,
      screen: 'HomeTab',
      params: {
        screen: 'StudentHome',
        params: { child, selectionToken },
      },
    });
  };

  const handleChildProfilePressed = (child) => {
    const selectionToken = Date.now();
    navigation.navigate('ChildStudentPortal', {
      child,
      selectionToken,
      screen: 'HomeTab',
      params: {
        screen: 'StudentProfile',
        params: { child, selectionToken },
      },
    });
  };

  const initials = (child) => {
    const first = (child.first_name || '?')[0].toUpperCase();
    const last = (child.last_name || '?')[0].toUpperCase();
    return `${first}${last}`;
  };

  const familyMessage = useMemo(() => {
    if (!overview.totalChildren) {
      return {
        title: 'Build your family dashboard',
        body: 'Once children are linked, attendance, alerts, and leave activity will appear here automatically.',
        tone: 'calm',
        icon: 'sparkles-outline',
      };
    }

    if (overview.pendingLeaves > 0) {
      return {
        title: `${overview.pendingLeaves} leave action${overview.pendingLeaves === 1 ? '' : 's'} waiting`,
        body: 'Review leave activity first so no request is missed across your children.',
        tone: 'warn',
        icon: 'time-outline',
      };
    }

    if (overview.unreadNotifications > 0) {
      return {
        title: `${overview.unreadNotifications} unread school update${overview.unreadNotifications === 1 ? '' : 's'}`,
        body: 'Messages and notices are stacking up. Open the message center to catch up quickly.',
        tone: 'info',
        icon: 'notifications-outline',
      };
    }

    if (overview.markedToday < overview.totalChildren) {
      return {
        title: 'Attendance is still coming in',
        body: `${overview.markedToday} of ${overview.totalChildren} children have been marked so far today.`,
        tone: 'calm',
        icon: 'pulse-outline',
      };
    }

    return {
      title: 'Family dashboard looks clear',
      body: `${overview.presentToday} ${overview.presentToday === 1 ? 'child is' : 'children are'} present today and there are no urgent actions right now.`,
      tone: 'success',
      icon: 'checkmark-circle-outline',
    };
  }, [overview]);

  const attentionCards = useMemo(() => ([
    {
      key: 'alerts',
      label: 'School Alerts',
      value: String(overview.unreadNotifications),
      note: overview.unreadNotifications > 0 ? 'Need review' : 'All caught up',
      icon: 'notifications-outline',
      accent: '#2563EB',
      bg: '#EFF6FF',
      border: '#DBEAFE',
    },
    {
      key: 'leaves',
      label: 'Leave Actions',
      value: String(overview.pendingLeaves),
      note: overview.pendingLeaves > 0 ? 'Pending items' : 'Nothing pending',
      icon: 'document-text-outline',
      accent: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
    },
  ]), [overview.pendingLeaves, overview.unreadNotifications]);

  const heroAnimatedStyle = {
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

  const renderChildCard = ({ item, index }) => {
    const accent = CHILD_ACCENTS[index % CHILD_ACCENTS.length];
    const cardOpacity = entrance.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.2, 1],
    });
    const cardTranslate = entrance.interpolate({
      inputRange: [0, 1],
      outputRange: [24 + index * 5, 0],
    });

    return (
      <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslate }] }}>
        <Pressable
          style={({ pressed }) => [styles.childCard, { shadowColor: accent.glow }, pressed && styles.childCardPressed]}
          onPress={() => handleChildPressed(item)}
        >
          <LinearGradient
            colors={accent.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.childAccentBar}
          />
          <View style={[styles.childAmbientOrb, { backgroundColor: accent.glow }]} pointerEvents="none" />

          <View style={styles.childTopRow}>
            <View style={styles.childIdentityRow}>
              <View style={[styles.childAvatar, { backgroundColor: accent.icon }] }>
                <Text style={styles.childAvatarText}>{initials(item)}</Text>
              </View>
              <View style={styles.childIdentityText}>
                <Text style={styles.childName}>{item.first_name} {item.last_name}</Text>
                <Text style={styles.childClassLine}>{item.class_name} • Sec {item.section_name}</Text>
              </View>
            </View>
            <View style={[styles.childPortalPill, { backgroundColor: accent.tint }] }>
              <Ionicons name="grid-outline" size={13} color={accent.gradient[0]} />
              <Text style={[styles.childPortalPillText, { color: accent.gradient[0] }]}>Portal</Text>
            </View>
          </View>

          <View style={styles.childInfoRow}>
            <View style={styles.childInfoChip}>
              <Ionicons name="person-circle-outline" size={14} color={C.textMed} />
              <Text style={styles.childInfoChipText}>Age {item.age ?? '—'}</Text>
            </View>
            <Pressable
              onPress={(event) => {
                event?.stopPropagation?.();
                handleChildProfilePressed(item);
              }}
              style={({ pressed }) => [styles.childInfoChip, styles.childInfoChipAction, pressed && styles.childInfoChipActionPressed]}
            >
              <Ionicons name="school-outline" size={14} color="#1D4ED8" />
              <Text style={[styles.childInfoChipText, styles.childInfoChipActionText]}>Student profile</Text>
              <Ionicons name="arrow-forward" size={12} color="#1D4ED8" />
            </Pressable>
          </View>

          <View style={styles.childFooterRow}>
            <View style={styles.childMessageWrap}>
              <Text style={styles.childMessageTitle}>Open child dashboard</Text>
              <Text style={styles.childMessageText}>Attendance, classwork, homework, leaves, notifications, and AI tools stay exactly as they are.</Text>
            </View>
            <View style={[styles.childArrowWrap, { backgroundColor: accent.tint }] }>
              <Ionicons name="arrow-forward" size={18} color={accent.gradient[0]} />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.brandDeep} translucent={false} />
      <View style={styles.bgOrbTop} pointerEvents="none" />
      <View style={styles.bgOrbBottom} pointerEvents="none" />

      {loading ? (
        <ActivityIndicator color={C.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={children}
          keyExtractor={(item) => String(item.student_id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <Animated.View style={[styles.summaryWrap, heroAnimatedStyle]}>
              <LinearGradient
                colors={C.brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.heroCard,
                  {
                    marginTop: heroMarginTop,
                    paddingTop: 20,
                  },
                ]}
              >
                <View style={styles.heroDeco} pointerEvents="none" />
                <View style={styles.heroDecoSecondary} pointerEvents="none" />

                <View style={styles.heroTopRow}>
                  <View style={styles.heroHeadingWrap}>
                    <Text style={styles.heroEyebrow}>Parent Portal</Text>
                    <Text style={styles.heroTitle}>{user?.first_name} {user?.last_name}</Text>
                    <Text style={styles.heroSub}>A calmer view of attendance, school alerts, leave activity, and messages across every child.</Text>
                  </View>

                  <View style={styles.heroActionBtns}>
                    <Pressable
                      onPress={() => navigation.navigate('ParentProfile')}
                      style={({ pressed }) => [styles.heroSignOutBtn, pressed && { opacity: 0.82 }]}
                    >
                      <Ionicons name="person-circle-outline" size={14} color="#DBEAFE" />
                      <Text style={styles.heroSignOutText}>Profile</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Sign Out', style: 'destructive', onPress: logout },
                      ])}
                      style={({ pressed }) => [styles.heroSignOutBtn, pressed && { opacity: 0.82 }]}
                    >
                      <Ionicons name="log-out-outline" size={14} color="#DBEAFE" />
                      <Text style={styles.heroSignOutText}>Sign Out</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.heroInsightCard}>
                  <View style={[
                    styles.heroInsightIconWrap,
                    familyMessage.tone === 'warn' && styles.heroInsightWarn,
                    familyMessage.tone === 'success' && styles.heroInsightSuccess,
                  ]}>
                    <Ionicons name={familyMessage.icon} size={18} color="#fff" />
                  </View>
                  <View style={styles.heroInsightTextWrap}>
                    <Text style={styles.heroInsightTitle}>{familyMessage.title}</Text>
                    <Text style={styles.heroInsightBody}>{familyMessage.body}</Text>
                  </View>
                </View>

                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.totalChildren}</Text>
                    <Text style={styles.summaryItemLabel}>Children</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.markedToday}/{overview.totalChildren || 0}</Text>
                    <Text style={styles.summaryItemLabel}>Marked</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.presentToday}</Text>
                    <Text style={styles.summaryItemLabel}>Present</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryNum}>{overview.unreadNotifications}</Text>
                    <Text style={styles.summaryItemLabel}>Alerts</Text>
                  </View>
                </View>
              </LinearGradient>

              <View style={styles.dashboardBody}>
                <View style={styles.attentionGrid}>
                  {attentionCards.map((card) => (
                    <View key={card.key} style={[styles.attentionCard, { backgroundColor: card.bg, borderColor: card.border }]}>
                      <View style={[styles.attentionIconWrap, { backgroundColor: `${card.accent}18` }] }>
                        <Ionicons name={card.icon} size={18} color={card.accent} />
                      </View>
                      <Text style={styles.attentionLabel}>{card.label}</Text>
                      <Text style={styles.attentionValue}>{card.value}</Text>
                      <Text style={styles.attentionNote}>{card.note}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.quickRow}>
                  <Pressable
                    style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.82 }]}
                    onPress={() => navigation.navigate('ChatList')}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: '#2563EB' }] }>
                      <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
                    </View>
                    <View style={styles.quickTextWrap}>
                      <Text style={styles.quickLabel}>Messages</Text>
                      <Text style={styles.quickSubLabel}>Open parent conversations</Text>
                    </View>
                    {chatUnread > 0 ? (
                      <View style={styles.quickBadge}>
                        <Text style={styles.quickBadgeText}>{chatUnread > 99 ? '99+' : chatUnread}</Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={C.textLight} />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.82 }]}
                    onPress={onRefresh}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: '#0F766E' }] }>
                      <Ionicons name="refresh-outline" size={20} color="#fff" />
                    </View>
                    <View style={styles.quickTextWrap}>
                      <Text style={styles.quickLabel}>Refresh</Text>
                      <Text style={styles.quickSubLabel}>Reload family summary</Text>
                    </View>
                    {overviewLoading || refreshing ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="sparkles-outline" size={16} color={C.textLight} />}
                  </Pressable>
                </View>

                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.childrenHeading}>Your Children</Text>
                  <Text style={styles.childrenCaption}>Tap any card to open the same child portal experience you already use.</Text>
                </View>
              </View>
            </Animated.View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <LinearGradient colors={['#DBEAFE', '#EFF6FF']} style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={28} color="#1D4ED8" />
              </LinearGradient>
              <Text style={styles.emptyTitle}>No children linked yet</Text>
              <Text style={styles.emptyTxt}>Please ask your school admin to link your children to this account.</Text>
            </View>
          }
          renderItem={renderChildCard}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
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
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(20,184,166,0.06)',
    bottom: 60,
    left: -120,
  },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 34 },
  summaryWrap: { marginBottom: 8 },
  dashboardBody: { marginTop: 2 },
  heroCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  heroDeco: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -50,
    top: -68,
  },
  heroDecoSecondary: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(96,165,250,0.12)',
    left: -48,
    bottom: -56,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroActionBtns: { flexDirection: 'column', gap: 6 },
  heroHeadingWrap: { flex: 1 },
  heroEyebrow: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  heroSub: {
    color: '#DBEAFE',
    fontSize: 12,
    marginTop: 5,
    lineHeight: 18,
  },
  heroSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.45)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  heroSignOutText: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroInsightCard: {
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
  heroInsightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInsightWarn: { backgroundColor: 'rgba(217,119,6,0.8)' },
  heroInsightSuccess: { backgroundColor: 'rgba(22,163,74,0.8)' },
  heroInsightTextWrap: { flex: 1 },
  heroInsightTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  heroInsightBody: { color: '#DBEAFE', fontSize: 12, lineHeight: 18, marginTop: 4 },
  summaryRow: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { color: '#fff', fontSize: 20, fontWeight: '800' },
  summaryItemLabel: { color: '#BFDBFE', fontSize: 10, marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  attentionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  attentionCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  attentionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionLabel: { color: C.textMed, fontSize: 11, fontWeight: '700', marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  attentionValue: { color: C.textDark, fontSize: 22, fontWeight: '800', marginTop: 4 },
  attentionNote: { color: C.textMed, fontSize: 12, marginTop: 2 },
  sectionHeaderRow: { marginBottom: 10 },
  childrenHeading: { fontSize: 12, color: C.textMed, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  childrenCaption: { fontSize: 12, color: C.textMed, marginTop: 4, lineHeight: 18 },
  quickRow: { marginBottom: 14, gap: 10 },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quickIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickTextWrap: { flex: 1 },
  quickLabel: { fontSize: 15, fontWeight: '700', color: C.textDark },
  quickSubLabel: { fontSize: 11, color: C.textMed, marginTop: 2 },
  quickBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  quickBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  emptyTxt: { fontSize: 14, color: C.textMed, textAlign: 'center', lineHeight: 20 },
  childCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    marginVertical: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  childCardPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  childAccentBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 6,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  childAmbientOrb: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -34,
    top: -18,
  },
  childTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  childIdentityRow: { flexDirection: 'row', flex: 1, gap: 12 },
  childAvatar: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  childAvatarText: { color: C.textDark, fontSize: 18, fontWeight: '800' },
  childIdentityText: { flex: 1 },
  childName: { fontSize: 17, fontWeight: '800', color: C.textDark },
  childClassLine: { fontSize: 12, color: C.textMed, marginTop: 3 },
  childPortalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  childPortalPillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  childInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  childInfoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  childInfoChipText: { fontSize: 11, color: C.textMed, fontWeight: '700' },
  childInfoChipAction: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  childInfoChipActionPressed: { opacity: 0.88 },
  childInfoChipActionText: { color: '#1D4ED8' },
  childFooterRow: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  childMessageWrap: { flex: 1 },
  childMessageTitle: { fontSize: 13, fontWeight: '700', color: C.textDark },
  childMessageText: { fontSize: 11, color: C.textMed, lineHeight: 17, marginTop: 3 },
  childArrowWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
