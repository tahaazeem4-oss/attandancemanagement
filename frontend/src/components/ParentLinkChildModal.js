import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import api from '../services/api';
import { C, S } from '../config/theme';

export default function ParentLinkChildModal({ visible, onClose, onLinked }) {
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('parent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const relationships = [
    { label: 'Parent', value: 'parent' },
    { label: 'Mother', value: 'mother' },
    { label: 'Father', value: 'father' },
    { label: 'Guardian', value: 'guardian' },
    { label: 'Grandfather', value: 'grandfather' },
    { label: 'Grandmother', value: 'grandmother' },
  ];

  const handleLink = async () => {
    if (!studentId.trim()) {
      setError('Student ID is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/parent/children/link', {
        student_id: parseInt(studentId),
        relationship,
      });

      Alert.alert('Success', 'Child linked successfully!');
      setStudentId('');
      setRelationship('parent');
      onLinked();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to link child';
      setError(msg);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Link a Child</Text>
          <Text style={styles.subtitle}>Enter your child's student ID to link them to your account</Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Text style={S.label}>Student ID *</Text>
          <TextInput
            style={S.input}
            placeholder="e.g. 12345"
            keyboardType="number-pad"
            value={studentId}
            onChangeText={setStudentId}
            editable={!loading}
          />

          <Text style={S.label}>Your Relationship</Text>
          <View style={styles.relGrid}>
            {relationships.map((rel) => (
              <Pressable
                key={rel.value}
                style={[
                  styles.relBtn,
                  relationship === rel.value && styles.relBtnActive,
                ]}
                onPress={() => setRelationship(rel.value)}
              >
                <Text
                  style={[
                    styles.relText,
                    relationship === rel.value && styles.relTextActive,
                  ]}
                >
                  {rel.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.btns}>
            <Pressable
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.linkBtn, loading && { opacity: 0.6 }]}
              onPress={handleLink}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.linkBtnText}>Link Child</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modal: { backgroundColor: C.card, borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 4 },
  subtitle: { fontSize: 13, color: C.textMed, marginBottom: 16, lineHeight: 18 },
  error: { backgroundColor: '#FEE2E2', color: '#DC2626', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: '600' },
  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  relBtn: { flex: 1, minWidth: '48%', backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  relBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  relText: { fontSize: 12, fontWeight: '600', color: C.textMed },
  relTextActive: { color: '#fff' },
  btns: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: C.border },
  cancelBtnText: { color: C.textMed, fontWeight: '700', fontSize: 14 },
  linkBtn: { backgroundColor: C.primary },
  linkBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
