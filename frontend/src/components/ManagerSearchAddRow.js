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
        <Ionicons name="search-outline" size={18} color="#0F172A" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor="#CBD5E1"
          value={searchValue}
          onChangeText={onSearchChange}
        />
      </View>
      <Pressable onPress={onAddPress} style={({ pressed }) => [
        styles.addBtn,
        pressed && styles.addBtnPressed
      ]}>
        <Ionicons name="add" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 16, 
    marginTop: 12, 
    marginBottom: 8, 
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: { 
    flex: 1, 
    fontSize: 15, 
    color: '#0F172A',
    fontWeight: '500',
  },
  addBtn: { 
    backgroundColor: C.primary, 
    borderRadius: 12, 
    padding: 12,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  addBtnPressed: {
    opacity: 0.85,
  },
});
