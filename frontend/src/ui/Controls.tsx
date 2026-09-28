import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, space, statusColors, type StatusTone } from '../theme';
import { AppText } from './Text';
import { PressableScale, haptic } from './Pressable';
import { motion } from './motion';

const SEG_PAD = 4;

/* ---------------- Chip ---------------- */

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
}

export const Chip: React.FC<ChipProps> = ({ label, selected, onPress, icon, count }) => (
  <PressableScale
    onPress={() => {
      haptic.tap();
      onPress?.();
    }}
    scaleTo={0.95}
    accessibilityRole="button"
    accessibilityState={{ selected: !!selected }}
    style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
  >
    {icon ? <Ionicons name={icon} size={14} color={selected ? colors.inkInverse : colors.inkSoft} /> : null}
    <AppText variant="callout" color={selected ? colors.inkInverse : colors.inkSoft}>
      {label}
    </AppText>
    {count != null ? (
      <View style={[styles.count, { backgroundColor: selected ? 'rgba(255,255,255,0.22)' : colors.surfaceAlt }]}>
        <AppText variant="caption" color={selected ? colors.inkInverse : colors.inkSoft}>
          {count}
        </AppText>
      </View>
    ) : null}
  </PressableScale>
);

/** Horizontally scrolling chip row that bleeds to the screen edges. */
export const ChipRow: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipRow, style]} contentContainerStyle={styles.chipRowContent}>
    {children}
  </ScrollView>
);

/* ---------------- Segmented control ---------------- */

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({ options, value, onChange, style }: SegmentedProps<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(o => o.value === value));
  const segW = width > 0 ? (width - SEG_PAD * 2) / options.length : 0;
  const x = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (!segW) return;
    // Jump into place on first layout, glide afterwards.
    if (!placed.current) {
      placed.current = true;
      x.set(index * segW);
    } else x.set(withTiming(index * segW, { duration: motion.base, easing: motion.ease }));
  }, [index, segW, x]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist" onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {segW > 0 ? <Animated.View style={[styles.segmentOn, { width: segW }, indicatorStyle]} /> : null}
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            focusable={Platform.OS !== 'android'}
            onPress={() => {
              if (!active) haptic.tap();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.segment}
          >
            <AppText variant="callout" color={active ? colors.ink : colors.inkMuted} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Status pill ---------------- */

export const StatusPill: React.FC<{ tone: StatusTone; label: string; size?: 'sm' | 'md' }> = ({ tone, label, size = 'md' }) => {
  const c = statusColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }, size === 'sm' && styles.pillSm]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <AppText variant="caption" color={c.fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
};

/** Maps a booking status to a pill tone + label. */
export const bookingStatusPill = (status?: string): { tone: StatusTone; label: string } => {
  const s = String(status || '').toUpperCase().replace(/[\s_-]/g, '');
  if (s === 'CHECKEDOUT') return { tone: 'checkedOut', label: 'Checked out' };
  if (s === 'CANCELLED' || s === 'CANCELED') return { tone: 'cancelled', label: 'Cancelled' };
  if (s === 'CONFIRMED') return { tone: 'reserved', label: 'Confirmed' };
  return { tone: 'occupied', label: 'In house' };
};

/* ---------------- Avatar ---------------- */

const AVATAR_TINTS = [
  ['#F5E8E9', '#7A1E2C'],
  ['#F5EBDB', '#8A5F22'],
  ['#E3F1E9', '#2E7A57'],
  ['#E5EDF6', '#2D5B86'],
  ['#EFE7F5', '#6A3F8A'],
  ['#F8E7E0', '#A4462F'],
];

export const initials = (name?: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || '?';

export const Avatar: React.FC<{ name?: string; size?: number; style?: StyleProp<ViewStyle> }> = ({ name, size = 44, style }) => {
  const hash = Array.from(name || '').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const [bg, fg] = AVATAR_TINTS[hash % AVATAR_TINTS.length];
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <AppText variant={size >= 56 ? 'title2' : 'bodyStrong'} color={fg} style={size < 40 && { fontSize: 13 }}>
        {initials(name)}
      </AppText>
    </View>
  );
};

/* ---------------- Icon badge ---------------- */

export const IconBadge: React.FC<{ icon: keyof typeof Ionicons.glyphMap; bg?: string; fg?: string; size?: number }> = ({
  icon,
  bg = colors.brandSoft,
  fg = colors.brand,
  size = 40,
}) => (
  <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={icon} size={size * 0.5} color={fg} />
  </View>
);

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, height: 36, paddingHorizontal: space.md + 2, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.ink },
  chipOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  chipRow: { marginHorizontal: -20, flexGrow: 0 },
  chipRowContent: { paddingHorizontal: 20, gap: space.sm },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: SEG_PAD },
  segment: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segmentOn: {
    position: 'absolute',
    top: SEG_PAD,
    left: SEG_PAD,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    // Android draws elevated views above their siblings, which would hide the labels.
    ...(Platform.OS === 'android' ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line } : shadows.soft),
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillSm: { height: 22, paddingHorizontal: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
