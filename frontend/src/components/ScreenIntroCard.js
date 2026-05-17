import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, S } from '../config/theme';

const PALETTES = {
  blue: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#DBEAFE' },
  violet: { bg: '#F5F3FF', fg: '#7C3AED', border: '#DDD6FE' },
  pink: { bg: '#FDF2F8', fg: '#DB2777', border: '#FBCFE8' },
  emerald: { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' },
  amber: { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
};

export default function ScreenIntroCard({
  title,
  description,
  icon = 'information-circle-outline',
  tone = 'blue',
}) {
  const palette = PALETTES[tone] || PALETTES.blue;

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { borderColor: palette.border }]}>
        <View style={[styles.iconBox, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={20} color={palette.fg} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  card: {
    ...S.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: C.textDark },
  description: { fontSize: 11, color: C.textMed, marginTop: 4, lineHeight: 17 },
});