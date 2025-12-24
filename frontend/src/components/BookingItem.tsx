import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Booking } from '../types';
import StatusBadge from './StatusBadge';

interface BookingItemProps {
  booking: Booking;
  onPress: () => void;
}

const BookingItem: React.FC<BookingItemProps> = ({ booking, onPress }) => {
  const normalizeToDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.toDate) {
      try {
        return value.toDate();
      } catch {}
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

  return (
    <TouchableOpacity style={styles.item} onPress={onPress}>
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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  roomNumber: {
    fontSize: 14,
    color: '#6b7280',
    flexWrap: 'wrap',
  },
  dates: {
    marginBottom: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4,
  },
});

export default BookingItem;
