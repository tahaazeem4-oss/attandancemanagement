/**
 * Deco.js — Shared decorative + animation helpers
 *  - HeaderBlobs   : floating circles / dots texture for dark headers
 *  - PressBtn      : button with spring scale animation on press
 *  - useEntrance   : hook for fade + slide-up entrance animation
 */
import React, { useRef, useEffect } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';

// ─── Decorative blobs overlay for gradient headers ───────────
export function HeaderBlobs() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={s.b1} /><View style={s.b2} /><View style={s.b3} />
      <View style={s.ring1} /><View style={s.ring2} />
      <View style={s.d1} /><View style={s.d2} /><View style={s.d3} />
      <View style={s.d4} /><View style={s.d5} /><View style={s.d6} />
    </View>
  );
}

// ─── Animated press-scale button ─────────────────────────────
export function PressBtn({ onPress, disabled, style, children }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pIn   = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pOut  = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pIn}
      onPressOut={pOut}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── Entrance animation hook (fade + slide up) ───────────────
export function useEntrance(delay = 0) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    const run = () => Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }),
    ]).start();

    if (delay > 0) {
      const t = setTimeout(run, delay);
      return () => clearTimeout(t);
    }
    run();
  }, []);

  return { opacity, transform: [{ translateY }] };
}

// ─── Styles for blobs ────────────────────────────────────────
const W  = (a) => `rgba(255,255,255,${a})`;
const ID = (a) => `rgba(99,102,241,${a})`;   // indigo accent
const A  = (a) => `rgba(165,180,252,${a})`;   // indigo-200

const s = StyleSheet.create({
  b1:    { position:'absolute', width:220, height:220, borderRadius:110, backgroundColor:W(0.055), top:-80, right:-65  },
  b2:    { position:'absolute', width:160, height:160, borderRadius:80,  backgroundColor:W(0.04),  bottom:-60, left:-50 },
  b3:    { position:'absolute', width:100, height:100, borderRadius:50,  backgroundColor:ID(0.22), top:8, left:85      },
  ring1: { position:'absolute', width:140, height:140, borderRadius:70, borderWidth:1.5, borderColor:W(0.08), right:25, top:-30 },
  ring2: { position:'absolute', width:70,  height:70,  borderRadius:35, borderWidth:1,   borderColor:A(0.2),  left:30, bottom:10 },
  d1:    { position:'absolute', width:8,  height:8,  borderRadius:4, backgroundColor:W(0.18), top:22, left:28   },
  d2:    { position:'absolute', width:5,  height:5,  borderRadius:3, backgroundColor:W(0.12), top:44, right:82  },
  d3:    { position:'absolute', width:10, height:10, borderRadius:5, backgroundColor:W(0.07), bottom:14, right:28 },
  d4:    { position:'absolute', width:5,  height:5,  borderRadius:3, backgroundColor:A(0.35), top:18, right:135  },
  d5:    { position:'absolute', width:7,  height:7,  borderRadius:4, backgroundColor:A(0.2),  top:32, left:195   },
  d6:    { position:'absolute', width:6,  height:6,  borderRadius:3, backgroundColor:W(0.1),  bottom:18, left:115 },
});
