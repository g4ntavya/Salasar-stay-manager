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
  const cleanType = (value: string) => value.replace(/standard/gi, '').trim();
  const displayType = cleanType(room.type);
  
  // Check if this is a basement or common bathroom
  const isBasementOrCommon = 
    room.type.toLowerCase().includes('basement') ||
    room.type.toLowerCase().includes('common') ||
    room.room_number.toLowerCase().includes('basement') ||
    room.room_number.toLowerCase().startsWith('cb');
  
  const hideCapacity =
    room.type.toLowerCase().includes('standard') ||
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
        {!isBasementOrCommon && displayType ? <Text style={styles.type}>{displayType}</Text> : null}
        {!hideCapacity && (
          <Text style={styles.info}>Capacity: {room.capacity}</Text>
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
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
    marginTop: 4,
  },
});

export default RoomCard;
