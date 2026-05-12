import React from 'react';
import ParentsManagerScreen from '../../components/ParentsManagerScreen';

export default function SuperAdminParentsScreen({ navigation }) {
  return <ParentsManagerScreen navigation={navigation} mode="superadmin" />;
}
