import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../config/theme';

export default function ManagerSearchAddRow({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onAddPress,
}) {
  return (
    <View style={styles.row}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor="#94A3B8"
          value={searchValue}
          onChangeText={onSearchChange}
        />
      </View>
      <Pressable onPress={onAddPress} style={styles.addBtn}>
        <Ionicons name="add" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 4, gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: 14, color: C.textDark },
  addBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 10 },
});
