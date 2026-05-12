import React from 'react';
import TeachersManagerScreen from '../../components/TeachersManagerScreen';

export default function OrgAdminTeachersScreen({ navigation }) {
  return <TeachersManagerScreen navigation={navigation} mode="orgadmin" />;
}
