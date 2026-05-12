import React from 'react';
import StudentsManagerScreen from '../../components/StudentsManagerScreen';

export default function AdminStudentsScreen({ navigation }) {
  return <StudentsManagerScreen navigation={navigation} mode="admin" />;
}
