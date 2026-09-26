import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RoomStatus, BookingStatus } from '../types';

interface StatusBadgeProps {
  status: RoomStatus | BookingStatus;
  small?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, small = false }) => {
  const normalized = typeof status === 'string' ? status.toUpperCase() : status;

  const getStatusColor = () => {
    switch (normalized) {
      case 'AVAILABLE':
      case 'CHECKED_OUT':
        return '#10b981'; // green
      case 'PENDING':
      case 'CONFIRMED':
        return '#f59e0b'; // orange/amber
      case 'BOOKED':
      case 'OCCUPIED':
      case 'CHECKED_IN':
        return '#dc2626'; // red (important/occupied)
      case 'MAINTENANCE':
      case 'CANCELLED':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  return (
    <View style={[styles.badge, { backgroundColor: getStatusColor() }, small && styles.badgeSmall]}>
      <Text style={[styles.text, small && styles.textSmall]}>{normalized}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  textSmall: {
    fontSize: 10,
  },
});

export default StatusBadge;
