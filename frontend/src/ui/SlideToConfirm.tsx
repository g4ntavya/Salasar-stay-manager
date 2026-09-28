import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { AppText } from './Text';
import { haptic } from './Pressable';
import { motion } from './motion';

export interface SlideToConfirmProps {
  label: string;
  /** Runs when the knob reaches the end. Return false (or throw) to slide back. */
  onConfirm: () => Promise<boolean | void> | boolean | void;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const H = 60;
const PAD = 5;
const KNOB = H - PAD * 2;

/**
 * A deliberate "slide to …" control for actions that should not happen by a stray tap.
 * Screen readers get a plain button (sliding is not practical there).
 */
export const SlideToConfirm: React.FC<SlideToConfirmProps> = ({ label, onConfirm, color = colors.brand, disabled, style }) => {
  const x = useSharedValue(0);
  const max = useSharedValue(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!busy && !done) x.set(withSpring(0, motion.spring));
  }, [busy, done, x]);

  const confirm = useCallback(async () => {
    haptic.success();
    setBusy(true);
    let ok: boolean | void = false;
    try {
      ok = await onConfirm();
    } catch {
      ok = false;
    }
    setBusy(false);
    if (ok === false) {
      haptic.warning();
      x.set(withSpring(0, motion.spring));
    } else setDone(true);
  }, [onConfirm, x]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !busy && !done)
    .activeOffsetX([-6, 6])
    .onUpdate(e => {
      x.set(Math.min(Math.max(0, e.translationX), max.get()));
    })
    .onEnd(e => {
      if (max.get() > 0 && (x.get() > max.get() * 0.82 || (e.velocityX > 900 && x.get() > max.get() * 0.5))) {
        x.set(withTiming(max.get(), { duration: motion.fast, easing: motion.ease }));
        scheduleOnRN(confirm);
      } else {
        x.set(withSpring(0, { ...motion.spring, velocity: e.velocityX }));
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const fillStyle = useAnimatedStyle(() => ({
    width: x.get() + KNOB + PAD,
    backgroundColor: interpolateColor(x.get(), [0, Math.max(1, max.get())], [colors.brandSoft, color]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, Math.max(1, max.get()) * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(x.get(), [0, Math.max(1, max.get())], [0, 24], Extrapolation.CLAMP) }],
  }));

  return (
    <View
      style={[styles.track, disabled && { opacity: 0.5 }, style]}
      onLayout={e => max.set(Math.max(0, e.nativeEvent.layout.width - KNOB - PAD * 2))}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy }}
      onAccessibilityTap={() => !disabled && !busy && !done && confirm()}
    >
      <Animated.View style={[styles.fill, fillStyle]} />
      <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
        <AppText variant="bodyStrong" color={color}>
          {label}
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={color} style={{ opacity: 0.55 }} />
        <Ionicons name="chevron-forward" size={16} color={color} style={{ opacity: 0.3, marginLeft: -10 }} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.knob, { backgroundColor: color }, knobStyle]}>
          {busy ? (
            <ActivityIndicator color={colors.inkInverse} />
          ) : (
            <Ionicons name={done ? 'checkmark' : 'arrow-forward'} size={24} color={colors.inkInverse} />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  track: { height: H, borderRadius: radius.pill, backgroundColor: colors.brandSoft, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  labelWrap: { position: 'absolute', left: KNOB + PAD * 2, right: PAD * 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  knob: { position: 'absolute', left: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
});
