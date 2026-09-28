import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, space } from '../theme';
import { AppText } from './Text';
import { PressableScale } from './Pressable';

type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'sm';

const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.brand, fg: colors.inkInverse },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.lineStrong },
  tonal: { bg: colors.brandSoft, fg: colors.brand },
  ghost: { bg: 'transparent', fg: colors.brand },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

const heights: Record<Size, number> = { sm: 36, md: 48, lg: 56 };

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
  accessibilityLabel,
}) => {
  const p = palette[variant];
  const iconSize = size === 'sm' ? 16 : 19;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      hapticOnPress={variant === 'primary'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === 'sm' ? space.md : space.xl,
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? StyleSheet.hairlineWidth * 2 : 0,
          borderRadius: size === 'sm' ? radius.pill : radius.md,
        },
        variant === 'primary' && shadows.soft,
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {/* The label stays in place (invisible) while loading so the button keeps its width. */}
      <View style={[styles.row, loading && { opacity: 0 }]}>
        {icon && <Ionicons name={icon} size={iconSize} color={p.fg} />}
        <AppText variant={size === 'sm' ? 'caption' : 'bodyStrong'} color={p.fg} numberOfLines={1}>
          {title}
        </AppText>
        {iconRight && <Ionicons name={iconRight} size={iconSize} color={p.fg} />}
      </View>
      {loading ? (
        <View style={styles.spinner}>
          <ActivityIndicator color={p.fg} />
        </View>
      ) : null}
    </PressableScale>
  );
};

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  variant?: 'surface' | 'tonal' | 'ghost' | 'brand' | 'glass';
  size?: number;
  accessibilityLabel: string;
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, onPress, variant = 'surface', size = 42, accessibilityLabel, badge, style }) => {
  const look = {
    surface: { bg: colors.surface, fg: colors.ink, border: colors.line },
    tonal: { bg: colors.brandSoft, fg: colors.brand, border: 'transparent' },
    ghost: { bg: 'transparent', fg: colors.ink, border: 'transparent' },
    brand: { bg: colors.brand, fg: colors.inkInverse, border: 'transparent' },
    glass: { bg: 'rgba(255,255,255,0.18)', fg: colors.inkInverse, border: 'rgba(255,255,255,0.25)' },
  }[variant];
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: look.bg, borderColor: look.border },
        variant === 'surface' && shadows.soft,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.47)} color={look.fg} />
      {badge && <View style={styles.badge} />}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spinner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  icon: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth * 2 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
