import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../config/theme';

function resolveLabel(options, routeName) {
  if (typeof options.tabBarLabel === 'string' && options.tabBarLabel.trim()) {
    return options.tabBarLabel;
  }
  if (typeof options.title === 'string' && options.title.trim()) {
    return options.title;
  }
  return routeName;
}

export default function SharedTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View style={[styles.shell, { paddingBottom: bottomPad }]}> 
      <LinearGradient
        colors={C.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bar}
      >
        <View style={styles.glowLeft} pointerEvents="none" />
        <View style={styles.glowRight} pointerEvents="none" />
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            const options = descriptor.options || {};
            const focused = state.index === index;
            const label = resolveLabel(options, route.name);
            const badgeValue = options.tabBarBadge;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            const icon = typeof options.tabBarIcon === 'function'
              ? options.tabBarIcon({
                  focused,
                  color: focused ? C.white : C.footerIdle,
                  size: 24,
                })
              : null;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              >
                <View style={styles.itemInner}>
                  <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                    {icon}
                    {badgeValue ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badgeValue}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  bar: {
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: 'hidden',
    shadowColor: C.brandDeep,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 18,
  },
  glowLeft: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    left: -22,
    bottom: -34,
    backgroundColor: 'rgba(125,211,252,0.12)',
  },
  glowRight: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    right: -28,
    top: -48,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 6,
  },
  item: {
    flex: 1,
    borderRadius: 20,
  },
  itemPressed: {
    opacity: 0.86,
  },
  itemInner: {
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  iconWrap: {
    position: 'relative',
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  label: {
    marginTop: 4,
    color: C.footerIdle,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    opacity: 0.88,
  },
  labelActive: {
    color: C.white,
    opacity: 1,
    textShadowColor: 'rgba(255,255,255,0.35)',
    textShadowRadius: 8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -14,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: C.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
