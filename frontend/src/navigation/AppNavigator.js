import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

// Auth screens
import SignUpScreen          from '../screens/SignUpScreen';
import LoginScreen           from '../screens/LoginScreen';
import ForgotPasswordScreen  from '../screens/ForgotPasswordScreen';

// Shared screens
import ProfileScreen               from '../screens/ProfileScreen';
import StaffNotificationsScreen    from '../screens/StaffNotificationsScreen';
import SendNotificationScreen      from '../screens/SendNotificationScreen';
import UploadLectureScreen         from '../screens/UploadLectureScreen';
import LectureListScreen           from '../screens/LectureListScreen';

// Teacher screens
import HomeScreen              from '../screens/HomeScreen';
import ClassSelectionScreen    from '../screens/ClassSelectionScreen';
import StudentAttendanceScreen from '../screens/StudentAttendanceScreen';
import AddStudentScreen        from '../screens/AddStudentScreen';
import ReportScreen            from '../screens/ReportScreen';
import TeacherLeavesScreen     from '../screens/TeacherLeavesScreen';
import StudentAttendanceDetailScreen from '../screens/StudentAttendanceDetailScreen';

// Admin screens
import AdminHomeScreen        from '../screens/admin/AdminHomeScreen';
import AdminTeachersScreen    from '../screens/admin/AdminTeachersScreen';
import AdminStudentsScreen    from '../screens/admin/AdminStudentsScreen';
import AdminClassesScreen     from '../screens/admin/AdminClassesScreen';
import AdminAssignmentsScreen from '../screens/admin/AdminAssignmentsScreen';
import AdminLeavesScreen      from '../screens/admin/AdminLeavesScreen';
import AdminSubjectsScreen                from '../screens/admin/AdminSubjectsScreen';
import AdminTeacherAttendanceScreen       from '../screens/admin/AdminTeacherAttendanceScreen';

// Super admin screens
import SuperAdminHomeScreen     from '../screens/superadmin/SuperAdminHomeScreen';
import SuperAdminSchoolsScreen  from '../screens/superadmin/SuperAdminSchoolsScreen';
import SuperAdminTeachersScreen from '../screens/superadmin/SuperAdminTeachersScreen';
import SuperAdminStudentsScreen from '../screens/superadmin/SuperAdminStudentsScreen';

// Student screens
import StudentHomeScreen          from '../screens/student/StudentHomeScreen';
import StudentHistoryScreen       from '../screens/student/StudentHistoryScreen';
import StudentLeaveScreen         from '../screens/student/StudentLeaveScreen';
import StudentLecturesScreen      from '../screens/student/StudentLecturesScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// â”€â”€ Shared style applied to all headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const headerStyle = {
  headerStyle:      { backgroundColor: '#2563EB' },
  headerTintColor:  '#fff',
  headerTitleStyle: { fontWeight: '700' },
};

// â”€â”€ Tab bar config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useTabBarOptions() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  return {
    tabBarStyle: {
      backgroundColor: '#2563EB',
      borderTopWidth: 0,
      height: 56 + bottomPad,
      paddingBottom: bottomPad,
      paddingTop: 6,
      elevation: 12,
      shadowColor: '#1E3A8A',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -3 },
    },
    tabBarActiveTintColor:   '#ffffff',
    tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  };
}

// â”€â”€ Tab icon renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function tabIcon(focused, name, nameOutline, size = 24) {
  return <Ionicons name={focused ? name : nameOutline} size={size} color={focused ? '#fff' : 'rgba(255,255,255,0.45)'} />;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TEACHER TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function TeacherHomeStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="Home"              component={HomeScreen}              options={{ headerShown: false }} />
      <Stack.Screen name="ClassSelection"    component={ClassSelectionScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="StudentAttendance" component={StudentAttendanceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddStudent"        component={AddStudentScreen}        options={{ title: 'Add Student' }} />
      <Stack.Screen name="TeacherLeaves"     component={TeacherLeavesScreen}     options={{ title: 'Leave Requests', headerShown: false }} />
      <Stack.Screen name="Report"            component={ReportScreen}            options={{ headerShown: false }} />
      <Stack.Screen name="StudentAttendanceDetail" component={StudentAttendanceDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UploadLecture"     component={UploadLectureScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="LectureList"       component={LectureListScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="SendNotification"     component={SendNotificationScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="StaffNotifications"    component={StaffNotificationsScreen}   options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function TeacherTabs() {
  const tabBarOptions = useTabBarOptions();
  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        component={TeacherHomeStack}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      <Tab.Screen
        name="NotifTab"
        component={StaffNotificationsScreen}
        options={{ title: 'Notifications', tabBarIcon: ({ focused }) => tabIcon(focused, 'notifications', 'notifications-outline') }}
      />
    </Tab.Navigator>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADMIN TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function AdminHomeStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="AdminHome"        component={AdminHomeScreen}        options={{ headerShown: false }} />
      <Stack.Screen name="AdminTeachers"    component={AdminTeachersScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="AdminStudents"    component={AdminStudentsScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="AdminClasses"     component={AdminClassesScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="AdminAssignments" component={AdminAssignmentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AdminLeaves"      component={AdminLeavesScreen}      options={{ headerShown: false }} />
      <Stack.Screen name="SendNotification" component={SendNotificationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UploadLecture"    component={UploadLectureScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="LectureList"      component={LectureListScreen}      options={{ headerShown: false }} />
      <Stack.Screen name="AdminSubjects"           component={AdminSubjectsScreen}           options={{ headerShown: false }} />
      <Stack.Screen name="StaffNotifications"       component={StaffNotificationsScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="AdminTeacherAttendance"   component={AdminTeacherAttendanceScreen}   options={{ headerShown: false }} />
      <Stack.Screen name="Report"                    component={ReportScreen}                    options={{ headerShown: false }} />
      <Stack.Screen name="StudentAttendanceDetail"   component={StudentAttendanceDetailScreen}   options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function AdminTabs() {
  const tabBarOptions = useTabBarOptions();
  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        component={AdminHomeStack}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      <Tab.Screen
        name="NotifTab"
        component={StaffNotificationsScreen}
        options={{ title: 'Notifications', tabBarIcon: ({ focused }) => tabIcon(focused, 'notifications', 'notifications-outline') }}
      />
    </Tab.Navigator>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SUPER ADMIN TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function SuperAdminHomeStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="SuperAdminHome"     component={SuperAdminHomeScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="SuperAdminSchools"  component={SuperAdminSchoolsScreen}  options={{ title: 'Manage Schools' }} />
      <Stack.Screen name="SuperAdminTeachers" component={SuperAdminTeachersScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SuperAdminStudents"  component={SuperAdminStudentsScreen}  options={{ headerShown: false }} />
      <Stack.Screen name="StaffNotifications"  component={StaffNotificationsScreen}  options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function SuperAdminTabs() {
  const tabBarOptions = useTabBarOptions();
  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        component={SuperAdminHomeStack}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      <Tab.Screen
        name="NotifTab"
        component={StaffNotificationsScreen}
        options={{ title: 'Notifications', tabBarIcon: ({ focused }) => tabIcon(focused, 'notifications', 'notifications-outline') }}
      />
    </Tab.Navigator>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STUDENT TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function StudentHomeStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="StudentHome"          component={StudentHomeScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="StudentHistory"       component={StudentHistoryScreen}  options={{ headerShown: false }} />
      <Stack.Screen name="StudentLeaves"        component={StudentLeaveScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="StudentLectures"       component={StudentLecturesScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="StudentNotifications" component={StudentNotificationsScreen}  options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function StudentTabs() {
  const tabBarOptions = useTabBarOptions();
  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        component={StudentHomeStack}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      <Tab.Screen
        name="NotifTab"
        component={StudentNotificationsScreen}
        options={{ title: 'Notifications', tabBarIcon: ({ focused }) => tabIcon(focused, 'notifications', 'notifications-outline') }}
      />
    </Tab.Navigator>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROOT NAVIGATOR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function AppNavigator() {
  const { user } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login"         component={LoginScreen} />
          <Stack.Screen name="SignUp"         component={SignUpScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : user.role === 'super_admin' ? (
        <Stack.Screen name="SuperAdminTabs" component={SuperAdminTabs} />
      ) : user.role === 'admin' ? (
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
      ) : user.role === 'student' ? (
        <Stack.Screen name="StudentTabs" component={StudentTabs} />
      ) : (
        <Stack.Screen name="TeacherTabs" component={TeacherTabs} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({});
