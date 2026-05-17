import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../config/theme';
import useDashboardCardPreferences from '../hooks/useDashboardCardPreferences';

export default function DashboardCardGrid({
  cards,
  navigation,
  sectionTitle,
  badgeByKey,
  preferenceKey,
  columns = 3,
  allowReorder = true,
  sectionInset = 20,
  gridInset = 14,
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const { orderedCards, moveCard, resetOrder } = useDashboardCardPreferences({ preferenceKey, cards });
  const fadeAnims = useRef([...Array(25)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(25)].map(() => new Animated.Value(20))).current;

  useEffect(() => {
    fadeAnims.forEach((anim) => anim.setValue(0));
    slideAnims.forEach((anim) => anim.setValue(20));

    Animated.stagger(
      55,
      orderedCards.map((_, index) => (
        Animated.parallel([
          Animated.timing(fadeAnims[index], { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.spring(slideAnims[index], { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
        ])
      ))
    ).start();
  }, [orderedCards, fadeAnims, slideAnims]);

  function handleCardPress(card) {
    if (card.disabled) return;
    if (typeof card.onPress === 'function') {
      card.onPress();
      return;
    }
    if (navigation && card.key) {
      navigation.navigate(card.key, card.params);
    }
  }

  return (
    <>
      <View style={[styles.sectionRow, { marginHorizontal: sectionInset }]}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        {allowReorder && orderedCards.length > 1 ? (
          <Pressable style={styles.arrangeBtn} onPress={() => setManageOpen(true)}>
            <Ionicons name="swap-vertical-outline" size={14} color={C.primary} />
            <Text style={styles.arrangeText}>Priority</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.grid, { paddingHorizontal: gridInset }, columns === 2 ? styles.gridTwo : styles.gridThree]}>
        {orderedCards.map((card, index) => {
          const badge = card.badge ?? badgeByKey?.[card.key] ?? 0;
          const isOddTrailingCard = columns === 2 && orderedCards.length % 2 === 1 && index === orderedCards.length - 1;
          return (
            <Animated.View
              key={card.key}
              style={[
                columns === 2 ? styles.cardWrapTwo : styles.cardWrapThree,
                isOddTrailingCard && styles.cardWrapTwoCentered,
                { opacity: fadeAnims[index], transform: [{ translateY: slideAnims[index] }] },
              ]}
            >
              <Pressable
                style={({ pressed }) => [styles.navCard, card.disabled && styles.navCardDisabled, pressed && !card.disabled && styles.navCardPressed]}
                onPress={() => handleCardPress(card)}
                disabled={card.disabled}
              >
                <View style={[styles.iconBox, { backgroundColor: card.bg }]}>
                  <Ionicons name={card.icon} size={24} color={card.tint} />
                </View>
                <Text style={[styles.navLabel, card.disabled && styles.navLabelDisabled]}>{card.label}</Text>
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt}>{badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <Modal visible={manageOpen} transparent animationType="slide" onRequestClose={() => setManageOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setManageOpen(false)}>
          <Pressable style={styles.sheetCard} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Arrange Homepage Cards</Text>
            <Text style={styles.sheetSub}>Only cards currently visible on this homepage can be reordered.</Text>

            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {orderedCards.map((card, index) => (
                <View key={card.key} style={styles.orderRow}>
                  <View style={[styles.orderIconBox, { backgroundColor: card.bg }]}>
                    <Ionicons name={card.icon} size={18} color={card.tint} />
                  </View>
                  <View style={styles.orderCopy}>
                    <Text style={styles.orderTitle}>{card.label}</Text>
                    <Text style={styles.orderSub}>{card.description || card.sub || 'Quick access card'}</Text>
                  </View>
                  <View style={styles.orderActions}>
                    <Pressable
                      style={[styles.orderBtn, index === 0 && styles.orderBtnDisabled]}
                      onPress={() => moveCard(card.key, -1)}
                      disabled={index === 0}
                    >
                      <Ionicons name="chevron-up" size={18} color={index === 0 ? C.textLight : C.primary} />
                    </Pressable>
                    <Pressable
                      style={[styles.orderBtn, index === orderedCards.length - 1 && styles.orderBtnDisabled]}
                      onPress={() => moveCard(card.key, 1)}
                      disabled={index === orderedCards.length - 1}
                    >
                      <Ionicons name="chevron-down" size={18} color={index === orderedCards.length - 1 ? C.textLight : C.primary} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable style={styles.resetBtn} onPress={resetOrder}>
                <Text style={styles.resetBtnText}>Reset</Text>
              </Pressable>
              <Pressable style={styles.doneBtn} onPress={() => setManageOpen(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  arrangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  arrangeText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridThree: {},
  gridTwo: { justifyContent: 'space-between', rowGap: 12 },
  cardWrapThree: { width: '30%', flexGrow: 1 },
  cardWrapTwo: { width: '48%' },
  cardWrapTwoCentered: { alignSelf: 'center' },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
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
  navCardDisabled: { backgroundColor: '#F8FAFC' },
  iconBox: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  navLabel: { color: C.textDark, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16, minHeight: 32 },
  navLabelDisabled: { color: C.textMed },
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
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    maxHeight: '78%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.textDark },
  sheetSub: { fontSize: 12, color: C.textMed, marginTop: 6, lineHeight: 18 },
  sheetList: { marginTop: 16 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  orderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCopy: { flex: 1 },
  orderTitle: { fontSize: 14, fontWeight: '700', color: C.textDark },
  orderSub: { fontSize: 12, color: C.textMed, marginTop: 2, lineHeight: 17 },
  orderActions: { flexDirection: 'row', gap: 6 },
  orderBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBtnDisabled: { backgroundColor: '#F8FAFC' },
  sheetFooter: { flexDirection: 'row', gap: 10, marginTop: 18 },
  resetBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  resetBtnText: { color: C.textDark, fontSize: 14, fontWeight: '700' },
  doneBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  doneBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});