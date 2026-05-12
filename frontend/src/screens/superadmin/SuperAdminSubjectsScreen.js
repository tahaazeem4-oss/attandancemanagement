import React from 'react';
import SubjectsManagerScreen from '../../components/SubjectsManagerScreen';

export default function SuperAdminSubjectsScreen({ navigation }) {
  return <SubjectsManagerScreen navigation={navigation} mode="superadmin" />;
}
