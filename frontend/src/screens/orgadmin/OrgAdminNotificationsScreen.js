import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import PickerField from '../../components/PickerField';

const TARGET_TYPES = [
  { value: 'org',     label: 'Entire Organisation' },
  { value: 'campus',  label: 'Specific Campus' },
  { value: 'staff',   label: 'Staff (Admins + Teachers)' },
];

export default function OrgAdminNotificationsScreen({ navigation }) {
  const [campuses, setCampuses]       = useState([]);
  const [targetType, setTargetType]   = useState('org');
  const [selectedCampus, setSelectedCampus] = useState('');   // for 'campus' type
  const [selectedCampuses, setSelectedCampuses] = useState([]); // for 'staff' type
  const [title, setTitle]             = useState('');
  const [body, setBody]               = useState('');
  const [sending, setSending]         = useState(false);

  useEffect(() => {
    api.get('/org-admin/campuses').then(({ data }) => setCampuses(data)).catch(() => {});
  }, []);

  const toggleCampus = (id) => {
    setSelectedCampuses(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const campusItems = [
    { label: 'Select campus…', value: '' },
    ...campuses.map(c => ({ label: c.name, value: String(c.id) })),
  ];

  const handleSend = async () => {
    if (!title.trim() || !body.trim())
      return Alert.alert('Validation', 'Title and message are required.');
    if (targetType === 'campus' && !selectedCampus)
      return Alert.alert('Validation', 'Please select a campus.');

    setSending(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
        ...(targetType === 'campus' && { campus_id: parseInt(selectedCampus) }),
        ...(targetType === 'staff'  && { campus_ids: selectedCampuses.length ? selectedCampuses : null }),
      };
      const { data } = await api.post('/org-admin/notifications', payload);
      Alert.alert('Sent!', `Notification sent to ${data.count} recipient(s).`);
      setTitle(''); setBody(''); setSelectedCampus(''); setSelectedCampuses([]); setTargetType('org');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title="Send Notification" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <Text style={styles.label}>Send To</Text>
        <View style={styles.chipRow}>
          {TARGET_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, targetType === t.value && styles.chipActive]}
              onPress={() => setTargetType(t.value)}
            >
              <Text style={[styles.chipTxt, targetType === t.value && styles.chipTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {targetType === 'campus' && (
          <>
            <Text style={styles.label}>Campus</Text>
            <PickerField
              label=""
              value={selectedCampus}
              onChange={setSelectedCampus}
              items={campusItems}
              placeholder="Select campus…"
            />
          </>
        )}

        {targetType === 'staff' && (
          <>
            <Text style={styles.label}>Campuses (leave empty = all)</Text>
            <View style={styles.chipRow}>
              {campuses.map(c => {
                const sel = selectedCampuses.includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, sel && styles.chipActive]}
                    onPress={() => toggleCampus(c.id)}
                  >
                    {sel && <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 4 }} />}
                    <Text style={[styles.chipTxt, sel && styles.chipTxtActive]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="Notification title..."
          placeholderTextColor="#94A3B8"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />

        <Text style={styles.label}>Message *</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Notification message..."
          placeholderTextColor="#94A3B8"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.sendBtn, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.sendBtnTxt}>Send Notification</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, backgroundColor: C.bg },
  label: { fontSize: 12, fontWeight: '700', color: C.textLight, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textDark },
  textarea: { minHeight: 100, paddingTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  sendBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  sendBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

