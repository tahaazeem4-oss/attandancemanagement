import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';

export default function ClassSelectionScreen({ navigation, route }) {
  const mode = route?.params?.mode || 'attendance';  // 'attendance' | 'report'

  const [classes,     setClasses]     = useState([]);
  const [sections,    setSections]    = useState([]);
  const [selectedClass,   setSelectedClass]   = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/classes')
      .then(({ data }) => setClasses(data))
      .catch(() => Alert.alert('Error', 'Could not load classes'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedClass) { setSections([]); setSelectedSection(''); return; }
    api.get(`/classes/${selectedClass}/sections`)
      .then(({ data }) => { setSections(data); setSelectedSection(''); })
      .catch(() => Alert.alert('Error', 'Could not load sections'));
  }, [selectedClass]);

  const handleProceed = () => {
    if (!selectedClass || !selectedSection) {
      return Alert.alert('Select both class and section', 'Please pick a class and a section first.');
    }
    const classObj   = classes.find(c => String(c.id) === String(selectedClass));
    const sectionObj = sections.find(s => String(s.id) === String(selectedSection));

    if (mode === 'report') {
      navigation.navigate('Report', {
        class_id:     selectedClass,
        section_id:   selectedSection,
        class_name:   classObj?.class_name,
        section_name: sectionObj?.section_name
      });
    } else {
      navigation.navigate('StudentAttendance', {
        class_id:     selectedClass,
        section_id:   selectedSection,
        class_name:   classObj?.class_name,
        section_name: sectionObj?.section_name
      });
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} color="#2563EB" size="large" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.heading}>
        {mode === 'report' ? 'Select Class for Report' : 'Select Class & Section'}
      </Text>

      <Text style={styles.label}>Class</Text>
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={selectedClass}
          onValueChange={v => setSelectedClass(v)}
        >
          <Picker.Item label="— Select Class —" value="" />
          {classes.map(c => (
            <Picker.Item key={c.id} label={c.class_name} value={String(c.id)} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Section</Text>
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={selectedSection}
          onValueChange={v => setSelectedSection(v)}
          enabled={sections.length > 0}
        >
          <Picker.Item label="— Select Section —" value="" />
          {sections.map(s => (
            <Picker.Item key={s.id} label={`Section ${s.section_name}`} value={String(s.id)} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity style={styles.btn} onPress={handleProceed}>
        <Text style={styles.btnText}>
          {mode === 'report' ? 'View Report' : 'Load Students'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F8FAFC' },
  heading:    { fontSize: 20, fontWeight: '700', color: '#1E3A5F', marginBottom: 24 },
  label:      { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  pickerBox:  {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    backgroundColor: '#fff', marginBottom: 18, overflow: 'hidden'
  },
  btn:        {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8
  },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' }
});
