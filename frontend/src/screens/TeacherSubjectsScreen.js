import React from 'react';
import SubjectsManagerScreen from '../components/SubjectsManagerScreen';

export default function TeacherSubjectsScreen({ navigation }) {
  return <SubjectsManagerScreen navigation={navigation} mode="teacher" />;
}