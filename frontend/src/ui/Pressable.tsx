import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export const haptic = {
  tap: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
  press: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** How far the element shrinks while pressed (default 0.97). */
  scaleTo?: number;
  hapticOnPress?: boolean;
  children?: React.ReactNode;
}

/** Pressable that gently shrinks under the finger, the tactile feel used across the app. */
export const PressableScale: React.FC<PressableScaleProps> = ({
  style,
  scaleTo = 0.97,
  hapticOnPress = false,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  children,
  ...rest
}) => {
  // Quick to press in, springy on release: the feel of a physical button.
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // Size/placement belongs on the touch target (so % widths and flex work against the parent);
  // looks and the scale animation belong on the inner view.
  const { outer, inner } = useMemo(() => splitStyle(style), [style]);

  return (
    <Pressable
      {...rest}
      style={outer}
      disabled={disabled}
      onPressIn={e => {
        scale.set(withTiming(scaleTo, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={e => {
        scale.set(withSpring(1, { damping: 15, stiffness: 320, mass: 0.6 }));
        onPressOut?.(e);
      }}
      onPress={e => {
        if (hapticOnPress) haptic.press();
        onPress?.(e);
      }}
    >
      <Animated.View style={[inner, Platform.OS === 'android' && styles.noElevation, scaleStyle, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const OUTER_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'marginStart', 'marginEnd', 'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);

const splitStyle = (style: StyleProp<ViewStyle>) => {
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) (OUTER_KEYS.has(key) ? outer : inner)[key] = value;
  // Let the inner view fill a stretched/flexed touch target.
  if (outer.flex != null || outer.flexGrow != null || outer.width != null || outer.height != null || outer.minHeight != null) inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
};

// Android draws elevation shadows incorrectly on views that scale, leaving a grey box behind
// rounded corners. Pressable elements rely on borders and tint instead of elevation there.
const styles = StyleSheet.create({ noElevation: { elevation: 0 } });
