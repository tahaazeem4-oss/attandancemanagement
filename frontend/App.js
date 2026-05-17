import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

// Navigation ref — lets us navigate from outside of React tree (e.g. notification tap).
export const navigationRef = React.createRef();

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

// ── Navigate on notification tap ─────────────────────────────
// Maps the `type` field embedded in the push payload to the correct screen.
// The screen names match the navigators in routeConfig / AppNavigator.
function navigateForNotification(data, role) {
  const nav = navigationRef.current;
  if (!nav) return;

  const type = data?.type;

  try {
    if (type === 'lecture') {
      // All roles have a lectures list accessible from their home stack
      if (role === 'student') {
        nav.navigate('StudentLectureList');
      } else {
        nav.navigate('LectureList');
      }
    } else if (type === 'attendance') {
      if (role === 'student') {
        nav.navigate('StudentAttendance');
      } else {
        nav.navigate('AttendanceReport');
      }
    } else if (
      type === 'leave_request' ||
      type === 'leave_decision' ||
      type === 'withdrawal_request' ||
      type === 'withdrawal_decision'
    ) {
      if (role === 'student') {
        nav.navigate('StudentLeaves');
      } else if (role === 'teacher') {
        nav.navigate('ClassLeaves');
      } else {
        nav.navigate('LeaveManagement');
      }
    } else {
      // Fallback: open the notification inbox for the current role
      if (role === 'student') {
        nav.navigate('StudentNotifications');
      } else {
        nav.navigate('StaffNotifications');
      }
    }
  } catch {
    // Navigation target may not exist for this role — ignore silently
  }
}

function Root() {
  const { loading, user } = useAuth();
  const notificationListener = useRef(null);
  const responseListener     = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Ensure the Android channel is created at startup
    ensureAndroidChannel();

    // Fired when a notification arrives while the app is in the foreground.
    // The handler above already shows the banner; this listener is a hook for
    // any extra in-app logic (e.g. refreshing a badge count).
    notificationListener.current = Notifications.addNotificationReceivedListener(_notification => {
      // In-app notification received — future: increment local unread badge
    });

    // Fired when the user taps the notification banner or the notification
    // centre entry. Navigate to the relevant screen.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response?.notification?.request?.content?.data;
      const role = user?.role;
      navigateForNotification(data, role);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }
  return (
    <NavigationContainer ref={navigationRef}>
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
