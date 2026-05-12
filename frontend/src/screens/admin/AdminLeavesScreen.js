import React from 'react';
import LeaveRequestsManagerScreen from '../../components/LeaveRequestsManagerScreen';

export default function AdminLeavesScreen({ navigation }) {
  return <LeaveRequestsManagerScreen navigation={navigation} mode="admin" />;
}


