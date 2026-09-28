import React, { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, space } from '../theme';
import { AppText } from './Text';
import { PressableScale } from './Pressable';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  hint?: string;
  hintTone?: 'muted' | 'success' | 'danger' | 'gold';
  error?: string;
  required?: boolean;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Text input with a label above, optional icon, and hint/error text below.
 * Focus only changes colours: toggling shadow/elevation props on the container makes
 * React Native rebuild it and remount the input mid-typing, which drops keystrokes.
 */
export const Field = forwardRef<TextInput, FieldProps>(
  ({ label, icon, hint, hintTone = 'muted', error, required, right, style, editable = true, multiline, onFocus, onBlur, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const borderColor = error ? colors.danger : focused ? colors.brand : colors.line;
    return (
      <View style={[styles.wrap, style]}>
        {label ? (
          <AppText variant="caption" tone="soft" style={styles.label}>
            {label}
            {required ? <AppText variant="caption" tone="brand"> *</AppText> : null}
          </AppText>
        ) : null}
        <View
          style={[
            styles.box,
            { borderColor, backgroundColor: editable ? colors.surface : colors.surfaceAlt },
            multiline && { minHeight: 96, alignItems: 'flex-start', paddingTop: space.md },
          ]}
        >
          {icon ? <Ionicons name={icon} size={18} color={focused ? colors.brand : colors.inkMuted} style={multiline && { marginTop: 2 }} /> : null}
          <TextInput
            ref={ref}
            {...rest}
            editable={editable}
            multiline={multiline}
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.brand}
            cursorColor={colors.brand}
            onFocus={e => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={e => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.input, !editable && { color: colors.inkSoft }, multiline && { textAlignVertical: 'top' }]}
          />
          {right}
        </View>
        {error || hint ? (
          <AppText variant="caption" tone={error ? 'danger' : hintTone === 'muted' ? 'muted' : hintTone} style={styles.hint}>
            {error || hint}
          </AppText>
        ) : null}
      </View>
    );
  }
);
Field.displayName = 'Field';

export interface SelectFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  required?: boolean;
  /** Show the dropdown arrow (hide it in narrow side-by-side fields). */
  chevron?: boolean;
  /** Read-only: shown like a filled field that cannot be changed. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Looks like a Field but opens a picker (dates, lists). */
export const SelectField: React.FC<SelectFieldProps> = ({ label, value, placeholder, icon = 'calendar-outline', onPress, required, chevron = true, disabled, style }) => (
  <View style={[styles.wrap, style]}>
    {label ? (
      <AppText variant="caption" tone="soft" style={styles.label}>
        {label}
        {required ? <AppText variant="caption" tone="brand"> *</AppText> : null}
      </AppText>
    ) : null}
    {disabled ? (
      <View style={[styles.box, { borderColor: 'transparent', backgroundColor: colors.surfaceAlt }]} accessible accessibilityLabel={`${label}: ${value}`}>
        <Ionicons name={icon} size={18} color={colors.inkMuted} />
        <AppText variant="body" tone="soft" style={{ flex: 1 }} numberOfLines={1}>
          {value || placeholder}
        </AppText>
      </View>
    ) : (
      <PressableScale onPress={onPress} scaleTo={0.98} style={[styles.box, { borderColor: colors.line }]} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name={icon} size={18} color={colors.brand} />
        <AppText variant="body" tone={value ? 'default' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>
          {value || placeholder}
        </AppText>
        {chevron ? <Ionicons name="chevron-down" size={16} color={colors.inkMuted} /> : null}
      </PressableScale>
    )}
  </View>
);

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { marginBottom: space.xs + 2, marginLeft: 2 },
  box: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: space.md },
  hint: { marginTop: space.xs + 2, marginLeft: 2 },
});
