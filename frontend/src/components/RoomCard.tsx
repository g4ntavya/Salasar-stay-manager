import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Room } from '../types';
import StatusBadge from './StatusBadge';

interface RoomCardProps {
  room: Room;
  onPress: () => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onPress }) => {
  const isSpecialHall = room.room_number === '302' || room.room_number === '304';

  // Robust check for room.type to prevent crash
  const cleanType = (value: string) => (value || '').replace(/standard/gi, '').trim();
  const displayType = cleanType(room.type || '');

  // Check if this is a basement or common bathroom
  const typeStr = (room.type || '').toLowerCase();
  const roomNumStr = (room.room_number || '').toLowerCase();
  const isBasementOrCommon =
    typeStr.includes('basement') ||
    typeStr.includes('common') ||
    roomNumStr.includes('basement') ||
    roomNumStr.startsWith('cb');

  const acRooms = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '101', '102', '103', '105', '106', '107', '110', '112', '114', '115', '116', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '303', '304', '306', '307', '108', '109'];

  const hideCapacity =
    (room.type || '').toLowerCase().includes('standard') ||
    isBasementOrCommon ||
    isSpecialHall;

  const displayNumber = isBasementOrCommon ? room.room_number : `Room ${room.room_number}`;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.roomNumber}>{displayNumber}</Text>
        <StatusBadge status={room.status} small />
      </View>
      <View style={styles.details}>
        {(() => {
          if (isBasementOrCommon) return null;
          if (room.room_number === '302') return <Text style={styles.type}>Small Hall (Non AC)</Text>;
          if (room.room_number === '304') return <Text style={styles.type}>Hall (AC)</Text>;
          if (room.room_number === '107' || room.room_number === '110') return null;

          const type = (room.type || '').toUpperCase();
          let display = '';

          const isExplicitNonAc = type.includes('NON AC') || type.includes('NON-AC');
          const isExplicitAc = type.includes('AC');
          const isInAcList = acRooms.includes(room.room_number);

          if (isExplicitNonAc) {
            display = 'Non AC';
          } else if (isExplicitAc || isInAcList) {
            display = 'AC';
          } else {
            display = cleanType(room.type);
          }

          return <Text style={styles.type}>{display}</Text>;
        })()}
        {!hideCapacity && room.capacity > 0 && (
          <Text style={styles.info}>Capacity: {room.capacity} Bed{room.capacity === 1 ? '' : 's'}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
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
    alignItems: 'center',
    marginBottom: 8,
  },
  roomNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  details: {
    marginTop: 8,
  },
  type: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 4,
  },
  info: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
});

export default RoomCard;
