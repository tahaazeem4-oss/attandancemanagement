import React from 'react';
import StudentsManagerScreen from '../../components/StudentsManagerScreen';

export default function SuperAdminStudentsScreen({ navigation }) {
  return <StudentsManagerScreen navigation={navigation} mode="superadmin" />;
}
