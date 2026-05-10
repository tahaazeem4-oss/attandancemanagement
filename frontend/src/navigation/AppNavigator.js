import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppHeader from '../components/AppHeader';

// Auth screens
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
import AdminParentsScreen               from '../screens/admin/AdminParentsScreen';
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
import StudentLectureDetailScreen from '../screens/student/StudentLectureDetailScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';

// Parent screens
import ParentLoginScreen       from '../screens/parent/ParentLoginScreen';
import ParentDashboardScreen   from '../screens/parent/ParentDashboardScreen';

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

function notificationBadgeValue(unread) {
  if (!unread || unread <= 0) return undefined;
  return unread > 99 ? '99+' : String(unread);
}

function notificationTabIcon({ focused, unread }) {
  const hasUnread = unread > 0;
  return (
    <View style={[styles.notifIconWrap, hasUnread && styles.notifIconWrapUnread]}>
      <Ionicons
        name={focused ? 'notifications' : 'notifications-outline'}
        size={24}
        color={focused || hasUnread ? '#fff' : 'rgba(255,255,255,0.45)'}
      />
      {hasUnread && <View style={styles.notifDot} />}
    </View>
  );
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
  const [notifUnread, setNotifUnread] = useState(0);
  const fetchUnread = useCallback(() => {
    api.get('/notifications/inbox/unread-count')
      .then(({ data }) => setNotifUnread(data.count || 0))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchUnread(); }, [fetchUnread]);

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
        listeners={{ tabPress: fetchUnread }}
        options={{
          title: 'Notifications',
          tabBarBadge: notificationBadgeValue(notifUnread),
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
          tabBarIcon: ({ focused }) => notificationTabIcon({ focused, unread: notifUnread }),
        }}
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
      <Stack.Screen name="AdminParents"            component={AdminParentsScreen}            options={{ headerShown: false }} />
      <Stack.Screen name="StaffNotifications"       component={StaffNotificationsScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="AdminTeacherAttendance"   component={AdminTeacherAttendanceScreen}   options={{ headerShown: false }} />
      <Stack.Screen name="Report"                    component={ReportScreen}                    options={{ headerShown: false }} />
      <Stack.Screen name="StudentAttendanceDetail"   component={StudentAttendanceDetailScreen}   options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function AdminTabs() {
  const tabBarOptions = useTabBarOptions();
  const [notifUnread, setNotifUnread] = useState(0);
  const fetchUnread = useCallback(() => {
    api.get('/notifications/inbox/unread-count')
      .then(({ data }) => setNotifUnread(data.count || 0))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchUnread(); }, [fetchUnread]);

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
        listeners={{ tabPress: fetchUnread }}
        options={{
          title: 'Notifications',
          tabBarBadge: notificationBadgeValue(notifUnread),
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
          tabBarIcon: ({ focused }) => notificationTabIcon({ focused, unread: notifUnread }),
        }}
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
      <Stack.Screen
        name="StudentClasswork"
        component={StudentLecturesScreen}
        initialParams={{ fixedType: 'classwork', title: 'Class Work' }}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudentHomework"
        component={StudentLecturesScreen}
        initialParams={{ fixedType: 'homework', title: 'Homework' }}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="StudentLectureDetail" component={StudentLectureDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StudentNotifications" component={StudentNotificationsScreen}  options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function StudentTabs() {
  const tabBarOptions = useTabBarOptions();
  const [notifUnread, setNotifUnread] = useState(0);
  const fetchUnread = useCallback(() => {
    api.get('/notifications/me/unread-count')
      .then(({ data }) => setNotifUnread(data.count || 0))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchUnread(); }, [fetchUnread]);

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
        listeners={{ tabPress: fetchUnread }}
        options={{
          title: 'Notifications',
          tabBarBadge: notificationBadgeValue(notifUnread),
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
          tabBarIcon: ({ focused }) => notificationTabIcon({ focused, unread: notifUnread }),
        }}
      />
    </Tab.Navigator>
  );
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// PARENT STACKS
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
function ParentChildHomeStack({ route, child }) {
  const activeChild = child || route?.params?.child || null;
  return (
    <Stack.Navigator key={activeChild?.student_id ? `child-${activeChild.student_id}` : 'child-none'} screenOptions={headerStyle}>
      <Stack.Screen name="StudentHome"          component={StudentHomeScreen}     initialParams={{ child: activeChild }} options={{ headerShown: false }} />
      <Stack.Screen name="StudentHistory"       component={StudentHistoryScreen}  initialParams={{ child: activeChild }} options={{ headerShown: false }} />
      <Stack.Screen name="StudentLeaves"        component={StudentLeaveScreen}    initialParams={{ child: activeChild }} options={{ headerShown: false }} />
      <Stack.Screen
        name="StudentClasswork"
        component={StudentLecturesScreen}
        initialParams={{ fixedType: 'classwork', title: 'Class Work', child: activeChild }}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudentHomework"
        component={StudentLecturesScreen}
        initialParams={{ fixedType: 'homework', title: 'Homework', child: activeChild }}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="StudentLectureDetail" component={StudentLectureDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StudentNotifications" component={StudentNotificationsScreen} initialParams={{ child: activeChild }} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function ParentSwitchChildTab({ navigation, currentChild, onSelectChild, onBackHome }) {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.get('/parent/dashboard')
      .then(({ data }) => {
        if (mounted) setChildren(data.children || []);
      })
      .catch(() => {
        if (mounted) setChildren([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [currentChild?.student_id]);

  const initials = (child) => `${(child.first_name || '?')[0]}${(child.last_name || '?')[0]}`.toUpperCase();

  return (
    <View style={styles.parentSwitchContainer}>
      <AppHeader title="Your Children" navigation={navigation} />
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={children}
          keyExtractor={(item) => String(item.student_id)}
          contentContainerStyle={styles.parentSwitchList}
          ListEmptyComponent={
            <View style={styles.parentSwitchEmpty}>
              <Text style={styles.parentSwitchEmptyIcon}>👶</Text>
              <Text style={styles.parentSwitchEmptyTitle}>No children linked yet</Text>
              <Text style={styles.parentSwitchEmptyTxt}>Link a child from parent home page first.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const active = currentChild?.student_id === item.student_id;
            return (
              <Pressable
                onPress={() => { onSelectChild(item); onBackHome(item); }}
                style={({ pressed }) => [
                  styles.parentSwitchCard,
                  active && styles.parentSwitchCardActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.parentSwitchAvatar, active && styles.parentSwitchAvatarActive]}>
                  <Text style={styles.parentSwitchAvatarText}>{initials(item)}</Text>
                </View>
                <View style={styles.parentSwitchBody}>
                  <Text style={styles.parentSwitchName}>{item.first_name} {item.last_name}</Text>
                  <Text style={styles.parentSwitchSubtitle}>{item.class_name || 'Class'} • Sec {item.section_name || '-'}</Text>
                  {item.age ? <Text style={styles.parentSwitchMeta}>Age {item.age}</Text> : null}
                </View>
                <Ionicons name={active ? 'checkmark-circle' : 'chevron-forward'} size={20} color={active ? '#2563EB' : '#94A3B8'} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function ParentStudentPortalTabs({ route, navigation }) {
  const initialChild = route?.params?.child || null;
  const [currentChild, setCurrentChild] = useState(initialChild);
  const tabBarOptions = useTabBarOptions();
  const [notifUnread, setNotifUnread] = useState(0);

  useEffect(() => {
    const incomingChild = route?.params?.child || null;
    const selectionToken = route?.params?.selectionToken;
    if (
      incomingChild?.student_id &&
      (incomingChild.student_id !== currentChild?.student_id || !!selectionToken)
    ) {
      setCurrentChild(incomingChild);
    }
  }, [route?.params?.child?.student_id, route?.params?.selectionToken]);

  useEffect(() => {
    if (currentChild?.student_id) return;
    let mounted = true;
    api.get('/parent/dashboard')
      .then(({ data }) => {
        const first = (data.children || [])[0] || null;
        if (mounted && first?.student_id) setCurrentChild(first);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [currentChild?.student_id]);

  const fetchUnread = useCallback(() => {
    if (currentChild?.student_id) {
      api.get(`/parent/children/${currentChild.student_id}/notifications`)
        .then(({ data }) => {
          const list = data.notifications || [];
          setNotifUnread(list.filter(n => !n.is_read).length);
        })
        .catch(() => setNotifUnread(0));
      return;
    }
    api.get('/notifications/me/unread-count')
      .then(({ data }) => setNotifUnread(data.count || 0))
      .catch(() => setNotifUnread(0));
  }, [currentChild?.student_id]);
  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ParentHomeTab"
        component={ParentDashboardScreen}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('ParentDashboard');
          },
        }}
        options={{ title: 'Parent Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'grid', 'grid-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        children={(props) => <ParentChildHomeStack {...props} child={currentChild} />}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      <Tab.Screen
        name="NotifTab"
        children={(props) => <StudentNotificationsScreen {...props} route={{ ...props.route, params: { ...(props.route?.params || {}), child: currentChild } }} />}
        listeners={{ tabPress: fetchUnread }}
        options={{
          title: 'Notifications',
          tabBarBadge: notificationBadgeValue(notifUnread),
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
          tabBarIcon: ({ focused }) => notificationTabIcon({ focused, unread: notifUnread }),
        }}
      />
    </Tab.Navigator>
  );
}

function ParentStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="ParentDashboard" component={ParentDashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChildStudentPortal" component={ParentStudentPortalTabs} options={{ headerShown: false }} />
    </Stack.Navigator>
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
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ParentLogin"    component={ParentLoginScreen} />
        </>
      ) : user.role === 'super_admin' ? (
        <Stack.Screen name="SuperAdminTabs" component={SuperAdminTabs} />
      ) : user.role === 'admin' ? (
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
      ) : user.role === 'student' ? (
        <Stack.Screen name="StudentTabs" component={StudentTabs} />
      ) : user.role === 'parent' ? (
        <Stack.Screen name="ParentStack" component={ParentStack} />
      ) : (
        <Stack.Screen name="TeacherTabs" component={TeacherTabs} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  parentSwitchContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  parentSwitchList: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 24,
  },
  parentSwitchEmpty: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 32,
  },
  parentSwitchEmptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  parentSwitchEmptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  parentSwitchEmptyTxt: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  parentSwitchCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginVertical: 6,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  parentSwitchCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FBFF',
  },
  parentSwitchAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  parentSwitchAvatarActive: {
    backgroundColor: '#DBEAFE',
  },
  parentSwitchAvatarText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 14,
  },
  parentSwitchBody: {
    flex: 1,
  },
  parentSwitchName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  parentSwitchSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  parentSwitchMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  notifIconWrap: {
    width: 34,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  notifIconWrapUnread: {
    backgroundColor: 'rgba(239,68,68,0.35)',
  },
  notifDot: {
    position: 'absolute',
    top: 2,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F87171',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
