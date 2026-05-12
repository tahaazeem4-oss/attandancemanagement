import React from 'react';
import StudentsManagerScreen from '../../components/StudentsManagerScreen';

export default function OrgAdminStudentsScreen({ navigation }) {
  return <StudentsManagerScreen navigation={navigation} mode="orgadmin" />;
}
