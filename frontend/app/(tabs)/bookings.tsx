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
  Alert,
} from 'react-native';
import { exportCsv, exportCsvToDevice } from '../../src/utils/exportCsv';
import { useRouter } from 'expo-router';
import { Booking } from '../../src/types';
import type { BookingEnriched } from '../../src/utils/rtdbService';
import BookingItem from '../../src/components/BookingItem';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { normalizeBookingStatus, checkoutBooking, fetchBookingsEnriched } from '../../src/utils/rtdbService';
import { getCached, setCached } from '../../src/utils/cache';
import { useAuth } from '../../src/context/AuthContext';

const BookingsScreen = () => {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingEnriched[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<BookingEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('recent');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'UPI'>('ALL');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadedOnce = useRef(false);
  const lastCacheCheck = useRef<number>(0);
  const isFetchingRef = useRef(false);
  const { profile } = useAuth();

  const handleCheckoutBooking = async (booking: BookingEnriched) => {
    Alert.alert(
      'Confirm Checkout',
      `Are you sure you want to checkout ${booking.customer?.name || 'this guest'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Checkout',
          onPress: async () => {
            try {
              await checkoutBooking(booking.id);
              // Optimistic UI update
              setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'CHECKED_OUT' as any } : b));
              setFilteredBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'CHECKED_OUT' as any } : b));
              Alert.alert('Success', 'Checked out successfully');
              fetchBookingsInBackground();
            } catch (error) {
              console.error('Error checking out:', error);
              Alert.alert('Error', 'Failed to checkout');
            }
          }
        }
      ]
    );
  };

  // Load data once on mount - Instagram-style (never refetch on focus)
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      console.log('[Bookings] Loading data...');
      // Try cache first for instant display
      const cached = await getCached<BookingEnriched[]>('bookings:list');
      const list = Array.isArray(cached) ? cached : [];
      console.log('[Bookings] Cache result:', list.length ? `${list.length} items` : 'null');

      if (list.length > 0 && mounted) {
        setBookings(list);
        setFilteredBookings(list);
        setLoading(false);
        loadedOnce.current = true;

        // Always fetch fresh data in background to update amounts
        console.log('[Bookings] Fetching fresh data in background...');
        fetchBookingsInBackground();
        return;
      }

      // No cache - fetch from database
      console.log('[Bookings] No cache, fetching from database...');
      setLoading(true);
      await fetchBookings();
    };

    loadData();
    return () => { mounted = false; };
  }, []);

  // Check cache on focus - update if cache has new data, or refetch if cache was invalidated
  useFocusEffect(
    useCallback(() => {
      // Only check cache if we already have data loaded (don't interfere with initial load)
      if (!loadedOnce.current) return;

      const checkCache = async () => {
        // Throttle checks to once per 2 seconds max to avoid excessive checks
        const now = Date.now();
        if (now - lastCacheCheck.current < 2000) return;
        lastCacheCheck.current = now;

        const cached = await getCached<BookingEnriched[]>('bookings:list');
        const list = Array.isArray(cached) ? cached : [];

        if (list.length > 0) {
          setBookings(prev => {
            // Compare lengths first for quick detection of new bookings
            if (prev.length !== list.length) {
              setFilteredBookings(list);
              return list;
            }
            const currentStr = JSON.stringify(prev.map(b => ({ id: b.id, s: b.status, amt: b.total_amount || 0 })));
            const cachedStr = JSON.stringify(list.map(b => ({ id: b.id, s: b.status, amt: b.total_amount || 0 })));
            if (currentStr !== cachedStr) {
              setFilteredBookings(list);
              return list;
            }
            return prev;
          });
        } else {
          // Cache was invalidated (e.g., after new booking) — refetch in background
          console.log('[Bookings] Cache invalidated, fetching fresh data...');
          fetchBookingsInBackground();
        }
      };
      checkCache();
    }, [])
  );

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const fetchBookings = async () => {
    if (isFetchingRef.current) {
      console.log('[Bookings] Fetch already in progress, skipping');
      return;
    }
    isFetchingRef.current = true;
    try {
      const startTime = Date.now();
      console.log('[Bookings] Fetching bookings...');

      const grouped = await fetchBookingsEnriched(50);
      console.log('[Bookings] Fetch completed in', Date.now() - startTime, 'ms,', grouped.length, 'grouped');

      setBookings(grouped);
      setFilteredBookings(grouped);
      await setCached('bookings:list', grouped);
      loadedOnce.current = true;
    } catch (error) {
      console.error('Error fetching bookings:', error);
      if (bookings.length === 0 && filteredBookings.length === 0) {
        alert('Failed to load bookings');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  };

  const fetchBookingsInBackground = async () => {
    if (isFetchingRef.current) {
      console.log('[Bookings] Background fetch skipped — fetch in progress');
      return;
    }
    isFetchingRef.current = true;
    try {
      const grouped = await fetchBookingsEnriched(50);
      if (loadedOnce.current) {
        setBookings(grouped);
        setFilteredBookings(grouped);
        await setCached('bookings:list', grouped);
        console.log('[Bookings] Background refresh complete');
      }
    } catch (error) {
      console.error('[Bookings] Background refresh failed:', error);
    } finally {
      isFetchingRef.current = false;
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
      } catch { }
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  };

  const filterBySearch = useCallback(
    (list: BookingEnriched[]) => {
      if (!debouncedSearch.trim()) return list;
      const query = debouncedSearch.toLowerCase();
      return list.filter(
        (booking) =>
          booking.customer?.name?.toLowerCase().includes(query) ||
          booking.room_numbers?.some((rn) => rn.toLowerCase().includes(query)) ||
          (booking.room?.room_no ?? booking.roomNo)?.toLowerCase().includes(query)
      );
    },
    [debouncedSearch]
  );

  const filterByMonth = useCallback(
    (list: BookingEnriched[]) => {
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

  const filterByPaymentMode = useCallback(
    (list: BookingEnriched[]) => {
      if (paymentFilter === 'ALL') return list;
      return list.filter((booking) => booking.payment_mode === paymentFilter);
    },
    [paymentFilter]
  );

  useEffect(() => {
    let result = filterByMonth(bookings);
    result = filterByPaymentMode(result);
    result = filterBySearch(result);
    setFilteredBookings(result);
  }, [bookings, filterByMonth, filterByPaymentMode, filterBySearch]);

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

  const handleExportCSV = async () => {
    if (filteredBookings.length === 0) {
      Alert.alert('No data', 'There are no bookings to export for the current filters.');
      return;
    }

    // Build CSV content
    const header = "Booking ID,Guest Name,Mobile,Rooms,Check-in,Check-out,Status,Amount,Payment,Entered As\n";
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const safeDate = (d: any) => {
      if (!d) return '';
      const date = new Date(d);
      return isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN');
    };

    const rows = filteredBookings.map(b => {
      const rooms = (b.room_numbers || []).join('; ') || (b as any).room?.room_number || '';
      const name = b.customer?.name || 'Guest';
      const phone = b.customer?.mobile || '';
      const checkIn = safeDate(b.check_in);
      const checkOut = safeDate(b.check_out_expected);
      const status = b.status || '';
      const amt = b.total_amount || 0;
      const pMode = b.payment_mode || '';

      return `${b.id},${q(name)},${q(phone)},${q(rooms)},${checkIn},${checkOut},${q(status)},${amt},${q(pMode)},${q(b.customer?.amount)}`;
    }).join('\n');

    console.log(`[Export] Generating CSV for ${filteredBookings.length} bookings`);

    const csvContent = header + rows;
    const fileName = `Bookings_${selectedMonth.replace(/-/g, '_')}.csv`;

    // Use the new export function
    await exportCsvToDevice({
      filename: fileName,
      csv: csvContent
    });
  };

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
        <TouchableOpacity style={styles.exportIcon} onPress={() => handleExportCSV()}>
          <Ionicons name="download-outline" size={24} color="#dc2626" />
        </TouchableOpacity>
      </View>

      <View style={[styles.filterRow, { paddingTop: 4, paddingBottom: 10 }]}>
        <Text style={styles.filterLabel}>Filter by:</Text>
        <TouchableOpacity
          style={[styles.miniChip, paymentFilter === 'ALL' && styles.miniChipActive]}
          onPress={() => setPaymentFilter('ALL')}
        >
          <Text style={[styles.miniChipText, paymentFilter === 'ALL' && styles.miniChipTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniChip, paymentFilter === 'CASH' && styles.miniChipActive]}
          onPress={() => setPaymentFilter('CASH')}
        >
          <Text style={[styles.miniChipText, paymentFilter === 'CASH' && styles.miniChipTextActive]}>Cash</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniChip, paymentFilter === 'UPI' && styles.miniChipActive]}
          onPress={() => setPaymentFilter('UPI')}
        >
          <Text style={[styles.miniChipText, paymentFilter === 'UPI' && styles.miniChipTextActive]}>UPI</Text>
        </TouchableOpacity>
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
            booking={item as unknown as Booking}
            onPress={() => router.push(`/booking-detail/${item.id}` as any)}
            onEdit={() => router.push(`/booking-detail/${item.id}` as any)}
            onCheckout={() => handleCheckoutBooking(item)}
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
  exportIcon: {
    padding: 6,
    marginLeft: 8,
  },
  filterLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    marginRight: 4,
  },
  miniChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  miniChipActive: {
    backgroundColor: '#fff',
    borderColor: '#dc2626',
  },
  miniChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  miniChipTextActive: {
    color: '#dc2626',
    fontWeight: '700',
  },
});

export default BookingsScreen;
