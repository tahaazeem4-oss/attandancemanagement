import React from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PT = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 24);

export default function AppHeader({ title, navigation }) {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.row}>
          {/* Left: back arrow */}
          <Pressable
            onPress={() => navigation?.goBack()}
            style={styles.backBtn}
            hitSlop={10}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

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
    paddingTop: PT,
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  backBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 38,
    marginTop: -4,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  side: {
    width: 48,
  },
});
