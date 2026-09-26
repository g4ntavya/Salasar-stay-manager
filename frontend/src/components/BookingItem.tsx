import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Booking } from '../types';
import StatusBadge from './StatusBadge';

interface BookingItemProps {
  booking: Booking;
  onPress: () => void;
  onEdit?: () => void;
  onCheckout?: () => void;
}

const BookingItem: React.FC<BookingItemProps> = ({ booking, onPress, onEdit, onCheckout }) => {
  const normalizeToDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.toDate) {
      try {
        return value.toDate();
      } catch { }
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  };

  const formatDateTime = (value: any) => {
    const d = normalizeToDate(value);
    if (!d) return 'N/A';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const roomLabel =
    booking.room_numbers && booking.room_numbers.length > 0
      ? booking.room_numbers.join(', ')
      : booking.room?.room_number || 'N/A';

  const checkoutValue =
    booking.status?.toString().toUpperCase() === 'CHECKED_OUT' && booking.check_out_actual
      ? booking.check_out_actual
      : booking.check_out_expected;

  const badgeLabel = booking.status;

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onEdit) onEdit();
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    const canCheckout = booking.status !== 'CHECKED_OUT' && onCheckout;

    return (
      <View style={[styles.rightActionContainer, { width: canCheckout ? 160 : 80 }]}>
        <TouchableOpacity
          onPress={handleEdit}
          style={[styles.editAction, canCheckout && { marginRight: 4 }]}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ scale: trans }], alignItems: 'center' }}>
            <Ionicons name="pencil-outline" size={24} color="#fff" />
            <Text style={styles.actionText}>Edit</Text>
          </Animated.View>
        </TouchableOpacity>
        {canCheckout && (
          <TouchableOpacity
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onCheckout();
            }}
            style={styles.checkoutAction}
            activeOpacity={0.8}
          >
            <Animated.View style={{ transform: [{ scale: trans }], alignItems: 'center' }}>
              <Ionicons name="exit-outline" size={24} color="#fff" />
              <Text style={styles.actionText}>Checkout</Text>
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const content = (
    <View style={styles.itemWrapper}>
      <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.guestName}>{booking.customer?.name || 'Unknown Guest'}</Text>
            <Text style={styles.roomNumber}>Room: {roomLabel}</Text>
          </View>
          <StatusBadge status={badgeLabel} small />
        </View>
        <View style={styles.dates}>
          <Text style={styles.dateText}>Check-in: {formatDateTime(booking.check_in)}</Text>
          <Text style={styles.dateText}>Check-out: {formatDateTime(checkoutValue)}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.paymentBadge}>
            <Ionicons
              name={booking.payment_mode === 'UPI' ? 'qr-code-outline' : 'cash-outline'}
              size={14}
              color="#6b7280"
            />
            <Text style={styles.paymentText}>{booking.payment_mode || 'CASH'}</Text>
          </View>
          <Text style={styles.amountText}>₹{booking.total_amount || 0}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  if (onEdit || onCheckout) {
    return (
      <Swipeable
        renderRightActions={renderRightActions}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
      >
        {content}
      </Swipeable>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  itemWrapper: {
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    paddingRight: 8,
  },
  guestName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  roomNumber: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  dates: {
    marginBottom: 12,
  },
  dateText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paymentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#dc2626',
  },
  rightActionContainer: {
    marginBottom: 12,
    paddingRight: 4,
    flexDirection: 'row',
  },
  editAction: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    borderRadius: 12,
  },
  checkoutAction: {
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    borderRadius: 12,
  },
  actionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});

export default BookingItem;
