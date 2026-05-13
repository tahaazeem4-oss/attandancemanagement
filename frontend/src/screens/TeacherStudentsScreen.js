import React from 'react';
import StudentsManagerScreen from '../components/StudentsManagerScreen';

export default function TeacherStudentsScreen({ navigation }) {
  return <StudentsManagerScreen navigation={navigation} mode="teacher" />;
}
