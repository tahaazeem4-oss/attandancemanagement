import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, ScrollView, Alert, ActivityIndicator, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C, S } from '../config/theme';
import { useEntrance } from '../components/Deco';
import PickerField from '../components/PickerField';

export default function AddStudentScreen({ navigation }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', age: '',
    class_id: '', section_id: '', roll_no: ''
  });
  const [classes,  setClasses]  = useState([]);
  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const cardAnim = useEntrance();
  const btnS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnS, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();
  const [focus, setFocus] = useState('');

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
    <ScrollView style={styles.wrapper} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

      {/* Gradient Header */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Add New Student</Text>
        <Text style={styles.headerSub}>Fill in the details to register a student</Text>
      </LinearGradient>

      <Animated.View style={[styles.formCard, cardAnim]}>
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={S.label}>First Name *</Text>
            <TextInput
              style={[S.input, { marginBottom: 14 }, focus === 'fn' && styles.inputFocus]}
              placeholder="First Name"
              placeholderTextColor={C.textLight}
              value={form.first_name}
              onChangeText={v => set('first_name', v)}
              onFocus={() => setFocus('fn')}
              onBlur={() => setFocus('')}
            />
          </View>
          <View style={styles.half}>
            <Text style={S.label}>Last Name *</Text>
            <TextInput
              style={[S.input, { marginBottom: 14 }, focus === 'ln' && styles.inputFocus]}
              placeholder="Last Name"
              placeholderTextColor={C.textLight}
              value={form.last_name}
              onChangeText={v => set('last_name', v)}
              onFocus={() => setFocus('ln')}
              onBlur={() => setFocus('')}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={S.label}>Age *</Text>
            <TextInput
              style={[S.input, { marginBottom: 14 }, focus === 'age' && styles.inputFocus]}
              placeholder="Age"
              placeholderTextColor={C.textLight}
              keyboardType="numeric"
              value={form.age}
              onChangeText={v => set('age', v)}
              onFocus={() => setFocus('age')}
              onBlur={() => setFocus('')}
            />
          </View>
          <View style={styles.half}>
            <Text style={S.label}>Roll No. (opt)</Text>
            <TextInput
              style={[S.input, { marginBottom: 14 }, focus === 'roll' && styles.inputFocus]}
              placeholder="e.g. 12"
              placeholderTextColor={C.textLight}
              value={form.roll_no}
              onChangeText={v => set('roll_no', v)}
              onFocus={() => setFocus('roll')}
              onBlur={() => setFocus('')}
            />
          </View>
        </View>

        <Text style={S.label}>Class *</Text>
        <PickerField
          label="Class"
          value={form.class_id}
          onChange={v => set('class_id', v)}
          placeholder="Tap to select a class"
          items={classes.map(c => ({ label: c.class_name, value: String(c.id) }))}
        />

        <Text style={[S.label, { marginTop: 12 }]}>Section *</Text>
        <PickerField
          label="Section"
          value={form.section_id}
          onChange={v => set('section_id', v)}
          placeholder="Tap to select a section"
          disabled={!sections.length}
          items={sections.map(s => ({ label: `Section ${s.section_name}`, value: String(s.id) }))}
        />

        <Animated.View style={{ marginTop: 18, transform: [{ scale: btnS }] }}>
          <Pressable onPress={handleAdd} disabled={loading} onPressIn={pIn} onPressOut={pOut}>
            <LinearGradient
              colors={['#2563EB', '#1D4ED8']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={S.btn}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.btnText}>Add Student</Text>}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper:        { flex: 1, backgroundColor: C.bg },
  header:         {
    paddingHorizontal: 24, paddingTop: 50, paddingBottom: 30, overflow: 'hidden',
  },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: '#E0E7FF', marginBottom: 6 },
  headerSub:      { fontSize: 13, color: C.headerSub },
  formCard:       {
    margin: 16, marginTop: 20,
    backgroundColor: C.card, borderRadius: 20, padding: 22,
    paddingBottom: 32,
    shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  row:            { flexDirection: 'row', gap: 12 },
  half:           { flex: 1 },
  pickerBox:      {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    backgroundColor: C.cardAlt, marginBottom: 4, overflow: 'hidden',
  },
  pickerDisabled: { opacity: 0.45 },
  inputFocus:     {
    borderColor: '#2563EB', backgroundColor: '#EFF6FF',
    shadowColor: '#2563EB', shadowOpacity: 0.2, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
});
