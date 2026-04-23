import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Auth screens
import SignUpScreen   from '../screens/SignUpScreen';
import LoginScreen    from '../screens/LoginScreen';

// App screens
import HomeScreen             from '../screens/HomeScreen';
import ClassSelectionScreen   from '../screens/ClassSelectionScreen';
import StudentAttendanceScreen from '../screens/StudentAttendanceScreen';
import AddStudentScreen       from '../screens/AddStudentScreen';
import ReportScreen           from '../screens/ReportScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { teacher } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:      { backgroundColor: '#2563EB' },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700' }
      }}
    >
      {!teacher ? (
        // ── Auth flow ──────────────────────────────────────────
        <>
          <Stack.Screen name="Login"  component={LoginScreen}  options={{ title: 'Teacher Login' }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />
        </>
      ) : (
        // ── App flow ───────────────────────────────────────────
        <>
          <Stack.Screen name="Home"              component={HomeScreen}              options={{ title: 'Dashboard' }} />
          <Stack.Screen name="ClassSelection"    component={ClassSelectionScreen}    options={{ title: 'Select Class' }} />
          <Stack.Screen name="StudentAttendance" component={StudentAttendanceScreen} options={{ title: 'Mark Attendance' }} />
          <Stack.Screen name="AddStudent"        component={AddStudentScreen}        options={{ title: 'Add Student' }} />
          <Stack.Screen name="Report"            component={ReportScreen}            options={{ title: 'Attendance Report' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
