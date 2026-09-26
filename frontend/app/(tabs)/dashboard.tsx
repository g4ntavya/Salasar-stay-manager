import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { subscribeToDashboardCounts, compareRoomIds, subscribeToRoomStatusGrid, RtdbRoom, repairRoomStatuses } from '../../src/utils/rtdbService';
import { TOTAL_ROOMS } from '../../src/utils/roomConstants';
import { getCached, setCached } from '../../src/utils/cache';

const RoomGrid = () => {
  const [rooms, setRooms] = useState<(RtdbRoom & { hasFutureBooking: boolean })[]>([]);
  const lastUpdate = useRef<number>(0);

  useEffect(() => {
    const unsub = subscribeToRoomStatusGrid((data) => {
      // Small throttle to prevent rapid flickering on busy DBs
      const now = Date.now();
      if (now - lastUpdate.current > 500) {
        setRooms(data.sort((a, b) => compareRoomIds(a.room_no, b.room_no)));
        lastUpdate.current = now;
      } else {
        setTimeout(() => {
          setRooms(data.sort((a, b) => compareRoomIds(a.room_no, b.room_no)));
        }, 500);
      }
    });
    return () => unsub();
  }, []);

  if (rooms.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Room Status Grid</Text>
        <View style={styles.legendDotContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.statusDotSmall, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendText}>Avail</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.statusDotSmall, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Occ</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.advanceIconSmall}>
              <Ionicons name="calendar" size={8} color="#fff" />
            </View>
            <Text style={styles.legendText}>Adv Booked</Text>
          </View>
        </View>
      </View>
      <View style={styles.gridContainer}>
        {rooms.map((room) => {
          const isOccupied = !room.is_available;
          return (
            <View
              key={room.room_no}
              style={[
                styles.gridCell,
                isOccupied ? styles.gridCellOccupied : styles.gridCellAvailable
              ]}
            >
              <Text
                style={[
                  styles.gridCellText,
                  isOccupied ? styles.gridCellTextOccupied : styles.gridCellTextAvailable
                ]}
                numberOfLines={1}
              >
                {room.room_no}
              </Text>

              {room.hasFutureBooking && (
                <View style={styles.advanceBookingIndicator}>
                  <Ionicons name="calendar" size={10} color="#fff" />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const DashboardScreen = () => {
  const router = useRouter();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const lastCacheCheck = useRef<number>(0);
  const redirectedRef = useRef(false);

  // Growth users should NOT be here - redirect once only
  useEffect(() => {
    if (profile?.role === 'GROWTH' && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace('/analytics');
    }
  }, [profile?.role]);
  const [stats, setStats] = useState({
    totalRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,
    occupiedRoomNos: [] as string[],
  });
  // Safety fallback so UI shows something even if RTDB connection is slow.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        const total = TOTAL_ROOMS;
        setStats({
          totalRooms: total,
          availableRooms: total,
          occupiedRooms: 0,
          occupiedRoomNos: [],
        });
        setLoading(false);
        setRefreshing(false);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [loading]);

  // Hydrate from cache on mount only - don't block real-time subscription
  useEffect(() => {
    (async () => {
      const cached = await getCached<typeof stats>('dashboard:stats');
      if (cached) {
        console.log('[Dashboard] Loaded from cache:', cached.occupiedRooms, 'occupied');
        // Only set if we don't already have data from subscription
        setStats(prev => prev.occupiedRooms > 0 ? prev : cached);
      }
      setLoading(false);
    })();
  }, []);

  // Real-time subscription to rooms - set up once, persist across tab switches
  useEffect(() => {
    const fallback = () => {
      const total = TOTAL_ROOMS;
      const fallbackStats = {
        totalRooms: total,
        availableRooms: total,
        occupiedRooms: 0,
        occupiedRoomNos: [],
      };
      setStats(fallbackStats);
      setLoading(false);
      setRefreshing(false);
    };

    const unsubscribe = subscribeToDashboardCounts(
      (data) => {
        console.log('[Dashboard] Real-time update - Occupied:', data.occupiedRooms, 'Available:', data.availableRooms);
        setStats(data);
        setCached('dashboard:stats', data);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        console.error('[Dashboard] Subscription error, using fallback');
        fallback();
      }
    );

    return () => unsubscribe();
  }, []); // Only set up once on mount, not on every focus

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const handleCleanup = async () => {
    Alert.alert(
      'Repair Room Status',
      'This matches every room\'s occupied/available status to the open bookings. No guest is checked out. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setCleaning(true);
            try {
              const res = await repairRoomStatuses();
              Alert.alert(
                'Done',
                res.repaired > 0 ? `Corrected the status of ${res.repaired} room(s).` : 'All room statuses were already correct.'
              );
            } catch (err) {
              Alert.alert('Error', 'Could not repair room status. Check your connection and try again.');
            } finally {
              setCleaning(false);
            }
          }
        }
      ]
    );
  };

  // Don't show full-screen loading spinner - show content with pull-to-refresh instead
  const hasOccupied = stats.occupiedRoomNos && stats.occupiedRoomNos.length > 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />
      }
    >
      {/* Room status repair (admin only) */}
      {profile?.role === 'ADMIN' && (
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <TouchableOpacity
          onPress={handleCleanup}
          disabled={cleaning}
          style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fbbf24',
            padding: 12,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: cleaning ? 0.7 : 1
          }}
        >
          <Ionicons name="construct-outline" size={20} color="#92400e" style={{ marginRight: 8 }} />
          <Text style={{ color: '#92400e', fontWeight: '600' }}>
            {cleaning ? 'Repairing room status...' : 'Repair Room Status'}
          </Text>
        </TouchableOpacity>
      </View>
      )}
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: '#dbeafe' }]}>
          <Ionicons name="home" size={32} color="#1e40af" />
          <Text style={styles.statNumber}>{stats.totalRooms}</Text>
          <Text style={styles.statLabel}>Total Rooms</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#d1fae5' }]}>
          <Ionicons name="checkmark-circle" size={32} color="#065f46" />
          <Text style={styles.statNumber}>{stats.availableRooms}</Text>
          <Text style={styles.statLabel}>Available Rooms</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: '#fee2e2' }]}>
          <Ionicons name="bed" size={32} color="#991b1b" />
          <Text style={styles.statNumber}>{stats.occupiedRooms}</Text>
          <Text style={styles.statLabel}>Occupied Rooms</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#fef3c7' }]}>
          <Ionicons name="list" size={32} color="#92400e" />
          <Text style={styles.statNumber}>{stats.occupiedRoomNos.length}</Text>
          <Text style={styles.statLabel}>Rooms In Use</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/new-booking' as any)}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>New Booking / Check-in</Text>
        </TouchableOpacity>
      </View>

      {/* Currently Occupied Room Chips (Simplified) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Currently Occupied</Text>
        {hasOccupied ? (
          <View style={styles.occupiedRoomsGrid}>
            {stats.occupiedRoomNos
              .slice()
              .filter((roomNo) => roomNo != null && roomNo !== '') // Safety check
              .sort(compareRoomIds)
              .map((roomNo) => {
                const roomNoStr = String(roomNo);
                const isBasementOrCommon =
                  roomNoStr.toLowerCase().includes('basement') ||
                  roomNoStr.toLowerCase().startsWith('cb');

                const displayText = isBasementOrCommon ? roomNoStr : `Room ${roomNoStr}`;

                return (
                  <View key={String(roomNo)} style={styles.occupiedRoomChip}>
                    <Ionicons name="bed" size={12} color="#B91C1C" />
                    <Text style={styles.occupiedRoomText}>{roomNoStr}</Text>
                  </View>
                );
              })}
          </View>
        ) : (
          <Text style={styles.noOccupiedText}>No rooms are currently occupied.</Text>
        )}
      </View>
    </ScrollView>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const GRID_GAP = 8;
const CELL_WIDTH = (SCREEN_WIDTH - (GRID_PADDING * 2) - (GRID_GAP * 4) - 4) / 5;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    padding: GRID_PADDING,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingGuest: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  bookingRoom: {
    fontSize: 14,
    color: '#6b7280',
  },
  occupiedRoomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  occupiedRoomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  occupiedRoomText: {
    fontSize: 13,
    color: '#7F1D1D',
    fontWeight: '600',
  },
  noOccupiedText: {
    fontSize: 14,
    color: '#6b7280',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendDotContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: GRID_GAP,
  },
  gridCell: {
    width: CELL_WIDTH,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  gridCellAvailable: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  gridCellOccupied: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  gridCellText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridCellTextAvailable: {
    color: '#065F46',
  },
  gridCellTextOccupied: {
    color: '#991B1B',
  },
  advanceBookingIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#3B82F6',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  advanceIconSmall: {
    backgroundColor: '#3B82F6',
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DashboardScreen;
