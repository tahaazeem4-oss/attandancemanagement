import React from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../config/theme';

export default function AppHeader({ title, subtitle, navigation, showBack = true, rightSlot = null, onBackPress = null }) {
  const insets = useSafeAreaInsets();
  const statusInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusInset);
  const topPad = topInset + 8;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={C.brandDeep} translucent={false} />
      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <View style={styles.glowPrimary} pointerEvents="none" />
        <View style={styles.glowSecondary} pointerEvents="none" />
        <View style={styles.row}>
          {showBack ? (
            <Pressable
              onPress={() => (onBackPress ? onBackPress() : navigation?.goBack())}
              style={styles.backBtn}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
            </Pressable>
          ) : (
            <View style={styles.side} />
          )}

          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>

          {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : <View style={styles.side} />}
        </View>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 16,
    paddingHorizontal: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glowPrimary: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -58,
    right: -36,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  glowSecondary: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -36,
    left: -26,
    backgroundColor: 'rgba(125,211,252,0.14)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  title: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  subtitle: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  side: {
    width: 44,
    height: 44,
  },
  rightSlot: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
