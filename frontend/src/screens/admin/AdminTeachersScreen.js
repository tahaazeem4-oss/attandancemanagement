import React from 'react';
import TeachersManagerScreen from '../../components/TeachersManagerScreen';

export default function AdminTeachersScreen({ navigation }) {
  return <TeachersManagerScreen navigation={navigation} mode="admin" />;
}
