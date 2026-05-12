import React from 'react';
import LeaveRequestsManagerScreen from '../../components/LeaveRequestsManagerScreen';

export default function OrgAdminLeavesScreen({ navigation }) {
  return <LeaveRequestsManagerScreen navigation={navigation} mode="orgadmin" />;
}

