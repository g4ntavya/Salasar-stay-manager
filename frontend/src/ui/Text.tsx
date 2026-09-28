import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { colors, type, type TypeVariant } from '../theme';

type Tone = 'default' | 'soft' | 'muted' | 'inverse' | 'brand' | 'gold' | 'success' | 'danger';

const toneColor: Record<Tone, string> = {
  default: colors.ink,
  soft: colors.inkSoft,
  muted: colors.inkMuted,
  inverse: colors.inkInverse,
  brand: colors.brand,
  gold: colors.gold,
  success: colors.success,
  danger: colors.danger,
};

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** All text in the app goes through this so fonts and sizes stay consistent. */
export const AppText: React.FC<AppTextProps> = ({ variant = 'body', tone = 'default', color, align, style, ...rest }) => (
  <RNText
    {...rest}
    maxFontSizeMultiplier={1.4}
    style={[type[variant], { color: color ?? toneColor[tone] }, align && { textAlign: align }, style]}
  />
);
