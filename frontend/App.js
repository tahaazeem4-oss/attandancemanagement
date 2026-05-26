import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import api from './src/services/api';

// Navigation ref — lets us navigate from outside of React tree (e.g. notification tap).
export const navigationRef = React.createRef();

// Pending navigation action queued before the navigator was ready (cold-start tap).
let _pendingNotifNavigation = null;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIdList(value) {
  if (Array.isArray(value)) {
    return value.map(toNumber).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => toNumber(part.trim()))
      .filter(Boolean);
  }

  return [];
}

function normalizeNotificationData(rawData, meta = {}) {
  const source = rawData && typeof rawData === 'object' ? rawData : {};

  return {
    ...source,
    title: String(source.title || meta.title || '').trim(),
    body: String(source.body || meta.body || '').trim(),
    type: String(source.type || '').trim().toLowerCase(),
    category: String(source.category || '').trim().toLowerCase(),
    lecture_type: String(source.lecture_type || '').trim().toLowerCase(),
    target_type: String(source.target_type || '').trim().toLowerCase(),
    conversation_id: toNumber(source.conversation_id),
    lecture_id: toNumber(source.lecture_id),
    notification_id: toNumber(source.notification_id),
    class_id: toNumber(source.class_id),
    section_id: toNumber(source.section_id),
    student_id: toNumber(source.student_id),
    student_ids: toIdList(source.student_ids),
  };
}

function inferDestination(data) {
  if (data.type === 'chat') return 'chat';
  if (data.type === 'attendance') return 'attendance';
  if (data.type === 'lecture') {
    return data.lecture_type === 'homework' ? 'homework' : 'classwork';
  }

  if (data.type === 'leave_request' || data.type === 'leave_decision' || data.type === 'withdrawal_request' || data.type === 'withdrawal_decision') {
    return 'leaves';
  }

  const haystack = `${data.category} ${data.title} ${data.body}`.toLowerCase();
  if (haystack.includes('attendance')) return 'attendance';
  if (haystack.includes('homework')) return 'homework';
  if (haystack.includes('classwork') || haystack.includes('class work')) return 'classwork';

  return 'notifications';
}

function getRoleRoot(role) {
  if (role === 'student') return 'StudentTabs';
  if (role === 'teacher') return 'TeacherTabs';
  if (role === 'admin') return 'AdminTabs';
  if (role === 'org_admin') return 'OrgAdminTabs';
  if (role === 'super_admin') return 'SuperAdminTabs';
  if (role === 'parent') return 'ParentStack';
  return null;
}

function navigateStaffHome(role, screen, params) {
  const nav = navigationRef.current;
  const root = getRoleRoot(role);
  if (!nav || !root) return false;

  nav.navigate(root, {
    screen: 'HomeTab',
    params: {
      screen,
      params,
    },
  });
  return true;
}

function navigateStaffNotifications(role) {
  const nav = navigationRef.current;
  const root = getRoleRoot(role);
  if (!nav || !root) return false;

  nav.navigate(root, { screen: 'NotifTab' });
  return true;
}

function navigateStudent(screen, params) {
  const nav = navigationRef.current;
  if (!nav) return false;

  nav.navigate('StudentTabs', {
    screen: screen === 'StudentNotifications' ? 'NotifTab' : 'HomeTab',
    params: screen === 'StudentNotifications'
      ? params
      : {
          screen,
          params,
        },
  });
  return true;
}

async function resolveParentChild(data) {
  const { data: dashboard } = await api.get('/parent/dashboard');
  const children = Array.isArray(dashboard?.children) ? dashboard.children : [];

  if (!children.length) return null;

  if (data.student_id) {
    const exact = children.find((child) => Number(child?.student_id) === data.student_id);
    if (exact) return exact;
  }

  if (data.student_ids.length) {
    const allowed = new Set(data.student_ids);
    const match = children.find((child) => allowed.has(Number(child?.student_id)));
    if (match) return match;
  }

  if (data.class_id && data.section_id) {
    const sectionMatch = children.find(
      (child) => Number(child?.class_id) === data.class_id && Number(child?.section_id) === data.section_id,
    );
    if (sectionMatch) return sectionMatch;
  }

  if (data.class_id) {
    const classMatch = children.find((child) => Number(child?.class_id) === data.class_id);
    if (classMatch) return classMatch;
  }

  return children.length === 1 ? children[0] : null;
}

function navigateParentPortal(child, screen, params = {}) {
  const nav = navigationRef.current;
  if (!nav || !child) return false;

  const selectionToken = Date.now();

  if (screen === 'StudentNotifications') {
    nav.navigate('ParentStack', {
      screen: 'ChildStudentPortal',
      params: {
        child,
        selectionToken,
        screen: 'NotifTab',
        params: {
          child,
          selectionToken,
          ...params,
        },
      },
    });
    return true;
  }

  nav.navigate('ParentStack', {
    screen: 'ChildStudentPortal',
    params: {
      child,
      selectionToken,
      screen: 'HomeTab',
      params: {
        screen,
        params: {
          child,
          selectionToken,
          ...params,
        },
      },
    },
  });
  return true;
}

async function openConversationFromNotification(role, data) {
  const nav = navigationRef.current;
  const conversationId = data.conversation_id;

  if (!nav || !conversationId) return false;

  const { data: conversations } = await api.get('/chat/conversations');
  const conversation = (Array.isArray(conversations) ? conversations : []).find(
    (item) => Number(item?.id) === conversationId,
  );

  if (!conversation) return false;

  if (role === 'parent') {
    nav.navigate('ParentStack', {
      screen: 'Chat',
      params: { conversation },
    });
    return true;
  }

  const root = getRoleRoot(role);
  if (!root) return false;

  nav.navigate(root, {
    screen: 'ChatTab',
    params: {
      screen: 'Chat',
      params: { conversation },
    },
  });
  return true;
}

async function navigateParentForNotification(destination, data) {
  const nav = navigationRef.current;
  if (!nav) return;

  if (destination === 'chat') {
    const opened = await openConversationFromNotification('parent', data);
    if (opened) return;
  }

  const child = await resolveParentChild(data).catch(() => null);

  if (destination === 'attendance' && child) {
    navigateParentPortal(child, 'StudentHistory');
    return;
  }

  if (destination === 'homework' && child) {
    navigateParentPortal(child, 'StudentHomework');
    return;
  }

  if (destination === 'classwork' && child) {
    navigateParentPortal(child, 'StudentClasswork');
    return;
  }

  if (destination === 'leaves' && child) {
    navigateParentPortal(child, 'StudentLeaves');
    return;
  }

  if (child) {
    navigateParentPortal(child, 'StudentNotifications');
    return;
  }

  nav.navigate('ParentStack', { screen: 'ParentDashboard' });
}

async function navigateForNotification(rawData, role, meta = {}) {
  const nav = navigationRef.current;

  if (!nav || !nav.isReady() || !role) {
    _pendingNotifNavigation = { rawData, meta };
    return;
  }

  const data = normalizeNotificationData(rawData, meta);
  const destination = inferDestination(data);

  try {
    if (role === 'parent') {
      await navigateParentForNotification(destination, data);
      return;
    }

    if (role === 'student') {
      if (destination === 'chat') {
        const opened = await openConversationFromNotification(role, data);
        if (opened) return;
      }
      if (destination === 'attendance') {
        navigateStudent('StudentHistory');
        return;
      }
      if (destination === 'homework') {
        navigateStudent('StudentHomework');
        return;
      }
      if (destination === 'classwork') {
        navigateStudent('StudentClasswork');
        return;
      }
      if (destination === 'leaves') {
        navigateStudent('StudentLeaves');
        return;
      }
      navigateStudent('StudentNotifications');
      return;
    }

    if (destination === 'chat') {
      const opened = await openConversationFromNotification(role, data);
      if (opened) return;
    }

    if (destination === 'homework' || destination === 'classwork') {
      if (navigateStaffHome(role, 'LectureList')) return;
    }

    if (destination === 'attendance') {
      if (navigateStaffHome(role, 'Report')) return;
    }

    if (destination === 'leaves') {
      const leaveScreen = role === 'teacher'
        ? 'TeacherLeaves'
        : role === 'admin'
          ? 'AdminLeaves'
          : role === 'org_admin'
            ? 'OrgAdminLeaves'
            : null;

      if (leaveScreen && navigateStaffHome(role, leaveScreen)) return;
    }

    navigateStaffNotifications(role);
  } catch {
    if (role === 'parent') {
      nav.navigate('ParentStack', { screen: 'ParentDashboard' });
      return;
    }

    if (role === 'student') {
      navigateStudent('StudentNotifications');
      return;
    }

    navigateStaffNotifications(role);
  }
}

async function flushPendingNotification(role) {
  if (!_pendingNotifNavigation || !navigationRef.current?.isReady() || !role) return;

  const pending = _pendingNotifNavigation;
  _pendingNotifNavigation = null;
  await navigateForNotification(pending.rawData, role, pending.meta);
}

// ── Notification display handler ──────────────────────────────
// Runs when a notification is received while the app is foregrounded.
// shouldShowAlert:true → banner appears like WhatsApp/Gmail.
// shouldSetBadge:true  → app icon badge count updates.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  });
}

// ── Android notification channel ─────────────────────────────
// Android 8+ (API 26+) silently drops all notifications unless a channel
// has been created first. This must happen at startup before any push
// notification can possibly arrive.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    showBadge: true,
    sound: 'default',
  });
}

function Root() {
  const { loading, user } = useAuth();
  const notificationListener = useRef(null);
  const responseListener     = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Ensure the Android channel is created at startup
    ensureAndroidChannel();

    // Check if the app was opened by tapping a notification while killed (cold start).
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        const content = response?.notification?.request?.content;
        void navigateForNotification(content?.data, user?.role, {
          title: content?.title,
          body: content?.body,
        });
      }
    });

    // Fired when a notification arrives while the app is in the foreground.
    // The handler above already shows the banner; this listener is a hook for
    // any extra in-app logic (e.g. refreshing a badge count).
    notificationListener.current = Notifications.addNotificationReceivedListener(_notification => {
      // In-app notification received — future: increment local unread badge
    });

    // Fired when the user taps the notification banner or the notification
    // centre entry. Navigate to the relevant screen.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const content = response?.notification?.request?.content;
      void navigateForNotification(content?.data, user?.role, {
        title: content?.title,
        body: content?.body,
      });
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user]);

  useEffect(() => {
    void flushPendingNotification(user?.role);
  }, [user?.role]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }
  return (
    <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          // If a notification tap arrived before the navigator was ready, handle it now.
          void flushPendingNotification(user?.role);
        }}
      >
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
