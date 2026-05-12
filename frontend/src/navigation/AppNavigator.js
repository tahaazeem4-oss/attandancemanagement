import React, { useState, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  teacherHomeScreens,
  adminHomeScreens,
  orgAdminHomeScreens,
  superAdminHomeScreens,
  studentHomeScreens,
  buildParentChildScreens,
  getParentStackScreens,
} from './routeConfig';
import {
  RoleTabs,
  useTabBarOptions,
  tabIcon,
  notificationBadgeValue,
  notificationTabIcon,
  renderTabScreens,
} from './tabComposition';

// Auth screens
import LoginScreen           from '../screens/LoginScreen';
import ForgotPasswordScreen  from '../screens/ForgotPasswordScreen';

// Shared screens
import StaffNotificationsScreen    from '../screens/StaffNotificationsScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';

// Parent screens
import ParentLoginScreen       from '../screens/parent/ParentLoginScreen';
import ParentDashboardScreen   from '../screens/parent/ParentDashboardScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();
const HIDDEN_HEADER = { headerShown: false };

// â”€â”€ Shared style applied to all headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const headerStyle = {
  headerStyle:      { backgroundColor: '#2563EB' },
  headerTintColor:  '#fff',
  headerTitleStyle: { fontWeight: '700' },
};

function renderStackScreens(screens) {
  return screens.map((screen) => (
    <Stack.Screen
      key={screen.name}
      name={screen.name}
      component={screen.component}
      initialParams={screen.initialParams}
      options={screen.options || HIDDEN_HEADER}
    />
  ));
}

function createConfiguredStack(screens) {
  return function ConfiguredStack() {
    return (
      <Stack.Navigator screenOptions={headerStyle}>
        {renderStackScreens(screens)}
      </Stack.Navigator>
    );
  };
}

const TeacherHomeStack = createConfiguredStack(teacherHomeScreens);

function TeacherTabs() {
  return (
    <RoleTabs
      homeComponent={TeacherHomeStack}
      notificationComponent={StaffNotificationsScreen}
      unreadCountPath="/notifications/inbox/unread-count"
    />
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADMIN TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const AdminHomeStack = createConfiguredStack(adminHomeScreens);

function AdminTabs() {
  return (
    <RoleTabs
      homeComponent={AdminHomeStack}
      notificationComponent={StaffNotificationsScreen}
      unreadCountPath="/notifications/inbox/unread-count"
    />
  );
}

// =============================================================
// ORG ADMIN TABS
// =============================================================
const OrgAdminHomeStack = createConfiguredStack(orgAdminHomeScreens);

function OrgAdminTabs() {
  return (
    <RoleTabs
      homeComponent={OrgAdminHomeStack}
      notificationComponent={StaffNotificationsScreen}
    />
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SUPER ADMIN TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const SuperAdminHomeStack = createConfiguredStack(superAdminHomeScreens);

function SuperAdminTabs() {
  return (
    <RoleTabs
      homeComponent={SuperAdminHomeStack}
      notificationComponent={StaffNotificationsScreen}
    />
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STUDENT TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const StudentHomeStack = createConfiguredStack(studentHomeScreens);

function StudentTabs() {
  return (
    <RoleTabs
      homeComponent={StudentHomeStack}
      notificationComponent={StudentNotificationsScreen}
      unreadCountPath="/notifications/me/unread-count"
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// PARENT STACKS
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
function ParentChildHomeStack({ route, child }) {
  const activeChild = child || route?.params?.child || null;
  return (
    <Stack.Navigator key={activeChild?.student_id ? `child-${activeChild.student_id}` : 'child-none'} screenOptions={headerStyle}>
      {renderStackScreens(buildParentChildScreens(activeChild))}
    </Stack.Navigator>
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

  const parentPortalTabScreens = [
    {
      name: 'ParentHomeTab',
      component: ParentDashboardScreen,
      listeners: {
        tabPress: (e) => {
          e.preventDefault();
          navigation.navigate('ParentDashboard');
        },
      },
      options: { title: 'Parent Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'grid', 'grid-outline') },
    },
    {
      name: 'HomeTab',
      children: (props) => <ParentChildHomeStack {...props} child={currentChild} />,
      options: { title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) },
    },
    {
      name: 'NotifTab',
      children: (props) => <StudentNotificationsScreen {...props} route={{ ...props.route, params: { ...(props.route?.params || {}), child: currentChild } }} />,
      listeners: { tabPress: fetchUnread },
      options: {
        title: 'Notifications',
        tabBarBadge: notificationBadgeValue(notifUnread),
        tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
        tabBarIcon: ({ focused }) => notificationTabIcon({ focused, unread: notifUnread }),
      },
    },
  ];

  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      {renderTabScreens(parentPortalTabScreens)}
    </Tab.Navigator>
  );
}

const parentStackScreens = getParentStackScreens(ParentStudentPortalTabs, ParentDashboardScreen);

const ParentStack = createConfiguredStack(parentStackScreens);

const ROLE_ROOT_SCREENS = {
  super_admin: { name: 'SuperAdminTabs', component: SuperAdminTabs },
  org_admin: { name: 'OrgAdminTabs', component: OrgAdminTabs },
  admin: { name: 'AdminTabs', component: AdminTabs },
  parent: { name: 'ParentStack', component: ParentStack },
  teacher: { name: 'TeacherTabs', component: TeacherTabs },
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROOT NAVIGATOR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function AppNavigator() {
  const { user } = useAuth();
  const roleEntry = user ? (ROLE_ROOT_SCREENS[user.role] || ROLE_ROOT_SCREENS.teacher) : null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login"         component={LoginScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ParentLogin"    component={ParentLoginScreen} />
        </>
      ) : (
        <Stack.Screen name={roleEntry.name} component={roleEntry.component} />
      )}
    </Stack.Navigator>
  );
}
