import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { get, ref, query, orderByChild, limitToLast } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import { Booking } from '../../src/types';
import BookingItem from '../../src/components/BookingItem';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { normalizeBookingStatus } from '../../src/utils/rtdbService';
import { getCached, setCached } from '../../src/utils/cache';

const BookingsScreen = () => {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('recent');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadedOnce = useRef(false);
  const lastCacheCheck = useRef<number>(0);

  // Load data once on mount - Instagram-style (never refetch on focus)
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      console.log('[Bookings] Loading data...');
      // Try cache first for instant display
      const cached = await getCached<Booking[]>('bookings:list');
      console.log('[Bookings] Cache result:', cached ? `${cached.length} items` : 'null');
      
      if (cached && cached.length && mounted) {
        setBookings(cached);
        setFilteredBookings(cached);
        setLoading(false);
        loadedOnce.current = true;
        
        // Fetch fresh data in background
        console.log('[Bookings] Fetching fresh data in background...');
        fetchBookingsInBackground();
        return;
      }
      
      // No cache - fetch from database
      console.log('[Bookings] No cache, fetching from database...');
      setLoading(false); // Don't show full-screen spinner
      setRefreshing(true); // Show pull-to-refresh indicator instead
      await fetchBookings();
    };
    
    loadData();
    return () => { mounted = false; };
  }, []);

  // Check cache when tab gains focus (efficient - only when user switches tabs)
  useFocusEffect(
    useCallback(() => {
      const checkCache = async () => {
        // Throttle checks to once per second max
        const now = Date.now();
        if (now - lastCacheCheck.current < 1000) return;
        lastCacheCheck.current = now;
        
        const cached = await getCached<Booking[]>('bookings:list');
        
        // Only refetch if cache is explicitly null AND we had data before (checkout scenario)
        if (cached === null && bookings.length > 0) {
          console.log('[Bookings] Cache invalidated (checkout), refetching...');
          loadedOnce.current = false;
          setRefreshing(true);
          await fetchBookings();
        } else if (cached && cached.length > 0) {
          // Check if cache is different from current state (background update from new booking)
          const currentIds = bookings.map(b => b.id).sort().join(',');
          const cachedIds = cached.map(b => b.id).sort().join(',');
          
          if (currentIds !== cachedIds) {
            console.log('[Bookings] Applying background-updated cache');
            setBookings(cached);
            setFilteredBookings(cached);
          }
        }
      };
      checkCache();
    }, [bookings.length])
  );

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const fetchBookings = async () => {
    try {
      let bookingsSnap;
      try {
        const bookingsQ = query(ref(rtdb, 'bookings'), orderByChild('createdAt'), limitToLast(200));
        bookingsSnap = await get(bookingsQ);
      } catch (err) {
        console.warn('Bookings ordered fetch failed; falling back to full fetch.', err);
        bookingsSnap = await get(ref(rtdb, 'bookings'));
      }
      
      // Fetch customers and rooms in parallel for better performance
      const [customersSnap, roomsSnap] = await Promise.all([
        get(ref(rtdb, 'customers')),
        get(ref(rtdb, 'rooms')),
      ]);

      const bookingsVal = bookingsSnap.val() || {};
      const customersVal = customersSnap.val() || {};
      const roomsVal = roomsSnap.val() || {};

      // Pre-build room lookup map for O(1) access instead of O(n) for each booking
      const roomLookup = new Map<string, { key: string; data: any }>();
      Object.entries(roomsVal).forEach(([key, room]: any) => {
        const roomNo = room.room_no?.toString();
        if (roomNo) roomLookup.set(roomNo, { key, data: room });
      });

      const mapped: Booking[] = Object.entries(bookingsVal).map(([id, value]: any) => {
        const booking = value as any;
        const customer = customersVal[booking.customerId];
        const roomInfo = roomLookup.get(booking.roomNo?.toString());
        const roomData = roomInfo?.data;
        const roomKey = roomInfo?.key;
        
        const normalizedStatus = normalizeBookingStatus(booking.status);
        const roomAvailable = roomData?.is_available !== false && !roomData?.current_booking_id;

        const amountVal = customer?.city || customer?.amount || '';
        const parsedAmount = Number(amountVal) || 0;
        return {
          id,
          customer_id: booking.customerId || '',
          room_id: roomKey || booking.roomNo || '',
          check_in: booking.checkInDate,
          check_out_expected: booking.checkOutDate || booking.checkoutDate,
          check_out_actual: booking.checkOutActual || booking.checkoutDate,
          status: normalizedStatus,
          total_amount: parsedAmount,
          created_by: '',
          created_at: booking.createdAt ? new Date(booking.createdAt).toISOString() : '',
          customer: customer
            ? {
                id: booking.customerId,
                name: customer.name || 'Guest',
                father_name: customer.father_name || '',
                address: customer.address || '',
                city: customer.city || '',
                mobile: customer.phone || '',
                member_count: customer.member_count || 0,
                vehicle_number: customer.vehicle_number || '',
                id_type: customer.id_type || '',
                id_number_masked: customer.id_number || '',

                created_at: customer.createdAt ? new Date(customer.createdAt).toISOString() : '',
              }
            : undefined,
          room: roomData
            ? {
                id: roomKey || booking.roomNo || '',
                room_number: roomData.room_no?.toString() || booking.roomNo || '',
                type: roomData.type || 'Room',
                capacity: roomData.beds || 1,
                price_per_night: 0,
                status: roomAvailable ? 'AVAILABLE' : 'OCCUPIED',
                current_booking_id: roomData.current_booking_id,
              }
            : undefined,
        };
      });

      const sorted = mapped.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
      // Group by customer so multiple rooms booked by same guest appear in one entry
      const groupedMap = new Map<string, Booking & { room_numbers: string[] }>();
      for (const b of sorted) {
        const groupKey =
          b.customer_id ||
          b.customer?.mobile ||
          b.customer?.name ||
          b.id;
        const roomNo = b.room?.room_number || b.room_id?.toString() || '';
        const existing = groupedMap.get(groupKey);
        if (existing) {
          if (roomNo && !existing.room_numbers.includes(roomNo)) existing.room_numbers.push(roomNo);
          // keep the most recent entry (sorted already), so no other fields change
        } else {
          groupedMap.set(groupKey, { ...b, room_numbers: roomNo ? [roomNo] : [] });
        }
      }
      const grouped = Array.from(groupedMap.values());

      setBookings(grouped);
      setFilteredBookings(grouped);
      setCached('bookings:list', grouped);
      loadedOnce.current = true;
    } catch (error) {
      console.error('Error fetching bookings:', error);
      // Keep existing data if available to avoid empty UI on transient errors.
      if (!bookings.length && !filteredBookings.length) {
        alert('Failed to load bookings');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Background fetch without showing loading indicators
  const fetchBookingsInBackground = async () => {
    try {
      let bookingsSnap;
      try {
        const bookingsQ = query(ref(rtdb, 'bookings'), orderByChild('createdAt'), limitToLast(200));
        bookingsSnap = await get(bookingsQ);
      } catch (err) {
        console.warn('Bookings ordered fetch failed; falling back to full fetch.', err);
        bookingsSnap = await get(ref(rtdb, 'bookings'));
      }
      
      const [customersSnap, roomsSnap] = await Promise.all([
        get(ref(rtdb, 'customers')),
        get(ref(rtdb, 'rooms')),
      ]);

      const bookingsVal = bookingsSnap.val() || {};
      const customersVal = customersSnap.val() || {};
      const roomsVal = roomsSnap.val() || {};

      const roomLookup = new Map<string, { key: string; data: any }>();
      Object.entries(roomsVal).forEach(([key, room]: any) => {
        const roomNo = room.room_no?.toString();
        if (roomNo) roomLookup.set(roomNo, { key, data: room });
      });

      const mapped: Booking[] = Object.entries(bookingsVal).map(([id, value]: any) => {
        const booking = value as any;
        const customer = customersVal[booking.customerId];
        const roomInfo = roomLookup.get(booking.roomNo?.toString());
        const roomData = roomInfo?.data;
        const roomKey = roomInfo?.key;
        
        const normalizedStatus = normalizeBookingStatus(booking.status);
        const roomAvailable = roomData?.is_available !== false && !roomData?.current_booking_id;

        const amountVal = customer?.city || customer?.amount || '';
        const parsedAmount = Number(amountVal) || 0;
        return {
          id,
          customer_id: booking.customerId || '',
          room_id: roomKey || booking.roomNo || '',
          check_in: booking.checkInDate,
          check_out_expected: booking.checkOutDate || booking.checkoutDate,
          check_out_actual: booking.checkOutActual || booking.checkoutDate,
          status: normalizedStatus,
          total_amount: parsedAmount,
          created_by: '',
          created_at: booking.createdAt ? new Date(booking.createdAt).toISOString() : '',
          customer: customer
            ? {
                id: booking.customerId,
                name: customer.name || 'Guest',
                father_name: customer.father_name || '',
                address: customer.address || '',
                city: customer.city || '',
                mobile: customer.phone || '',
                member_count: customer.member_count || 0,
                vehicle_number: customer.vehicle_number || '',
                id_type: customer.id_type || '',
                id_number_masked: customer.id_number || '',
                id_photo_base64: customer.id_image_url || '',
                created_at: customer.createdAt ? new Date(customer.createdAt).toISOString() : '',
              }
            : undefined,
          room: roomData
            ? {
                id: roomKey || booking.roomNo || '',
                room_number: roomData.room_no?.toString() || booking.roomNo || '',
                type: roomData.type || 'Room',
                capacity: roomData.beds || 1,
                price_per_night: 0,
                status: roomAvailable ? 'AVAILABLE' : 'OCCUPIED',
                current_booking_id: roomData.current_booking_id,
              }
            : undefined,
        };
      });

      const sorted = mapped.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
      const groupedMap = new Map<string, Booking & { room_numbers: string[] }>();
      for (const b of sorted) {
        const groupKey =
          b.customer_id ||
          b.customer?.mobile ||
          b.customer?.name ||
          b.id;
        const roomNo = b.room?.room_number || b.room_id?.toString() || '';
        const existing = groupedMap.get(groupKey);
        if (existing) {
          if (roomNo && !existing.room_numbers.includes(roomNo)) existing.room_numbers.push(roomNo);
        } else {
          groupedMap.set(groupKey, { ...b, room_numbers: roomNo ? [roomNo] : [] });
        }
      }
      const grouped = Array.from(groupedMap.values());

      setBookings(grouped);
      setFilteredBookings(grouped);
      setCached('bookings:list', grouped);
      console.log('[Bookings] Background refresh complete');
    } catch (error) {
      console.error('[Bookings] Background refresh failed:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadedOnce.current = false; // Allow refetch
    fetchBookings();
  }, []);

  const normalizeToDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value.toDate) {
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

  const filterBySearch = useCallback(
    (list: Booking[]) => {
      if (!debouncedSearch.trim()) return list;
      const query = debouncedSearch.toLowerCase();
      return list.filter(
        (booking) =>
          booking.customer?.name?.toLowerCase().includes(query) ||
          booking.room_numbers?.some((rn) => rn.toLowerCase().includes(query)) ||
          booking.room?.room_number?.toLowerCase().includes(query)
      );
    },
    [debouncedSearch]
  );

  const filterByMonth = useCallback(
    (list: Booking[]) => {
      if (selectedMonth === 'recent') return list;
      const [month, year] = selectedMonth.split('-').map((v) => Number(v));
      return list.filter((booking) => {
        const d =
          normalizeToDate((booking as any).check_in) ||
          normalizeToDate((booking as any).checkInDate) ||
          normalizeToDate(booking.created_at);
        if (!d) return false;
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });
    },
    [selectedMonth]
  );

  useEffect(() => {
    const base = filterByMonth(bookings);
    const filtered = filterBySearch(base);
    setFilteredBookings(filtered);
  }, [bookings, filterByMonth, filterBySearch]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    bookings.forEach((b) => {
      const d =
        normalizeToDate((b as any).check_in) ||
        normalizeToDate((b as any).checkInDate) ||
        normalizeToDate(b.created_at);
      if (!d) return;
      const key = `${d.getMonth() + 1}-${d.getFullYear()}`;
      months.add(key);
    });
    return Array.from(months.values()).sort((a, b) => {
      const [ma, ya] = a.split('-').map(Number);
      const [mb, yb] = b.split('-').map(Number);
      if (ya === yb) return mb - ma; // descending month
      return yb - ya; // descending year
    });
  }, [bookings]);

  // Don't show full-screen loading spinner - show content with pull-to-refresh instead
  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, selectedMonth === 'recent' && styles.filterChipActive]}
          onPress={() => setSelectedMonth('recent')}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedMonth === 'recent' && styles.filterChipTextActive,
            ]}
          >
            Recently added
          </Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {monthOptions.map((key) => {
            const [m, y] = key.split('-').map(Number);
            const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
            const active = selectedMonth === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedMonth(key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by guest name or room number"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Bookings List */}
      <FlatList
        data={filteredBookings}
        renderItem={({ item }) => (
          <BookingItem
            booking={item}
            onPress={() => router.push(`/booking-detail/${item.id}` as any)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No bookings found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1f2937',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
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
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  filterChipActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  filterChipText: {
    color: '#4b5563',
    fontSize: 14,
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default BookingsScreen;
