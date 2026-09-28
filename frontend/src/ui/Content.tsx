import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, GUTTER, radius, space } from '../theme';
import { AppText } from './Text';
import { Button } from './Button';
import { PressableScale } from './Pressable';
import { motion } from './motion';

/* ---------------- Empty state ---------------- */

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action, style }) => (
  <View style={[styles.empty, style]}>
    <View style={styles.emptyIcon}>
      <Ionicons name={icon} size={30} color={colors.gold} />
    </View>
    <AppText variant="title2" align="center">
      {title}
    </AppText>
    {message ? (
      <AppText variant="footnote" tone="soft" align="center" style={{ marginTop: space.sm, maxWidth: 280 }}>
        {message}
      </AppText>
    ) : null}
    {action ? <Button title={action.label} icon={action.icon} onPress={action.onPress} style={{ marginTop: space.xl }} /> : null}
  </View>
);

/* ---------------- Skeleton ---------------- */

export const Skeleton: React.FC<{ width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }> = ({
  width = '100%',
  height = 14,
  radius: r = 8,
  style,
}) => {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.surfaceSunken }, pulseStyle, style]} />;
};

/** Placeholder list of cards while data loads. */
export const SkeletonList: React.FC<{ count?: number; height?: number }> = ({ count = 4, height = 88 }) => (
  <View style={{ gap: space.md }}>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={[styles.skeletonCard, { height }]}>
        <Skeleton width={44} height={44} radius={22} />
        <View style={{ flex: 1, gap: space.sm }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    ))}
  </View>
);

/** Full-screen loading state with the brand mark. */
export const LoadingState: React.FC<{ message?: string }> = ({ message }) => (
  <View style={styles.loading}>
    <View style={styles.loadingMark}>
      <AppText variant="title1" color={colors.inkInverse}>
        S
      </AppText>
    </View>
    <View style={{ width: 120, marginTop: space.xl }}>
      <Skeleton height={4} radius={2} />
    </View>
    {message ? (
      <AppText variant="footnote" tone="soft" style={{ marginTop: space.md }}>
        {message}
      </AppText>
    ) : null}
  </View>
);

/* ---------------- List rows ---------------- */

export interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ListItem: React.FC<ListItemProps> = ({ title, subtitle, leading, trailing, onPress, chevron = !!onPress, destructive, style }) => {
  const body = (
    <View style={[styles.listItem, style]}>
      {leading}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" tone={destructive ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" tone="muted" numberOfLines={2} style={{ marginTop: 1 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /> : null}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </PressableScale>
  ) : (
    body
  );
};

/** Label on the left, value on the right; for detail cards. */
export const InfoRow: React.FC<{ label: string; value?: React.ReactNode; icon?: keyof typeof Ionicons.glyphMap; last?: boolean }> = ({
  label,
  value,
  icon,
  last,
}) => (
  <View style={[styles.infoRow, !last && styles.infoRowLine]}>
    {icon ? <Ionicons name={icon} size={17} color={colors.inkMuted} /> : null}
    <AppText variant="footnote" tone="soft" style={{ flex: 1 }}>
      {label}
    </AppText>
    {typeof value === 'string' || typeof value === 'number' || value == null ? (
      <AppText variant="callout" style={{ flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>
        {value === '' || value == null ? '—' : value}
      </AppText>
    ) : (
      value
    )}
  </View>
);

/* ---------------- Stat tile ---------------- */

export interface StatTileProps {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  hint?: string;
  hintTone?: 'success' | 'danger' | 'muted';
  accent?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const StatTile: React.FC<StatTileProps> = ({ label, value, icon, hint, hintTone = 'muted', accent = colors.brand, onPress, style }) => {
  const content = (
    <View style={[styles.stat, style]}>
      <View style={styles.statHead}>
        <AppText variant="caption" tone="soft" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </AppText>
        {icon ? <Ionicons name={icon} size={16} color={accent} /> : null}
      </View>
      <AppText variant="number" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      {hint ? (
        <AppText variant="caption" tone={hintTone === 'muted' ? 'muted' : hintTone} numberOfLines={1}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.97} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </PressableScale>
  ) : (
    <View style={{ flex: 1 }}>{content}</View>
  );
};

/* ---------------- Bottom sheet ---------------- */

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Bottom sheet: the backdrop fades while the panel springs up; drag the top down to dismiss. */
export const Sheet: React.FC<SheetProps> = ({ visible, onClose, title, subtitle, children, footer }) => {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(screenH);
  const shown = useSharedValue(0);

  // Mount as soon as it should show; unmount only after the closing animation.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      y.set(screenH);
      shown.set(withTiming(1, { duration: motion.base, easing: motion.ease }));
      y.set(withSpring(0, motion.spring));
    } else {
      shown.set(withTiming(0, { duration: motion.fast, easing: motion.easeIn }));
      y.set(
        withTiming(screenH * 0.6, { duration: motion.base, easing: motion.easeIn }, done => {
          if (done) scheduleOnRN(setMounted, false);
        })
      );
    }
  }, [visible, screenH, shown, y]);

  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate(e => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(onClose);
      else y.set(withSpring(0, motion.spring));
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <View style={{ flex: 1 }} pointerEvents="box-none" />
          <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }, sheetStyle]}>
            <GestureDetector gesture={drag}>
              <View>
                <View style={styles.handle} />
                {title ? (
                  <View style={styles.sheetHead}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="title2">{title}</AppText>
                      {subtitle ? (
                        <AppText variant="footnote" tone="soft" style={{ marginTop: 2 }}>
                          {subtitle}
                        </AppText>
                      ) : null}
                    </View>
                    <PressableScale onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                      <Ionicons name="close" size={24} color={colors.inkSoft} />
                    </PressableScale>
                  </View>
                ) : null}
              </View>
            </GestureDetector>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: GUTTER }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: GUTTER, paddingTop: space.md }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: space.huge, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  loadingMark: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingVertical: space.md },
  infoRowLine: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  stat: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.xs, flex: 1 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  backdrop: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginTop: space.sm, marginBottom: space.md },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: GUTTER, paddingBottom: space.lg, gap: space.md },
});
