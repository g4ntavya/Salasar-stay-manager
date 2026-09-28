import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius as radii } from '../theme';
import { AppText } from './Text';
import { haptic } from './Pressable';
import { motion } from './motion';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SwipeAction {
  label: string;
  icon: IconName;
  color: string;
}

export interface SwipeRowProps {
  children: React.ReactNode;
  /**
   * Main action, revealed on the far right. It only runs when its button is tapped.
   * Return (or resolve) `false` when it did not go through, so the row slides back.
   */
  primary: SwipeAction & { onAction: () => boolean | void | Promise<boolean | void> };
  /** Optional second action shown to the left of the primary one. */
  secondary?: SwipeAction & { onAction: () => void };
  enabled?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const ACTION_W = 78;
const GAP = 8;

// Only one row is open at a time, like the system lists.
let closeOpenRow: (() => void) | null = null;

/**
 * Swipe left to reveal the actions. The row stays open until an action is tapped,
 * the row is tapped, or it is swiped back; a swipe alone never runs anything.
 * Runs entirely on the UI thread, so it tracks the finger without lag.
 */
export const SwipeRow: React.FC<SwipeRowProps> = ({ children, primary, secondary, enabled = true, radius = radii.lg, style }) => {
  const tx = useSharedValue(0);
  const start = useSharedValue(0);
  const [open, setOpen] = useState(false);
  const openWidth = secondary ? ACTION_W * 2 + GAP * 2 : ACTION_W + GAP;

  const close = useCallback(() => {
    tx.set(withSpring(0, motion.spring));
  }, [tx]);

  const claim = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
  }, [close]);

  const runPrimary = useCallback(async () => {
    let ok: boolean | void = false;
    try {
      ok = await primary.onAction();
    } catch {
      ok = false;
    }
    if (ok === false) close();
    // It went through: the row usually disappears or changes; bring it back in case it stays.
    else setTimeout(close, 500);
  }, [primary, close]);

  useAnimatedReaction(
    () => tx.get() < -4,
    (isOpen, was) => {
      if (isOpen !== was) scheduleOnRN(setOpen, isOpen);
    }
  );

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onStart(() => {
      start.set(tx.get());
      scheduleOnRN(claim);
    })
    .onUpdate(e => {
      const next = start.get() + e.translationX;
      // Past either end the row resists, like pulling on an elastic band.
      if (next > 0) tx.set(next / 6);
      else if (next < -openWidth) tx.set(-openWidth + (next + openWidth) / 4);
      else tx.set(next);
    })
    .onEnd(e => {
      const reveal = -tx.get();
      const opening = e.velocityX < -400 || (e.velocityX < 400 && reveal > openWidth * 0.4);
      if (opening) {
        if (start.get() === 0) scheduleOnRN(haptic.tap);
        tx.set(withSpring(-openWidth, { ...motion.spring, velocity: e.velocityX }));
      } else {
        tx.set(withSpring(0, { ...motion.spring, velocity: e.velocityX }));
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }));
  const trayStyle = useAnimatedStyle(() => ({ width: Math.max(0, -tx.get()) }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-tx.get(), [ACTION_W * 0.3, ACTION_W * 0.8], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(-tx.get(), [ACTION_W * 0.3, ACTION_W], [0.7, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <View
      style={style}
      accessibilityActions={[{ name: 'primary', label: primary.label }, ...(secondary ? [{ name: 'secondary', label: secondary.label }] : [])]}
      onAccessibilityAction={e => (e.nativeEvent.actionName === 'primary' ? runPrimary() : secondary?.onAction())}
    >
      <Animated.View style={[styles.tray, { paddingLeft: GAP }, trayStyle]} pointerEvents={open ? 'box-none' : 'none'}>
        {secondary ? (
          <View style={styles.secondary}>
            <Pressable
              onPress={() => {
                haptic.press();
                close();
                secondary.onAction();
              }}
              style={[styles.action, { backgroundColor: secondary.color, borderRadius: radius }]}
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
            >
              <Animated.View style={[styles.actionInner, contentStyle]}>
                <Ionicons name={secondary.icon} size={21} color={colors.inkInverse} />
                <AppText variant="caption" tone="inverse" numberOfLines={1}>
                  {secondary.label}
                </AppText>
              </Animated.View>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            haptic.press();
            runPrimary();
          }}
          style={[styles.action, styles.primary, { backgroundColor: primary.color, borderRadius: radius }]}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
        >
          <Animated.View style={[styles.actionInner, contentStyle]}>
            <Ionicons name={primary.icon} size={21} color={colors.inkInverse} />
            <AppText variant="caption" tone="inverse" numberOfLines={1}>
              {primary.label}
            </AppText>
          </Animated.View>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          {children}
          {/* While open, a tap anywhere on the row just closes it. */}
          {open ? <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close actions" /> : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  tray: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row', overflow: 'hidden' },
  secondary: { marginRight: GAP },
  action: { width: ACTION_W, height: '100%', alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, minWidth: ACTION_W },
  actionInner: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
});
