// frontend/src/screens/student/StudentTimetableScreen.js
// Student's own class timetable — no class selection. Also used for a
// parent viewing a child's timetable (route.params.child.student_id).
import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { C } from '../../config/theme';
import DayPeriodList from '../../features/timetable/DayPeriodList';
import { getStudentTimetable, getParentTimetable } from '../../features/timetable/api';

export default function StudentTimetableScreen({ route }) {
  const child = route?.params?.child || null;

  const loadRange = useCallback(
    (range) => (child?.student_id ? getParentTimetable(child.student_id, range) : getStudentTimetable(range)),
    [child?.student_id],
  );

  return (
    <View style={styles.container}>
      <DayPeriodList mode="student" loadRange={loadRange} emptyLabel="No published timetable yet." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
});
