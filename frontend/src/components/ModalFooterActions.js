import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from '../config/theme';

export default function ModalFooterActions({
  onCancel,
  onConfirm,
  cancelText = 'Cancel',
  confirmText = 'Save',
  loading = false,
  disabled = false,
}) {
  return (
    <View style={styles.modalBtns}>
      <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={onCancel}>
        <Text style={styles.cancelText}>{cancelText}</Text>
      </Pressable>
      <Pressable style={[styles.modalBtn, styles.saveBtn, (loading || disabled) && { opacity: 0.7 }]} onPress={onConfirm} disabled={loading || disabled}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>{confirmText}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn: { backgroundColor: C.border },
  saveBtn: { backgroundColor: C.primary },
  cancelText: { color: C.textMed, fontWeight: '700' },
  saveText: { color: '#fff', fontWeight: '700' },
});
