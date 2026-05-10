import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ParentChildSwitcher({ children, currentChildId, onSelectChild, onBack }) {
  const otherChildren = children.filter(c => c.student_id !== currentChildId);

  const initials = (child) => {
    const first = (child.first_name || '?')[0].toUpperCase();
    const last = (child.last_name || '?')[0].toUpperCase();
    return `${first}${last}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color="#1E3A8A" />
        </Pressable>
        <Text style={styles.switchLabel}>Switch Child</Text>
      </View>

      {otherChildren.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.switcherScroll}
          contentContainerStyle={styles.switcherContent}
        >
          {otherChildren.map(child => (
            <Pressable
              key={child.student_id}
              onPress={() => onSelectChild(child)}
              style={styles.childButton}
            >
              <View style={styles.childAvatar}>
                <Text style={styles.childInitials}>{initials(child)}</Text>
              </View>
              <Text style={styles.childName} numberOfLines={1}>{child.first_name}</Text>
              <Text style={styles.childMeta} numberOfLines={1}>{child.class_name || 'Class'} {child.section_name ? `• ${child.section_name}` : ''}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#F8FAFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  switcherScroll: {
    marginTop: 2,
    maxHeight: 100,
  },
  switcherContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  childButton: {
    alignItems: 'center',
    gap: 4,
    width: 88,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  childAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childInitials: {
    color: '#3730A3',
    fontWeight: '800',
    fontSize: 12,
  },
  childName: {
    color: '#0F172A',
    fontSize: 11.5,
    fontWeight: '700',
    maxWidth: 76,
    textAlign: 'center',
  },
  childMeta: {
    color: '#64748B',
    fontSize: 9.5,
    maxWidth: 76,
    textAlign: 'center',
  },
});
