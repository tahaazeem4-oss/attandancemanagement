import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Auth screens
import SignUpScreen   from '../screens/SignUpScreen';
import LoginScreen    from '../screens/LoginScreen';

// Teacher screens (existing)
import HomeScreen              from '../screens/HomeScreen';
import ClassSelectionScreen    from '../screens/ClassSelectionScreen';
import StudentAttendanceScreen from '../screens/StudentAttendanceScreen';
import AddStudentScreen        from '../screens/AddStudentScreen';
import ReportScreen            from '../screens/ReportScreen';
import TeacherLeavesScreen     from '../screens/TeacherLeavesScreen';

// Admin screens
import AdminHomeScreen        from '../screens/admin/AdminHomeScreen';
import AdminTeachersScreen    from '../screens/admin/AdminTeachersScreen';
import AdminStudentsScreen    from '../screens/admin/AdminStudentsScreen';
import AdminClassesScreen     from '../screens/admin/AdminClassesScreen';
import AdminAssignmentsScreen from '../screens/admin/AdminAssignmentsScreen';
import AdminLeavesScreen      from '../screens/admin/AdminLeavesScreen';

// Super admin screens
import SuperAdminHomeScreen    from '../screens/superadmin/SuperAdminHomeScreen';
import SuperAdminSchoolsScreen  from '../screens/superadmin/SuperAdminSchoolsScreen';
import SuperAdminTeachersScreen from '../screens/superadmin/SuperAdminTeachersScreen';
import SuperAdminStudentsScreen from '../screens/superadmin/SuperAdminStudentsScreen';

// Student / Parent screens
import StudentHomeScreen      from '../screens/student/StudentHomeScreen';
import StudentHistoryScreen   from '../screens/student/StudentHistoryScreen';
import StudentLeaveScreen     from '../screens/student/StudentLeaveScreen';

const Stack = createNativeStackNavigator();

const headerStyle = {
  headerStyle:      { backgroundColor: '#2563EB' },
  headerTintColor:  '#fff',
  headerTitleStyle: { fontWeight: '700' },
};

export default function AppNavigator() {
  const { user } = useAuth();

  return (
    <Stack.Navigator screenOptions={headerStyle}>
      {!user ? (
        // ── Auth flow ────────────────────────────────────────
        <>
          <Stack.Screen name="Login"  component={LoginScreen}  options={{ title: 'Sign In' }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account' }} />
        </>
      ) : user.role === 'super_admin' ? (
        // ── Super Admin flow ─────────────────────────────────
        <>
          <Stack.Screen name="SuperAdminHome"     component={SuperAdminHomeScreen}    options={{ headerShown: false }} />
          <Stack.Screen name="SuperAdminSchools"  component={SuperAdminSchoolsScreen} options={{ title: 'Manage Schools' }} />
          <Stack.Screen name="SuperAdminTeachers" component={SuperAdminTeachersScreen} options={{ title: 'Manage Teachers' }} />
          <Stack.Screen name="SuperAdminStudents" component={SuperAdminStudentsScreen} options={{ title: 'Manage Students' }} />
        </>
      ) : user.role === 'admin' ? (
        // ── Admin flow ───────────────────────────────────────
        <>
          <Stack.Screen name="AdminHome"        component={AdminHomeScreen}        options={{ title: 'Admin Dashboard',   headerShown: false }} />
          <Stack.Screen name="AdminTeachers"    component={AdminTeachersScreen}    options={{ title: 'Manage Teachers'  }} />
          <Stack.Screen name="AdminStudents"    component={AdminStudentsScreen}    options={{ title: 'Manage Students'  }} />
          <Stack.Screen name="AdminClasses"     component={AdminClassesScreen}     options={{ title: 'Classes & Sections' }} />
          <Stack.Screen name="AdminAssignments" component={AdminAssignmentsScreen} options={{ title: 'Teacher Assignments' }} />
          <Stack.Screen name="AdminLeaves"      component={AdminLeavesScreen}      options={{ title: 'Leave Requests', headerShown: false }} />
        </>
      ) : user.role === 'student' ? (
        // ── Student / Parent flow ────────────────────────────
        <>
          <Stack.Screen name="StudentHome"    component={StudentHomeScreen}    options={{ title: 'My Dashboard',   headerShown: false }} />
          <Stack.Screen name="StudentHistory" component={StudentHistoryScreen} options={{ title: 'Attendance History' }} />
          <Stack.Screen name="StudentLeaves"  component={StudentLeaveScreen}   options={{ title: 'Leave Applications' }} />
        </>
      ) : (
        // ── Teacher flow (existing) ──────────────────────────
        <>
          <Stack.Screen name="Home"              component={HomeScreen}              options={{ title: 'Dashboard' }} />
          <Stack.Screen name="ClassSelection"    component={ClassSelectionScreen}    options={{ title: 'Select Class' }} />
          <Stack.Screen name="StudentAttendance" component={StudentAttendanceScreen} options={{ title: 'Mark Attendance' }} />
          <Stack.Screen name="AddStudent"        component={AddStudentScreen}        options={{ title: 'Add Student' }} />
          <Stack.Screen name="TeacherLeaves"     component={TeacherLeavesScreen}     options={{ title: 'Leave Requests', headerShown: false }} />
          <Stack.Screen name="Report"            component={ReportScreen}            options={{ title: 'Attendance Report' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
