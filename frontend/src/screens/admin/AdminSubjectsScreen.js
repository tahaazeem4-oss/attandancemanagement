import React from 'react';
import SubjectsManagerScreen from '../../components/SubjectsManagerScreen';

export default function AdminSubjectsScreen({ navigation }) {
  return <SubjectsManagerScreen navigation={navigation} mode="admin" />;
}
