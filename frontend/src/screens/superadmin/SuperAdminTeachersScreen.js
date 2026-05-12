import React from 'react';
import TeachersManagerScreen from '../../components/TeachersManagerScreen';

export default function SuperAdminTeachersScreen({ navigation }) {
  return <TeachersManagerScreen navigation={navigation} mode="superadmin" />;
}
