import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';

export default function AddStudentScreen({ navigation }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', age: '',
    class_id: '', section_id: '', roll_no: ''
  });
  const [classes,  setClasses]  = useState([]);
  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    api.get('/classes').then(({ data }) => setClasses(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.class_id) { setSections([]); return; }
    api.get(`/classes/${form.class_id}/sections`)
      .then(({ data }) => setSections(data))
      .catch(() => {});
  }, [form.class_id]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleAdd = async () => {
    const { first_name, last_name, age, class_id, section_id } = form;
    if (!first_name || !last_name || !age || !class_id || !section_id) {
      return Alert.alert('Missing fields', 'Please fill in all required fields.');
    }
    if (isNaN(Number(age)) || Number(age) <= 0) {
      return Alert.alert('Invalid age', 'Please enter a valid age.');
    }
    setLoading(true);
    try {
      await api.post('/students', { ...form, age: Number(age) });
      Alert.alert('Student Added!', `${first_name} ${last_name} has been added.`, [
        { text: 'Add Another', onPress: () => setForm({ first_name: '', last_name: '', age: '', class_id: form.class_id, section_id: form.section_id, roll_no: '' }) },
        { text: 'Go Back',    onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not add student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Add New Student</Text>

      <Text style={styles.label}>First Name *</Text>
      <TextInput style={styles.input} placeholder="First Name" value={form.first_name} onChangeText={v => set('first_name', v)} />

      <Text style={styles.label}>Last Name *</Text>
      <TextInput style={styles.input} placeholder="Last Name" value={form.last_name} onChangeText={v => set('last_name', v)} />

      <Text style={styles.label}>Age *</Text>
      <TextInput style={styles.input} placeholder="Age" keyboardType="numeric" value={form.age} onChangeText={v => set('age', v)} />

      <Text style={styles.label}>Roll Number (optional)</Text>
      <TextInput style={styles.input} placeholder="e.g. 12" value={form.roll_no} onChangeText={v => set('roll_no', v)} />

      <Text style={styles.label}>Class *</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={form.class_id} onValueChange={v => set('class_id', v)}>
          <Picker.Item label="— Select Class —" value="" />
          {classes.map(c => <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />)}
        </Picker>
      </View>

      <Text style={styles.label}>Section *</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={form.section_id} onValueChange={v => set('section_id', v)} enabled={sections.length > 0}>
          <Picker.Item label="— Select Section —" value="" />
          {sections.map(s => <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />)}
        </Picker>
      </View>

      <TouchableOpacity style={styles.btn} onPress={handleAdd} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Add Student</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flexGrow: 1, padding: 24, backgroundColor: '#F8FAFC', paddingBottom: 40 },
  heading:    { fontSize: 22, fontWeight: '700', color: '#1E3A5F', marginBottom: 20 },
  label:      { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:      {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff',
    marginBottom: 14, fontSize: 15
  },
  pickerBox:  { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, backgroundColor: '#fff', marginBottom: 16, overflow: 'hidden' },
  btn:        { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' }
});
