import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { Booking } from '../types';
import { localDay } from '../utils/date';
import {
  AppText,
  Avatar,
  Button,
  Card,
  StatusPill,
  SwipeRow,
  bookingStatusPill,
  colors,
  formatRupees,
  motion,
  radius,
  space,
} from '../ui';

interface BookingItemProps {
  booking: Booking;
  onPress: () => void;
  onEdit?: () => void;
  /** Resolve false if the guest was not checked out (cancelled or failed). */
  onCheckout?: () => Promise<boolean> | boolean;
  /** Briefly marks the card, e.g. right after it was created. */
  highlight?: boolean;
}

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDay = (d: Date | null) => (d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');

const paymentLabel = (mode?: string) => {
  const m = String(mode || 'CASH').toUpperCase();
  return m === 'MIXED' ? 'Cash + UPI' : m === 'UPI' ? 'UPI' : 'Cash';
};

/** One stay in the bookings list. Swipe left (or use the buttons) to edit or check out. */
const BookingItem: React.FC<BookingItemProps> = ({ booking, onPress, onEdit, onCheckout, highlight }) => {
  const b = booking as any;
  const rooms: string[] = b.room_numbers?.length ? b.room_numbers : [b.room?.room_no || b.roomNo].filter(Boolean);
  const checkedOut = String(b.status || '').toUpperCase().replace(/[\s_-]/g, '') === 'CHECKEDOUT';
  const inDate = toDate(b.check_in || b.checkInDate);
  const outDate = toDate(checkedOut && b.check_out_actual ? b.check_out_actual : b.check_out_expected || b.checkOutDate);
  const noon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  const nights = inDate && outDate ? Math.max(1, Math.round((noon(outDate) - noon(inDate)) / 86400000)) : null;
  const today = localDay();
  const overdue = !checkedOut && outDate && localDay(outDate) < today;
  const leavesToday = !checkedOut && outDate && localDay(outDate) === today;
  const pill = bookingStatusPill(b.status);
  const canCheckout = !checkedOut && !!onCheckout;

  const flash = useSharedValue(0);
  useEffect(() => {
    if (!highlight) return;
    flash.set(
      withSequence(
        withTiming(1, { duration: motion.base, easing: motion.ease }),
        withDelay(1200, withTiming(0, { duration: 1200, easing: motion.ease }))
      )
    );
  }, [highlight, flash]);
  const flashStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(flash.get(), [0, 1], ['transparent', colors.brand]),
    backgroundColor: interpolateColor(flash.get(), [0, 1], ['transparent', colors.brandSoft]),
  }));

  const card = (
    <Card onPress={onPress} accessibilityLabel={`${b.customer?.name || 'Guest'}, room ${rooms.join(', ')}`} style={styles.card}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
      <View style={styles.top}>
        <Avatar name={b.customer?.name} size={42} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {b.customer?.name || 'Guest'}
          </AppText>
          <AppText variant="footnote" tone="muted" numberOfLines={1}>
            {rooms.length > 1 ? 'Rooms' : 'Room'} {rooms.join(', ') || '—'}
            {b.customer?.mobile ? ` · ${b.customer.mobile}` : ''}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="bodyStrong">{formatRupees(b.total_amount)}</AppText>
          <AppText variant="caption" tone="muted">
            {paymentLabel(b.payment_mode)}
          </AppText>
        </View>
      </View>

      <View style={styles.dates}>
        <AppText variant="callout">{fmtDay(inDate)}</AppText>
        <View style={styles.line} />
        <AppText variant="caption" tone="muted">
          {nights ? `${nights} night${nights > 1 ? 's' : ''}` : ''}
        </AppText>
        <View style={styles.line} />
        <AppText variant="callout" color={overdue ? colors.danger : undefined}>
          {fmtDay(outDate)}
          {checkedOut && b.check_out_actual ? `, ${fmtTime(toDate(b.check_out_actual))}` : ''}
        </AppText>
      </View>

      <View style={styles.bottom}>
        {overdue ? (
          <StatusPill tone="cancelled" label="Past check-out" size="sm" />
        ) : leavesToday ? (
          <StatusPill tone="occupied" label="Leaves today" size="sm" />
        ) : (
          <StatusPill tone={pill.tone} label={pill.label} size="sm" />
        )}
        <View style={{ flex: 1 }} />
        {onEdit && !checkedOut ? <Button title="Edit" icon="create-outline" size="sm" variant="secondary" onPress={onEdit} /> : null}
        {canCheckout ? <Button title="Check out" icon="log-out-outline" size="sm" variant="primary" onPress={() => onCheckout!()} /> : null}
      </View>
    </Card>
  );

  if (!canCheckout) return <View style={styles.wrap}>{card}</View>;
  return (
    <SwipeRow
      style={styles.wrap}
      primary={{ label: 'Check out', icon: 'log-out-outline', color: colors.brand, onAction: () => onCheckout!() }}
      secondary={onEdit ? { label: 'Edit', icon: 'create-outline', color: colors.ink, onAction: onEdit } : undefined}
    >
      {card}
    </SwipeRow>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  card: { gap: space.md, overflow: 'hidden' },
  flash: { borderRadius: radius.lg, borderWidth: 1.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dates: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: space.md },
});

export default BookingItem;
