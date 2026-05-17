import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const storage = {
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async getItem(key) {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  async removeItem(key) {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

function mergeCardOrder(savedKeys = [], visibleKeys = []) {
  const visibleSet = new Set(visibleKeys);
  const used = new Set();
  const merged = [];

  savedKeys.forEach((key) => {
    if (!visibleSet.has(key) || used.has(key)) return;
    used.add(key);
    merged.push(key);
  });

  visibleKeys.forEach((key) => {
    if (used.has(key)) return;
    used.add(key);
    merged.push(key);
  });

  return merged;
}

export default function useDashboardCardPreferences({ preferenceKey, cards }) {
  const visibleKeys = cards.map((card) => card.key);
  const visibleSignature = visibleKeys.join('|');
  const [savedOrder, setSavedOrder] = useState(visibleKeys);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!preferenceKey) {
        if (active) setSavedOrder(visibleKeys);
        return;
      }

      try {
        const raw = await storage.getItem(preferenceKey);
        const parsed = raw ? JSON.parse(raw) : [];
        if (active) {
          setSavedOrder(mergeCardOrder(parsed, visibleKeys));
        }
      } catch {
        if (active) {
          setSavedOrder(visibleKeys);
        }
      }
    }

    load();
    return () => { active = false; };
  }, [preferenceKey, visibleSignature]);

  const orderedKeys = mergeCardOrder(savedOrder, visibleKeys);
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const orderedCards = orderedKeys.map((key) => byKey.get(key)).filter(Boolean);

  async function persist(nextOrder) {
    if (!preferenceKey) return;
    if (!nextOrder.length) {
      await storage.removeItem(preferenceKey);
      return;
    }
    await storage.setItem(preferenceKey, JSON.stringify(nextOrder));
  }

  function moveCard(cardKey, direction) {
    const currentOrder = mergeCardOrder(savedOrder, visibleKeys);
    const currentIndex = currentOrder.indexOf(cardKey);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) {
      return;
    }

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, moved);
    setSavedOrder(nextOrder);
    persist(nextOrder);
  }

  function resetOrder() {
    setSavedOrder(visibleKeys);
    if (preferenceKey) {
      storage.removeItem(preferenceKey);
    }
  }

  return {
    orderedCards,
    moveCard,
    resetOrder,
  };
}