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
import UploadLectureScreen     from '../screens/UploadLectureScreen';
import LectureListScreen       from '../screens/LectureListScreen';
import SendNotificationScreen  from '../screens/SendNotificationScreen';

// Admin screens
import AdminHomeScreen        from '../screens/admin/AdminHomeScreen';
import AdminTeachersScreen    from '../screens/admin/AdminTeachersScreen';
import AdminStudentsScreen    from '../screens/admin/AdminStudentsScreen';
import AdminClassesScreen     from '../screens/admin/AdminClassesScreen';
import AdminAssignmentsScreen from '../screens/admin/AdminAssignmentsScreen';
import AdminLeavesScreen      from '../screens/admin/AdminLeavesScreen';
import AdminSubjectsScreen    from '../screens/admin/AdminSubjectsScreen';

// Super admin screens
import SuperAdminHomeScreen    from '../screens/superadmin/SuperAdminHomeScreen';
import SuperAdminSchoolsScreen  from '../screens/superadmin/SuperAdminSchoolsScreen';
import SuperAdminTeachersScreen from '../screens/superadmin/SuperAdminTeachersScreen';
import SuperAdminStudentsScreen from '../screens/superadmin/SuperAdminStudentsScreen';

// Student / Parent screens
import StudentHomeScreen      from '../screens/student/StudentHomeScreen';
import StudentHistoryScreen   from '../screens/student/StudentHistoryScreen';
import StudentLeaveScreen     from '../screens/student/StudentLeaveScreen';
import StudentLecturesScreen  from '../screens/student/StudentLecturesScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';
import StaffNotificationsScreen   from '../screens/StaffNotificationsScreen';

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
          <Stack.Screen name="Login"  component={LoginScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
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
          <Stack.Screen name="AdminTeachers"    component={AdminTeachersScreen}    options={{ headerShown: false }} />
          <Stack.Screen name="AdminStudents"    component={AdminStudentsScreen}    options={{ headerShown: false }} />
          <Stack.Screen name="AdminClasses"     component={AdminClassesScreen}     options={{ headerShown: false }} />
          <Stack.Screen name="AdminAssignments" component={AdminAssignmentsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AdminLeaves"      component={AdminLeavesScreen}      options={{ title: 'Leave Requests', headerShown: false }} />
          <Stack.Screen name="SendNotification" component={SendNotificationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="UploadLecture"    component={UploadLectureScreen}    options={{ headerShown: false }} />
          <Stack.Screen name="LectureList"      component={LectureListScreen}      options={{ headerShown: false }} />
          <Stack.Screen name="AdminSubjects"         component={AdminSubjectsScreen}         options={{ headerShown: false }} />
          <Stack.Screen name="StaffNotifications"     component={StaffNotificationsScreen}    options={{ headerShown: false }} />
        </>
      ) : user.role === 'student' ? (
        // ── Student / Parent flow ────────────────────────────
        <>
          <Stack.Screen name="StudentHome"       component={StudentHomeScreen}    options={{ title: 'My Dashboard',   headerShown: false }} />
          <Stack.Screen name="StudentHistory"    component={StudentHistoryScreen} options={{ headerShown: false }} />
          <Stack.Screen name="StudentLeaves"     component={StudentLeaveScreen}   options={{ headerShown: false }} />
          <Stack.Screen name="StudentLectures"        component={StudentLecturesScreen}        options={{ headerShown: false }} />
          <Stack.Screen name="StudentNotifications"    component={StudentNotificationsScreen}   options={{ headerShown: false }} />
        </>
      ) : (
        // ── Teacher flow (existing) ──────────────────────────
        <>
          <Stack.Screen name="Home"              component={HomeScreen}              options={{ headerShown: false }} />
          <Stack.Screen name="ClassSelection"    component={ClassSelectionScreen}    options={{ headerShown: false }} />
          <Stack.Screen name="StudentAttendance" component={StudentAttendanceScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AddStudent"        component={AddStudentScreen}        options={{ title: 'Add Student' }} />
          <Stack.Screen name="TeacherLeaves"     component={TeacherLeavesScreen}     options={{ title: 'Leave Requests', headerShown: false }} />
          <Stack.Screen name="Report"            component={ReportScreen}            options={{ headerShown: false }} />
          <Stack.Screen name="UploadLecture"     component={UploadLectureScreen}     options={{ headerShown: false }} />
          <Stack.Screen name="LectureList"       component={LectureListScreen}       options={{ headerShown: false }} />
          <Stack.Screen name="SendNotification"    component={SendNotificationScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="StaffNotifications"   component={StaffNotificationsScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
