// Design tokens: the single source of truth for colour, type, spacing and depth.
// Every screen and component reads from here so the look stays consistent.

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  // Surfaces (warm ivory, never pure grey)
  bg: '#F6F2EC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1EBE2',
  surfaceSunken: '#E9E2D7',

  // Text
  ink: '#1D1916',
  inkSoft: '#5F564D',
  inkMuted: '#978C80',
  inkInverse: '#FFFFFF',

  // Lines
  line: '#E7DFD3',
  lineStrong: '#D5CABB',

  // Brand: deep maroon + muted gold
  brand: '#7A1E2C',
  brandDeep: '#561320',
  brandSoft: '#F5E8E9',
  brandTint: '#E9CFD3',
  gold: '#A97B3C',
  goldSoft: '#F5EBDB',

  // Feedback
  success: '#2E7A57',
  successSoft: '#E3F1E9',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#AD6F12',
  warningSoft: '#FBF0DC',
  info: '#2D5B86',
  infoSoft: '#E5EDF6',

  overlay: 'rgba(22, 14, 10, 0.6)',
} as const;

/** Room / booking state colours, distinct from the brand colour. */
export const statusColors = {
  available: { fg: '#2E7A57', bg: '#E3F1E9' },
  occupied: { fg: '#B04A32', bg: '#F8E7E0' },
  reserved: { fg: '#A97B3C', bg: '#F5EBDB' },
  cleaning: { fg: '#566A8F', bg: '#E8ECF4' },
  checkedOut: { fg: '#6F665D', bg: '#EFEAE3' },
  cancelled: { fg: '#B3261E', bg: '#FBE9E7' },
} as const;

export type StatusTone = keyof typeof statusColors;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Screen side padding used everywhere. */
export const GUTTER = 20;

const shadow = (opacity: number, radiusPx: number, y: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: { shadowColor: '#3A2412', shadowOpacity: opacity, shadowRadius: radiusPx, shadowOffset: { width: 0, height: y } },
    android: { elevation, shadowColor: '#3A2412' },
    default: { shadowColor: '#3A2412', shadowOpacity: opacity, shadowRadius: radiusPx, shadowOffset: { width: 0, height: y } },
  })!;

export const shadows = {
  none: {} as ViewStyle,
  soft: shadow(0.06, 14, 4, 2),
  card: shadow(0.08, 20, 8, 3),
  raised: shadow(0.14, 24, 12, 8),
};

export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  title2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  title3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  footnote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  number: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  numberSm: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** ₹ amount in Indian grouping, e.g. ₹1,25,000. */
export const formatRupees = (n: number | string | null | undefined) =>
  `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
