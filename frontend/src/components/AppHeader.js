import React from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppHeader({ title, navigation, showBack = true }) {
  const insets = useSafeAreaInsets();
  const statusInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusInset);
  const topPad = topInset + 10;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" translucent={false} />
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <View style={styles.row}>
          {/* Left: back arrow */}
          {showBack ? (
            <Pressable
              onPress={() => navigation?.goBack()}
              style={styles.backBtn}
              hitSlop={10}
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          ) : (
            <View style={styles.side} />
          )}

          {/* Center: title */}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>

          {/* Right: empty placeholder to keep title centered */}
          <View style={styles.side} />
        </View>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
  },
  backBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  backIcon: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 34,
    marginTop: -2,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  side: {
    width: 42,
  },
});
