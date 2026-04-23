import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, StatusBar, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { C, S } from '../../config/theme';

const STATUS_COLOR = { pending: '#D97706', approved: '#059669', rejected: '#DC2626' };
const STATUS_BG    = { pending: '#FFFBEB', approved: '#ECFDF5', rejected: '#FEF2F2' };

export default function StudentLeaveScreen() {
  const [leaves,  setLeaves]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState({ date: '', reason: '' });
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/student-portal/leaves'); setLeaves(data); }
    catch { Alert.alert('Error', 'Could not load leaves'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleApply = async () => {
    const dateReg = /^\d{4}-\d{2}-\d{2}$/;
    if (!form.date.trim() || !dateReg.test(form.date.trim()))
      return Alert.alert('Validation', 'Please enter date in YYYY-MM-DD format.');
    if (!form.reason.trim())
      return Alert.alert('Validation', 'Please provide a reason for leave.');
    setSaving(true);
    try {
      await api.post('/student-portal/leaves', { date: form.date.trim(), reason: form.reason.trim() });
      setModal(false); setForm({ date: '', reason: '' }); load();
    } catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed to apply'); }
    finally { setSaving(false); }
  };

  const handleCancel = (item) => {
    Alert.alert('Cancel Leave', 'Withdraw this leave application?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Withdraw', style: 'destructive', onPress: async () => {
        try { await api.delete(`/student-portal/leaves/${item.id}`); load(); }
        catch (err) { Alert.alert('Error', err?.response?.data?.message || 'Failed'); }
      }},
    ]);
  };

  // Pre-fill today's date
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#064E3B" />

      <LinearGradient colors={['#064E3B', '#065F46', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.headerTitle}>Leave Applications 📩</Text>
        <Text style={styles.headerSub}>Apply for leave or check your application status</Text>
      </LinearGradient>

      {loading
        ? <ActivityIndicator color="#059669" style={{ flex: 1 }} />
        : (
          <FlatList
            data={leaves}
            keyExtractor={l => String(l.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No leave applications yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateText}>📅 {item.date}</Text>
                    <Text style={styles.appliedText}>Applied: {new Date(item.applied_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[item.status] }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reason}>"{item.reason}"</Text>
                {item.status === 'pending' && (
                  <Pressable style={styles.withdrawBtn} onPress={() => handleCancel(item)}>
                    <Text style={styles.withdrawText}>Withdraw</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        )}

      <Pressable style={styles.fab} onPress={() => { setForm({ date: todayStr(), reason: '' }); setModal(true); }}>
        <Text style={styles.fabText}>+ Apply for Leave</Text>
      </Pressable>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Apply for Leave</Text>
            <Text style={S.label}>Date (YYYY-MM-DD) *</Text>
            <TextInput style={S.input} placeholder="e.g. 2025-07-15" value={form.date} onChangeText={v => setForm(p => ({ ...p, date: v }))} keyboardType="numeric" />
            <Text style={[S.label, { marginTop: 8 }]}>Reason *</Text>
            <TextInput
              style={[S.input, { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
              placeholder="Briefly describe your reason…"
              multiline
              value={form.reason}
              onChangeText={v => setForm(p => ({ ...p, reason: v }))}
            />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.saveBtn]} onPress={handleApply} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Submit</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 24 },
  headerTitle:  { color: '#ECFDF5', fontSize: 22, fontWeight: '800' },
  headerSub:    { color: '#A7F3D0', fontSize: 13, marginTop: 4 },
  card:         { backgroundColor: C.card, borderRadius: 16, marginBottom: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  dateText:     { fontSize: 15, fontWeight: '700', color: C.textDark },
  appliedText:  { fontSize: 12, color: C.textLight, marginTop: 2 },
  statusBadge:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:   { fontSize: 11, fontWeight: '800' },
  reason:       { fontSize: 13, color: C.textMed, fontStyle: 'italic', backgroundColor: C.bg, borderRadius: 8, padding: 10, marginBottom: 8 },
  withdrawBtn:  { alignSelf: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  withdrawText: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  empty:        { textAlign: 'center', color: C.textLight, marginTop: 40, fontSize: 15 },
  fab:          { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#059669', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: '#059669', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText:      { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 16 },
  modalBtns:    { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtn:    { backgroundColor: C.border },
  saveBtn:      { backgroundColor: '#059669' },
  cancelText:   { color: C.textMed, fontWeight: '700' },
  saveText:     { color: '#fff', fontWeight: '700' },
});
