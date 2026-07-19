// frontend/src/features/timetable/TeacherTimetableScreen.js
// Teacher's own timetable — automatically aggregated across every class
// they teach, no manual class selection. Today / Tomorrow / Week only.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { C } from '../../config/theme';
import AppHeader from '../../components/AppHeader';
import DayPeriodList from './DayPeriodList';
import { getTeacherTimetable } from './api';

export default function TeacherTimetableScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <AppHeader title="My Timetable" navigation={navigation} showBack={false} />
      <DayPeriodList mode="teacher" loadRange={getTeacherTimetable} emptyLabel="No classes scheduled." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
});
