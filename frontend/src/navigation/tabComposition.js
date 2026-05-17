import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StackActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useUnreadNotifications from '../hooks/useUnreadNotifications';
import SharedTabBar from '../components/SharedTabBar';
import ProfileScreen from '../screens/ProfileScreen';
import api from '../services/api';
import { subscribeChatUnreadRefresh } from '../lib/chatEvents';
import { C } from '../config/theme';

const Tab = createBottomTabNavigator();

export function useTabBarOptions() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  return {
    tabBarBackground: () => (
      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    ),
    tabBarStyle: {
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      height: 56 + bottomPad,
      paddingBottom: bottomPad,
      paddingTop: 6,
      elevation: 12,
      shadowColor: C.brandDeep,
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -3 },
    },
    tabBarActiveTintColor: C.white,
    tabBarInactiveTintColor: C.footerIdle,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  };
}

export function tabIcon(focused, name, nameOutline, size = 24) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Ionicons
        name={focused ? name : nameOutline}
        size={size}
        color={focused ? C.white : C.footerIdle}
      />
    </View>
  );
}

export function notificationBadgeValue(unread) {
  if (!unread || unread <= 0) return undefined;
  return unread > 99 ? '99+' : String(unread);
}

export function notificationTabIcon({ focused, unread }) {
  const hasUnread = unread > 0;
  return (
    <View style={[styles.notifIconWrap, hasUnread && styles.notifIconWrapUnread, focused && styles.tabIconWrapActive]}>
      <Ionicons
        name={focused ? 'notifications' : 'notifications-outline'}
        size={24}
        color={focused || hasUnread ? C.white : C.footerIdle}
      />
      {hasUnread && <View style={styles.notifDot} />}
    </View>
  );
}

export function createHomeTabListeners() {
  return ({ navigation, route }) => ({
    tabPress: () => {
      const nestedState = route.state;
      if (nestedState?.type === 'stack' && nestedState.key) {
        navigation.dispatch({
          ...StackActions.popToTop(),
          target: nestedState.key,
        });
      }
    },
  });
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
  const [chatUnread, setChatUnread] = useState(0);

  const fetchChatUnread = useCallback(() => {
    if (!chatComponent) {
      setChatUnread(0);
      return;
    }
    api.get('/chat/conversations')
      .then(({ data }) => {
        const total = (data || []).reduce((sum, conv) => sum + (Number(conv?.unread_count) || 0), 0);
        setChatUnread(total);
      })
      .catch(() => setChatUnread(0));
  }, [chatComponent]);

  useEffect(() => {
    if (!chatComponent) return;
    fetchChatUnread();
    const timer = setInterval(fetchChatUnread, 7000);
    const unsubscribe = subscribeChatUnreadRefresh(fetchChatUnread);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [chatComponent, fetchChatUnread]);

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
    <Tab.Navigator tabBar={(props) => <SharedTabBar {...props} />} screenOptions={{ ...tabBarOptions, headerShown: false }} initialRouteName="HomeTab">
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline') }}
      />
      <Tab.Screen
        name="HomeTab"
        component={homeComponent}
        listeners={createHomeTabListeners()}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => tabIcon(focused, 'home', 'home-outline', 26) }}
      />
      {chatComponent && (
        <Tab.Screen
          name="ChatTab"
          component={chatComponent}
          listeners={{ tabPress: fetchChatUnread }}
          options={{
            title: 'Messages',
            popToTopOnBlur: true,
            tabBarBadge: notificationBadgeValue(chatUnread),
            tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, lineHeight: 18 },
            tabBarIcon: ({ focused }) => tabIcon(focused, 'chatbubbles', 'chatbubbles-outline'),
          }}
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
    width: 38,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconWrapUnread: {
    backgroundColor: 'transparent',
  },
  tabIconWrap: {
    width: 38,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
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
