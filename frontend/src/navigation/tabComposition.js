import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useUnreadNotifications from '../hooks/useUnreadNotifications';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export function useTabBarOptions() {
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
    tabBarActiveTintColor: '#ffffff',
    tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  };
}

export function tabIcon(focused, name, nameOutline, size = 24) {
  return (
    <Ionicons
      name={focused ? name : nameOutline}
      size={size}
      color={focused ? '#fff' : 'rgba(255,255,255,0.45)'}
    />
  );
}

export function notificationBadgeValue(unread) {
  if (!unread || unread <= 0) return undefined;
  return unread > 99 ? '99+' : String(unread);
}

export function notificationTabIcon({ focused, unread }) {
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

export function renderTabScreens(screens) {
  return screens.map((screen) => (
    <Tab.Screen
      key={screen.name}
      name={screen.name}
      component={screen.component}
      listeners={screen.listeners}
      options={screen.options}
    >
      {screen.children}
    </Tab.Screen>
  ));
}

export function RoleTabs({ homeComponent, notificationComponent, unreadCountPath, chatComponent }) {
  const tabBarOptions = useTabBarOptions();
  const { count: notifUnread, fetchUnread } = useUnreadNotifications(unreadCountPath);

  const notificationOptions = unreadCountPath
    ? {
        title: 'Notifications',
        tabBarBadge: notificationBadgeValue(notifUnread),
        tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
        tabBarIcon: ({ focused }) => notificationTabIcon({ focused, unread: notifUnread }),
      }
    : {
        title: 'Notifications',
        tabBarIcon: ({ focused }) => tabIcon(focused, 'notifications', 'notifications-outline'),
      };

  return (
    <Tab.Navigator screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        component={homeComponent}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      {chatComponent && (
        <Tab.Screen
          name="ChatTab"
          component={chatComponent}
          options={{ title: 'Messages', tabBarIcon: ({ focused }) => tabIcon(focused, 'chatbubbles', 'chatbubbles-outline') }}
        />
      )}
      <Tab.Screen
        name="NotifTab"
        component={notificationComponent}
        listeners={unreadCountPath ? { tabPress: fetchUnread } : undefined}
        options={notificationOptions}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
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
