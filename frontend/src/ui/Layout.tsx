import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, GUTTER, radius, shadows, space } from '../theme';
import { AppText } from './Text';
import { IconButton } from './Button';
import { PressableScale } from './Pressable';
import { useTabBarSpace } from './TabBar';

/* ---------------- Screen ---------------- */

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Content pinned below the scroll area (e.g. a primary action bar). */
  footer?: React.ReactNode;
  scrollProps?: ScrollViewProps;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  edges = ['top'],
  contentStyle,
  footer,
  scrollProps,
}) => {
  // Enough room at the end to scroll the last item clear of the floating tab bar.
  const bottomSpace = useTabBarSpace();
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          {...scrollProps}
          contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
};

/* ---------------- Headers ---------------- */

export interface ScreenHeaderProps {
  title: string;
  overline?: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Large editorial header used at the top of each main tab. */
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, overline, subtitle, right, style }) => (
  <View style={[styles.header, style]}>
    <View style={styles.flex}>
      {overline ? (
        <AppText variant="overline" tone="gold" style={{ marginBottom: space.xs }}>
          {overline}
        </AppText>
      ) : null}
      <AppText variant="title1" numberOfLines={2}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="footnote" tone="soft" style={{ marginTop: space.xs }}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
    {right ? <View style={styles.headerRight}>{right}</View> : null}
  </View>
);

export interface NavBarProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  /** Hide the back button (e.g. for modal-style screens with their own close). */
  hideBack?: boolean;
}

/** Compact top bar for pushed screens: round back button, title, actions. */
export const NavBar: React.FC<NavBarProps> = ({ title, subtitle, right, onBack, hideBack }) => {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/dashboard')));
  return (
    <View style={styles.navbar}>
      {!hideBack ? <IconButton icon="chevron-back" onPress={back} accessibilityLabel="Go back" /> : <View style={{ width: 42 }} />}
      <View style={styles.navTitle}>
        {title ? (
          <AppText variant="title3" numberOfLines={1} align="center">
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={1} align="center">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.navRight}>{right ?? <View style={{ width: 42 }} />}</View>
    </View>
  );
};

/* ---------------- Card & Section ---------------- */

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'surface' | 'alt' | 'brand' | 'outline';
  elevated?: boolean;
  accessibilityLabel?: string;
}

export const Card: React.FC<CardProps> = ({ children, onPress, style, padded = true, tone = 'surface', elevated = true, accessibilityLabel }) => {
  const toneStyle = {
    surface: { backgroundColor: colors.surface },
    alt: { backgroundColor: colors.surfaceAlt },
    brand: { backgroundColor: colors.brand },
    outline: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
  }[tone];
  const cardStyle = [
    styles.card,
    toneStyle,
    padded && styles.cardPadded,
    elevated && tone !== 'outline' && shadows.card,
    // Pressable cards can't use Android elevation (see PressableScale); a hairline keeps their edge.
    onPress && tone === 'surface' && styles.cardHairline,
    style,
  ];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={cardStyle} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </PressableScale>
  );
};

export interface SectionProps {
  title?: string;
  caption?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const Section: React.FC<SectionProps> = ({ title, caption, action, children, style }) => (
  <View style={[styles.section, style]}>
    {(title || action) && (
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          {title ? <AppText variant="title3">{title}</AppText> : null}
          {caption ? (
            <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {caption}
            </AppText>
          ) : null}
        </View>
        {action ? (
          <PressableScale onPress={action.onPress} hitSlop={8} accessibilityRole="button">
            <AppText variant="callout" tone="brand">
              {action.label}
            </AppText>
          </PressableScale>
        ) : null}
      </View>
    )}
    {children}
  </View>
);

export const Divider: React.FC<{
  style?: StyleProp<ViewStyle>;
  inset?: number;
}> = ({ style, inset = 0 }) => <View style={[styles.divider, { marginLeft: inset }, style]} />;

export const Row: React.FC<{
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  align?: ViewStyle['alignItems'];
}> = ({ children, gap = space.md, style, align = 'center' }) => <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: GUTTER },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.xs,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
    paddingVertical: space.md,
    gap: space.md,
  },
  navTitle: { flex: 1, alignItems: 'center' },
  navRight: {
    flexDirection: 'row',
    gap: space.sm,
    minWidth: 42,
    justifyContent: 'flex-end',
  },
  card: { borderRadius: radius.lg },
  cardPadded: { padding: space.lg },
  cardHairline: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.line,
  },
  section: { marginBottom: space.xxl },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: space.md,
    gap: space.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.line,
  },
});
