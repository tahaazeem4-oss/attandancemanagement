import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  ActivityIndicator, Alert, ScrollView, StatusBar, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { C, S } from '../config/theme';
import { HeaderBlobs, useEntrance } from '../components/Deco';
import PickerField from '../components/PickerField';

export default function ClassSelectionScreen({ navigation, route }) {
  const mode = route?.params?.mode || 'attendance';  // 'attendance' | 'report'

  const [assignments,     setAssignments]     = useState([]);
  const [selectedClass,   setSelectedClass]   = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const cardAnim = useEntrance();
  const btnS = useRef(new Animated.Value(1)).current;
  const pIn  = () => Animated.spring(btnS, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pOut = () => Animated.spring(btnS, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  useEffect(() => {
    api.get('/teachers/classes')
      .then(({ data }) => {
        setAssignments(data);
        // Auto-navigate if exactly one assignment
        if (data.length === 1) {
          const a = data[0];
          const dest = mode === 'report' ? 'Report' : 'StudentAttendance';
          navigation.replace(dest, {
            class_id:     a.class_id,
            section_id:   a.section_id,
            class_name:   a.class_name,
            section_name: a.section_name,
          });
        }
      })
      .catch(() => Alert.alert('Error', 'Could not load assigned classes'))
      .finally(() => setLoading(false));
  }, []);

  // Unique classes from assignments
  const uniqueClasses = [...new Map(
    assignments.map(a => [a.class_id, { id: a.class_id, class_name: a.class_name }])
  ).values()];

  // Sections for the selected class
  const sectionsForClass = assignments
    .filter(a => String(a.class_id) === String(selectedClass))
    .map(a => ({ id: a.section_id, section_name: a.section_name }));

  const handleProceed = () => {
    if (!selectedClass || !selectedSection) {
      return Alert.alert('Select both class and section', 'Please pick a class and a section first.');
    }
    const classObj   = uniqueClasses.find(c => String(c.id) === String(selectedClass));
    const sectionObj = sectionsForClass.find(s => String(s.id) === String(selectedSection));

    const dest = mode === 'report' ? 'Report' : 'StudentAttendance';
    navigation.navigate(dest, {
      class_id:     selectedClass,
      section_id:   selectedSection,
      class_name:   classObj?.class_name,
      section_name: sectionObj?.section_name,
    });
  };

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );

  if (!loading && assignments.length === 0) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, padding: 32 }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🏫</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.textDark, marginBottom: 6 }}>No class assigned</Text>
      <Text style={{ fontSize: 14, color: C.textMed, textAlign: 'center' }}>You have not been assigned to any class yet. Contact your admin.</Text>
    </View>
  );

  // Single assignment → auto-navigated by useEffect, show loader
  if (assignments.length === 1) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0C29" />

      {/* Gradient Header */}
      <LinearGradient
        colors={['#0F0C29', '#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <HeaderBlobs />
        <Text style={styles.headerTitle}>
          {mode === 'report' ? '📊  Select Class for Report' : '📋  Select Class & Section'}
        </Text>
        <Text style={styles.headerSub}>
          {mode === 'report' ? 'Choose a class to view its attendance report' : 'Choose a class and section to mark attendance'}
        </Text>
      </LinearGradient>

      <Animated.View style={[styles.formCard, cardAnim]}>
        <Text style={S.label}>Class</Text>
        <PickerField
          label="Class"
          value={selectedClass}
          onChange={v => { setSelectedClass(v); setSelectedSection(''); }}
          placeholder="Tap to select a class"
          items={uniqueClasses.map(c => ({ label: c.class_name, value: String(c.id) }))}
        />

        <Text style={[S.label, { marginTop: 12 }]}>Section</Text>
        <PickerField
          label="Section"
          value={selectedSection}
          onChange={v => setSelectedSection(v)}
          placeholder="Tap to select a section"
          disabled={!selectedClass}
          items={sectionsForClass.map(s => ({ label: `Section ${s.section_name}`, value: String(s.id) }))}
        />

        <Animated.View style={{ marginTop: 16, transform: [{ scale: btnS }] }}>
          <Pressable onPress={handleProceed} onPressIn={pIn} onPressOut={pOut}>
            <LinearGradient
              colors={['#6366F1', '#4F46E5', '#3730A3']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={S.btn}
            >
              <Text style={S.btnText}>
                {mode === 'report' ? 'View Report  →' : 'Load Students  →'}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  header:         {
    paddingHorizontal: 24, paddingTop: 50, paddingBottom: 30, overflow: 'hidden',
  },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: '#E0E7FF', marginBottom: 6 },
  headerSub:      { fontSize: 13, color: C.headerSub, lineHeight: 18 },
  formCard:       {
    margin: 16, marginTop: 20,
    backgroundColor: C.card, borderRadius: 20, padding: 22,
    shadowColor: C.shadow, shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },

});
