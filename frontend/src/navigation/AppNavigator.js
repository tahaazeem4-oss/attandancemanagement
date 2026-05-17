import React, { useState, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AppHeader from '../components/AppHeader';
import SharedTabBar from '../components/SharedTabBar';
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
  createHomeTabListeners,
  notificationBadgeValue,
  notificationTabIcon,
  renderTabScreens,
} from './tabComposition';
import { subscribeChatUnreadRefresh } from '../lib/chatEvents';

// Auth screens
import LoginScreen           from '../screens/LoginScreen';
import ForgotPasswordScreen  from '../screens/ForgotPasswordScreen';

// Shared screens
import StaffNotificationsScreen    from '../screens/StaffNotificationsScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import StaffNewChatScreen from '../screens/chat/StaffNewChatScreen';
import StudentNotificationsScreen from '../screens/student/StudentNotificationsScreen';

// Parent screens
import ParentLoginScreen       from '../screens/parent/ParentLoginScreen';
import ParentDashboardScreen   from '../screens/parent/ParentDashboardScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();
const HIDDEN_HEADER = { headerShown: false };

function prettyRouteTitle(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\bAi\b/g, 'AI')
    .trim();
}

const sharedStackOptions = {
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#F8FAFC' },
  header: ({ navigation, route, options, back }) => (
    <AppHeader
      title={options?.title || prettyRouteTitle(route?.name)}
      subtitle={options?.headerSubtitle}
      navigation={navigation}
      showBack={!!back}
    />
  ),
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

function createConfiguredStack(screens, extraScreenOptions = {}) {
  return function ConfiguredStack() {
    return (
      <Stack.Navigator screenOptions={{ ...sharedStackOptions, ...extraScreenOptions }}>
        {renderStackScreens(screens)}
      </Stack.Navigator>
    );
  };
}

const TeacherHomeStack = createConfiguredStack(teacherHomeScreens);

// Chat stack is the same screens — ChatList is the root, Chat is pushed on nav
function TeacherChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="StaffNewChat" component={StaffNewChatScreen} />
    </Stack.Navigator>
  );
}

function TeacherTabs() {
  return (
    <RoleTabs
      homeComponent={TeacherHomeStack}
      notificationComponent={StaffNotificationsScreen}
      unreadCountPath="/notifications/inbox/unread-count"
      chatComponent={TeacherChatStack}
    />
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADMIN TABS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const AdminHomeStack = createConfiguredStack(adminHomeScreens);

function AdminChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="StaffNewChat" component={StaffNewChatScreen} />
    </Stack.Navigator>
  );
}

function AdminTabs() {
  return (
    <RoleTabs
      homeComponent={AdminHomeStack}
      notificationComponent={StaffNotificationsScreen}
      unreadCountPath="/notifications/inbox/unread-count"
      chatComponent={AdminChatStack}
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
const StudentHomeStack = createConfiguredStack(studentHomeScreens, { headerEyebrow: 'Student Portal' });

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
function ParentChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="NewChat" component={NewChatScreen} />
    </Stack.Navigator>
  );
}

function ParentChildHomeStack({ route, child }) {
  const activeChild = child || route?.params?.child || null;
  return (
    <Stack.Navigator
      key={activeChild?.student_id ? `child-${activeChild.student_id}` : 'child-none'}
      screenOptions={{ ...sharedStackOptions, headerEyebrow: 'Student Portal' }}
    >
      {renderStackScreens(buildParentChildScreens(activeChild))}
    </Stack.Navigator>
  );
}

function ParentStudentPortalTabs({ route, navigation }) {
  const initialChild = route?.params?.child || null;
  const [currentChild, setCurrentChild] = useState(initialChild);
  const tabBarOptions = useTabBarOptions();
  const [notifUnread, setNotifUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

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

  const fetchChatUnread = useCallback(() => {
    api.get('/chat/conversations')
      .then(({ data }) => {
        const total = (data || []).reduce((sum, conv) => sum + (Number(conv?.unread_count) || 0), 0);
        setChatUnread(total);
      })
      .catch(() => setChatUnread(0));
  }, []);

  useEffect(() => {
    fetchChatUnread();
    const timer = setInterval(fetchChatUnread, 7000);
    const unsubscribe = subscribeChatUnreadRefresh(fetchChatUnread);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [fetchChatUnread]);

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
      children: (props) => (
        <ParentChildHomeStack
          key={currentChild?.student_id ? `child-home-${currentChild.student_id}` : 'child-home-none'}
          {...props}
          child={currentChild}
        />
      ),
      listeners: createHomeTabListeners(),
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
    {
      name: 'ChatTab',
      component: ParentChatStack,
      listeners: { tabPress: fetchChatUnread },
      options: {
        title: 'Messages',
        popToTopOnBlur: true,
        tabBarBadge: notificationBadgeValue(chatUnread),
        tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
        tabBarIcon: ({ focused }) => tabIcon(focused, 'chatbubbles', 'chatbubbles-outline'),
      },
    },
  ];

  return (
    <Tab.Navigator tabBar={(props) => <SharedTabBar {...props} />} screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
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
