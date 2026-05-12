import React from 'react';
import LeaveRequestsManagerScreen from '../components/LeaveRequestsManagerScreen';

export default function TeacherLeavesScreen({ navigation }) {
  return <LeaveRequestsManagerScreen navigation={navigation} mode="teacher" />;
}
