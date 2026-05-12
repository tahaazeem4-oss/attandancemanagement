import React from 'react';
import ClassesManagerScreen from '../../components/ClassesManagerScreen';

export default function AdminClassesScreen({ navigation }) {
  return <ClassesManagerScreen navigation={navigation} mode="admin" />;
}
