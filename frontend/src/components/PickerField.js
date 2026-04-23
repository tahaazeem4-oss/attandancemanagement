/**
 * PickerField — a styled custom picker that replaces the native Picker.
 * Opens a modal sheet with a clean list of options.
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, Modal, FlatList,
  StyleSheet, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { C } from '../config/theme';

export default function PickerField({ label, value, onChange, items, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = items.find(i => String(i.value) === String(value));

  return (
    <>
      {/* Trigger */}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          value  && styles.triggerActive,
          disabled && styles.triggerDisabled,
          pressed && !disabled && styles.triggerPressed,
        ]}
      >
        <Text style={[styles.triggerText, !selected && styles.triggerPlaceholder]}>
          {selected ? selected.label : (placeholder || `Select ${label}`)}
        </Text>
        <View style={[styles.arrow, value && styles.arrowActive]}>
          <Text style={[styles.arrowIcon, value && styles.arrowIconActive]}>▾</Text>
        </View>
      </Pressable>

      {/* Modal sheet */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} />
        <SafeAreaView style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handle} />

          <Text style={styles.sheetTitle}>{label}</Text>

          <FlatList
            data={items}
            keyExtractor={i => String(i.value)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const isSelected = String(item.value) === String(value);
              return (
                <TouchableOpacity
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => { onChange(item.value); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {item.label}
                  </Text>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Trigger ──────────────────────────────────────────────────
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 4,
  },
  triggerActive: {
    borderColor: C.primary, backgroundColor: '#EEF2FF',
  },
  triggerDisabled: {
    opacity: 0.45,
  },
  triggerPressed: {
    backgroundColor: '#E0E7FF',
  },
  triggerText: {
    flex: 1, fontSize: 15, color: C.textDark, fontWeight: '500',
  },
  triggerPlaceholder: {
    color: C.textLight, fontWeight: '400',
  },
  arrow: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  arrowActive: {
    backgroundColor: C.primaryLight,
  },
  arrowIcon: {
    fontSize: 13, color: C.textMed, lineHeight: 16,
  },
  arrowIconActive: {
    color: C.primary,
  },

  // ── Modal sheet ───────────────────────────────────────────────
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,12,41,0.55)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 12, maxHeight: '65%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '800', color: C.textDark,
    paddingHorizontal: 22, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: C.border,
    letterSpacing: 0.2,
  },
  sep: {
    height: 1, backgroundColor: C.border, marginHorizontal: 22,
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, paddingHorizontal: 22,
  },
  optionSelected: {
    backgroundColor: C.primaryLight,
  },
  optionText: {
    flex: 1, fontSize: 15, color: C.textDark, fontWeight: '500',
  },
  optionTextSelected: {
    color: C.primary, fontWeight: '700',
  },
  checkmark: {
    fontSize: 16, color: C.primary, fontWeight: '800',
  },
  cancelBtn: {
    margin: 16, marginTop: 8,
    borderRadius: 14, paddingVertical: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center',
  },
  cancelText: {
    fontSize: 15, fontWeight: '700', color: C.textMed,
  },
});
