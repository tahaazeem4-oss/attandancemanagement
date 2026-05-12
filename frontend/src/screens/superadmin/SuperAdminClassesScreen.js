import React from 'react';
import ClassesManagerScreen from '../../components/ClassesManagerScreen';

export default function SuperAdminClassesScreen({ navigation }) {
  return <ClassesManagerScreen navigation={navigation} mode="superadmin" />;
}
