import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Room } from '../../src/types';
import RoomCard from '../../src/components/RoomCard';
import { useAuth } from '../../src/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllRooms, RtdbRoom, compareRoomIds, fetchAdvanceBookings, AdvanceBooking, normalizeBookingStatus, checkoutBooking, fetchBookingsEnriched, subscribeToRoomStatusGrid } from '../../src/utils/rtdbService';
import { TOTAL_ROOMS } from '../../src/utils/roomConstants';
import { defaultRoomSeeds } from '../../src/utils/defaultRooms';
import { getCached, setCached } from '../../src/utils/cache';

type ViewMode = 'rooms' | 'advance';

type RoomWithBookingFlag = RtdbRoom & { hasFutureBooking?: boolean };

const RoomsScreen = () => {
  const mapSeedToRtdbRoom = (seed: any, key?: string): RtdbRoom => ({
    key: key || seed.room_number,
    room_no: seed.room_number,
    beds: seed.capacity ?? 1,
    type: seed.type,
    ac_make: seed.ac_make,
    remarks: seed.remarks,
    is_available: seed.status ? seed.status === 'AVAILABLE' : true,
    current_booking_id: seed.current_booking_id,
  });

  const mapRtdbRoomToRoomCard = (room: RoomWithBookingFlag): Room => ({
    id: room.key,
    room_number: String(room?.room_no ?? ''),
    type: room.type,
    capacity: room.beds,
    base_rate: 0,
    status: room.is_available !== false && !room.current_booking_id && !room.hasFutureBooking ? 'AVAILABLE' : 'OCCUPIED',
    cleaned_status: room.cleaned_status === 'DIRTY' ? 'UNCLEAN' : room.cleaned_status === 'CLEANING' ? 'IN_PROGRESS' : 'CLEAN',
    ac_make: room.ac_make,
    remarks: room.remarks,
    current_booking_id: room.current_booking_id ?? undefined,
  });

  const mergeWithSeeds = (live: RoomWithBookingFlag[]): RoomWithBookingFlag[] => {
    const excluded = new Set(['1']);
    const seedMap = new Map<string, RoomWithBookingFlag>();

    defaultRoomSeeds.slice(0, TOTAL_ROOMS).forEach((seed) => {
      if (!excluded.has(seed.room_number)) {
        seedMap.set(
          seed.room_number,
          mapSeedToRtdbRoom(seed, seed.room_number)
        );
      }
    });

    live.forEach((room) => {
      if (!excluded.has(room.room_no)) {
        seedMap.set(room.room_no, {
          ...room,
          is_available: room.is_available !== false,
        });
      }
    });

    return Array.from(seedMap.values()).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
  };

  const router = useRouter();
  const { profile } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('rooms');
  const [rooms, setRooms] = useState<RoomWithBookingFlag[]>(() => mergeWithSeeds([]));
  const [advanceBookings, setAdvanceBookings] = useState<AdvanceBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    let mounted = true;

    // 🚀 ENTERPRISE OPTIMIZATION: Use real-time bus for zero-latency + low bandwidth
    const unsubscribe = subscribeToRoomStatusGrid((data: any) => {
      if (mounted) {
        setRooms(mergeWithSeeds(data));
        setCached('rooms:list', data);
        loadedOnce.current = true;
        setRefreshing(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Background refresh of advance bookings on focus, but room status is already real-time
      if (viewMode === 'advance') {
        loadAdvanceBookings();
      }
    }, [viewMode])
  );

  const fetchRooms = async () => {
    try {
      const fetched = await fetchAllRooms();
      const merged = mergeWithSeeds(fetched);
      setRooms(merged);
      setCached('rooms:list', merged);
      loadedOnce.current = true;
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setRooms(mergeWithSeeds([]));
    } finally {
      setRefreshing(false);
    }
  };

  const fetchRoomsInBackground = async () => {
    try {
      const fetched = await fetchAllRooms();
      const merged = mergeWithSeeds(fetched);
      if (loadedOnce.current) {
        setRooms(merged);
        await setCached('rooms:list', merged);
      }
    } catch (error) {
      console.error('[Rooms] Background refresh failed:', error);
    }
  };

  const loadAdvanceBookings = async () => {
    try {
      const bookings = await fetchAdvanceBookings();
      setAdvanceBookings(bookings);
    } catch (error) {
      console.error('Error fetching advance bookings:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadedOnce.current = false;
    await fetchRooms();
    await loadAdvanceBookings();
    setRefreshing(false);
  }, []);

  // Load advance bookings when switching to advance view
  useEffect(() => {
    if (viewMode === 'advance') {
      loadAdvanceBookings();
    }
  }, [viewMode]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderAdvanceBookingItem = ({ item }: { item: AdvanceBooking }) => (
    <TouchableOpacity
      style={styles.advanceCard}
      onPress={() => router.push(`/booking-detail/${item.id}` as any)}
    >
      <View style={styles.advanceHeader}>
        <View style={styles.advanceNameRow}>
          <View style={styles.advanceAvatar}>
            <Ionicons name="person" size={20} color="#fff" />
          </View>
          <View style={styles.advanceNameInfo}>
            <Text style={styles.advanceName}>{item.guestName}</Text>
            <Text style={styles.advanceMembers}>{item.membersCount} member{item.membersCount > 1 ? 's' : ''}</Text>
          </View>
        </View>
        <View style={[styles.tokenBadge, item.tokenPaid ? styles.tokenPaid : styles.tokenUnpaid]}>
          <Text style={[styles.tokenBadgeText, item.tokenPaid ? styles.tokenPaidText : styles.tokenUnpaidText]}>
            {item.tokenPaid ? 'PAID' : 'UNPAID'}
          </Text>
        </View>
      </View>

      <View style={styles.advanceDetails}>
        <View style={styles.advanceRow}>
          <Ionicons name="calendar-outline" size={16} color="#6b7280" />
          <Text style={styles.advanceLabel}>Arrival:</Text>
          <Text style={styles.advanceValue}>{formatDate(item.arrivalDate)}</Text>
        </View>

        <View style={styles.advanceRow}>
          <Ionicons name="bed-outline" size={16} color="#6b7280" />
          <Text style={styles.advanceLabel}>Room:</Text>
          <Text style={styles.advanceValue}>
            {item.roomNumbers.length > 0 ? item.roomNumbers.join(', ') : 'Not assigned'}
          </Text>
        </View>

        <View style={styles.advanceRow}>
          <Ionicons name="wallet-outline" size={16} color="#6b7280" />
          <Text style={styles.advanceLabel}>Token:</Text>
          <Text style={[styles.advanceValue, styles.advanceAmount]}>₹{item.tokenAmount}</Text>
        </View>

        <View style={styles.advanceRow}>
          <Ionicons name="cash-outline" size={16} color="#6b7280" />
          <Text style={styles.advanceLabel}>Total:</Text>
          <Text style={[styles.advanceValue, styles.advanceTotal]}>₹{item.totalAmount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Toggle Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'rooms' && styles.tabActive]}
          onPress={() => setViewMode('rooms')}
        >
          <Ionicons name="bed-outline" size={18} color={viewMode === 'rooms' ? '#dc2626' : '#6b7280'} />
          <Text style={[styles.tabText, viewMode === 'rooms' && styles.tabTextActive]}>Rooms</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'advance' && styles.tabActive]}
          onPress={() => setViewMode('advance')}
        >
          <Ionicons name="calendar-outline" size={18} color={viewMode === 'advance' ? '#dc2626' : '#6b7280'} />
          <Text style={[styles.tabText, viewMode === 'advance' && styles.tabTextActive]}>
            Advance Bookings {advanceBookings.length > 0 && `(${advanceBookings.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'rooms' ? (
        <FlatList
          data={rooms}
          renderItem={({ item }) => (
            <RoomCard
              room={mapRtdbRoomToRoomCard(item)}
              onPress={() => { }}
            />
          )}
          keyExtractor={(item) => `room-${item.room_no}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bed-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No rooms found</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={advanceBookings}
          renderItem={renderAdvanceBookingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No advance bookings</Text>
              <Text style={styles.emptySubtext}>Future bookings will appear here</Text>
            </View>
          }
        />
      )}

      {/* Add Booking Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/new-booking' as any)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tabActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#dc2626',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#d1d5db',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  // Advance Booking Card Styles
  advanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
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
  advanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  advanceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  advanceAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  advanceNameInfo: {
    flex: 1,
  },
  advanceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  advanceMembers: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  tokenBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tokenPaid: {
    backgroundColor: '#d1fae5',
  },
  tokenUnpaid: {
    backgroundColor: '#fee2e2',
  },
  tokenBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tokenPaidText: {
    color: '#059669',
  },
  tokenUnpaidText: {
    color: '#dc2626',
  },
  advanceDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
    gap: 8,
  },
  advanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  advanceLabel: {
    fontSize: 13,
    color: '#6b7280',
    width: 55,
  },
  advanceValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    flex: 1,
  },
  advanceAmount: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  advanceTotal: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default RoomsScreen;
