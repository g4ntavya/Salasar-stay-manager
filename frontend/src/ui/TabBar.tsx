import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors, radius, shadows, space } from '../theme';
import { AppText } from './Text';
import { PressableScale, haptic } from './Pressable';
import { motion } from './motion';

type IconName = keyof typeof Ionicons.glyphMap;

export interface TabSpec {
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

export interface AppTabBarProps extends BottomTabBarProps {
  tabs: TabSpec[];
  /** Raised centre action (e.g. New booking), inserted after this many tabs. */
  centerAction?: { icon: IconName; label: string; onPress: () => void; after: number };
}

const BAR_HEIGHT = 68;

/** Bottom gap below the bar: the system navigation area (gesture pill or 3-button bar), or a small margin. */
const barGap = (bottomInset: number) => Math.max(bottomInset, space.md);

/**
 * Space a tab screen should leave at the end of its content so nothing hides behind the
 * floating bar, on phones with gesture navigation and with the 3-button bar alike.
 */
export const useTabBarSpace = () => {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + barGap(insets.bottom) + space.xxl;
};

/**
 * The pill behind the selected tab's icon. It is always mounted with its colour and rounded
 * corners and only fades in and out: on Android, a background added to a view after it first
 * renders is drawn without its corner radius, which made the pill turn square after a tap.
 */
const ActivePill: React.FC<{ active: boolean }> = ({ active }) => {
  const shown = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    shown.set(withTiming(active ? 1 : 0, { duration: motion.base, easing: motion.ease }));
  }, [active, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scaleX: 0.6 + shown.get() * 0.4 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.pill, style]} />;
};

/** Floating tab bar with an optional raised centre action. */
export const AppTabBar: React.FC<AppTabBarProps> = ({ state, navigation, tabs, centerAction }) => {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  const items = tabs.map(tab => {
    const route = state.routes.find(r => r.name === tab.name);
    if (!route) return null;
    const focused = activeName === tab.name;
    return (
      <PressableScale
        key={tab.name}
        scaleTo={0.9}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptic.tap();
            navigation.navigate(route.name);
          }
        }}
        style={styles.item}
      >
        <View style={styles.iconWrap}>
          <ActivePill active={focused} />
          <Ionicons name={focused ? tab.iconActive : tab.icon} size={21} color={focused ? colors.brand : colors.inkMuted} />
        </View>
        <AppText variant="caption" color={focused ? colors.brand : colors.inkMuted} style={styles.label} numberOfLines={1}>
          {tab.label}
        </AppText>
      </PressableScale>
    );
  });

  if (centerAction) {
    items.splice(
      centerAction.after,
      0,
      <View key="__center" style={styles.item}>
        <PressableScale
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel={centerAction.label}
          onPress={() => {
            haptic.press();
            centerAction.onPress();
          }}
          style={styles.center}
        >
          <Ionicons name={centerAction.icon} size={28} color={colors.inkInverse} />
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingBottom: barGap(insets.bottom) }]} pointerEvents="box-none">
      {/* Content fades out behind the floating bar instead of being cut by its edge. */}
      <LinearGradient
        colors={['rgba(246,242,236,0)', colors.bg]}
        locations={[0, 0.55]}
        style={[styles.fade, { height: BAR_HEIGHT + barGap(insets.bottom) + space.huge }]}
        pointerEvents="none"
      />
      <View style={styles.bar}>{items}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: space.sm,
    height: BAR_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.raised,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pill: { ...StyleSheet.absoluteFill, borderRadius: 15, backgroundColor: colors.brandSoft },
  label: { fontSize: 11 },
  center: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.bg,
    ...shadows.raised,
  },
});
