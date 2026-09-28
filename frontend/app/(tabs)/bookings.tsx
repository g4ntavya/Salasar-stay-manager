import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Chip,
  ChipRow,
  EmptyState,
  Field,
  IconButton,
  PressableScale,
  ScreenHeader,
  Segmented,
  SkeletonList,
  colors,
  space,
  GUTTER,
  useTabBarSpace,
} from '../../src/ui';
import { Booking } from '../../src/types';
import BookingItem from '../../src/components/BookingItem';
import { exportCsvToDevice } from '../../src/utils/exportCsv';
import { checkOutStay } from '../../src/utils/checkoutFlow';
import { getCached, setCached } from '../../src/utils/cache';
import { normalizeBookingStatus, fetchBookingsEnriched, subscribeToRecentStays, type BookingEnriched } from '../../src/utils/rtdbService';

type StatusFilter = 'ALL' | 'IN' | 'OUT';

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
};
const stayDate = (b: BookingEnriched) => toDate(b.check_in) || toDate(b.checkInDate) || toDate(b.created_at);
const monthKeyOf = (d: Date) => `${d.getMonth() + 1}-${d.getFullYear()}`;
const monthLabel = (key: string) => {
  const [m, y] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

const BookingsScreen = () => {
  const router = useRouter();
  const bottomSpace = useTabBarSpace();
  const [bookings, setBookings] = useState<BookingEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('recent');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'UPI'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<FlatList<BookingEnriched>>(null);

  /* ---------- Data: last known list instantly, then live ---------- */

  useEffect(() => {
    let live = false;
    getCached<BookingEnriched[]>('bookings:list').then(cached => {
      if (!live && Array.isArray(cached) && cached.length) {
        setBookings(cached);
        setLoading(false);
      }
    });
    // New bookings, checkouts and edits from any phone arrive here by themselves.
    const unsubscribe = subscribeToRecentStays(
      stays => {
        live = true;
        setBookings(stays);
        setLoading(false);
        setRefreshing(false);
        setCached('bookings:list', stays);
      },
      error => {
        console.warn('[Bookings] Live list failed:', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // The list is live; pulling down just re-reads it once, in case the connection was asleep.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const fresh = await fetchBookingsEnriched().catch(() => null);
    if (fresh) setBookings(fresh);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  /* ---------- Arriving from New booking or Home ---------- */

  const params = useLocalSearchParams<{ highlight?: string; filter?: string }>();
  const paramKey = params.highlight || params.filter ? `${params.highlight ?? ''}|${params.filter ?? ''}` : '';
  const [handledKey, setHandledKey] = useState('');
  if (paramKey !== handledKey) {
    setHandledKey(paramKey);
    if (params.filter === 'in') setStatusFilter('IN');
    if (params.highlight) {
      setHighlightId(params.highlight);
      setSearchQuery('');
      setDebouncedSearch('');
      setSelectedMonth('recent');
    }
  }

  useEffect(() => {
    if (!paramKey) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    // Clear them so the same link works again next time.
    router.setParams({ highlight: undefined, filter: undefined });
  }, [paramKey, router]);


  /* ---------- Actions ---------- */

  const checkout = async (booking: BookingEnriched): Promise<boolean> => {
    const ok = await checkOutStay(booking.id, { name: booking.customer?.name, rooms: booking.room_numbers });
    if (!ok) return false;
    // The live list reflects the checkout on its own.
    return true;
  };

  /* ---------- Filters ---------- */

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    const [month, year] = selectedMonth === 'recent' ? [0, 0] : selectedMonth.split('-').map(Number);
    return bookings.filter(b => {
      if (month) {
        const d = stayDate(b);
        if (!d || d.getMonth() + 1 !== month || d.getFullYear() !== year) return false;
      }
      // Split payments (e.g. "1000p, 500c") count under both Cash and UPI.
      if (paymentFilter !== 'ALL' && b.payment_mode !== paymentFilter && b.payment_mode !== 'MIXED') return false;
      if (
        query &&
        !b.customer?.name?.toLowerCase().includes(query) &&
        !b.customer?.mobile?.includes(query) &&
        !b.room_numbers?.some(rn => rn.toLowerCase().includes(query))
      )
        return false;
      return true;
    });
  }, [bookings, debouncedSearch, selectedMonth, paymentFilter]);

  const visible = useMemo(
    () =>
      filtered.filter(b => {
        const out = normalizeBookingStatus(b.status) === 'CHECKED_OUT';
        return statusFilter === 'ALL' || (statusFilter === 'OUT' ? out : !out);
      }),
    [filtered, statusFilter]
  );

  // The mark fades a few seconds after the new stay is actually on screen (it may still be loading).
  const highlightShown = !!highlightId && visible.some(b => b.id === highlightId);
  useEffect(() => {
    if (!highlightShown) return;
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightShown]);

  const statusCounts = useMemo(() => {
    const inHouse = bookings.filter(b => normalizeBookingStatus(b.status) !== 'CHECKED_OUT').length;
    return { all: bookings.length, inHouse };
  }, [bookings]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    bookings.forEach(b => {
      const d = stayDate(b);
      if (d) months.add(monthKeyOf(d));
    });
    return Array.from(months).sort((a, b) => {
      const [ma, ya] = a.split('-').map(Number);
      const [mb, yb] = b.split('-').map(Number);
      return ya === yb ? mb - ma : yb - ya;
    });
  }, [bookings]);

  const exportCsv = async () => {
    if (visible.length === 0) {
      Alert.alert('Nothing to export', 'No stays match the current filters.');
      return;
    }
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const day = (v: unknown) => toDate(v)?.toLocaleDateString('en-IN') ?? '';
    const header = 'Booking ID,Guest Name,Mobile,Rooms,Check-in,Check-out,Status,Amount,Payment,Entered As\n';
    const rows = visible
      .map(b =>
        [
          b.id,
          q(b.customer?.name || 'Guest'),
          q(b.customer?.mobile),
          q((b.room_numbers || []).join('; ')),
          day(b.check_in),
          day(b.check_out_expected),
          q(b.status),
          b.total_amount || 0,
          q(b.payment_mode),
          q(b.customer?.amount),
        ].join(',')
      )
      .join('\n');
    await exportCsvToDevice({ filename: `Bookings_${selectedMonth.replace(/-/g, '_')}.csv`, csv: header + rows });
  };

  /* ---------- UI ---------- */

  const header = (
    <View>
      <ScreenHeader
        title="Bookings"
        subtitle={loading ? 'Loading…' : `${visible.length} ${visible.length === 1 ? 'stay' : 'stays'}`}
        right={<IconButton icon="download-outline" onPress={exportCsv} accessibilityLabel="Export bookings as CSV" />}
      />
      <Field
        icon="search-outline"
        placeholder="Search name, mobile or room"
        value={searchQuery}
        onChangeText={setSearchQuery}
        returnKeyType="search"
        style={{ marginBottom: space.md }}
        right={
          searchQuery ? (
            <PressableScale onPress={() => setSearchQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
            </PressableScale>
          ) : null
        }
      />
      <Segmented
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { value: 'ALL', label: `All ${statusCounts.all || ''}`.trim() },
          { value: 'IN', label: `In house ${statusCounts.inHouse || ''}`.trim() },
          { value: 'OUT', label: 'Checked out' },
        ]}
        style={{ marginBottom: space.md }}
      />
      <ChipRow style={{ marginBottom: space.lg }}>
        <Chip label="Recent" selected={selectedMonth === 'recent'} onPress={() => setSelectedMonth('recent')} />
        {monthOptions.map(key => (
          <Chip key={key} label={monthLabel(key)} selected={selectedMonth === key} onPress={() => setSelectedMonth(key)} />
        ))}
        <View style={styles.chipDivider} />
        <Chip label="Cash" icon="cash-outline" selected={paymentFilter === 'CASH'} onPress={() => setPaymentFilter(p => (p === 'CASH' ? 'ALL' : 'CASH'))} />
        <Chip label="UPI" icon="qr-code-outline" selected={paymentFilter === 'UPI'} onPress={() => setPaymentFilter(p => (p === 'UPI' ? 'ALL' : 'UPI'))} />
      </ChipRow>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* No mount/unmount (layout) animations in this list: on Android they crash when the
          list swaps from its loading state to live rows. The new-stay highlight is a plain style animation. */}
      <FlatList
        // Android's offscreen-row clipping can re-add a view that still has a parent and crash
        // the app (seen right after sign-in, when the list fills for the first time).
        removeClippedSubviews={false}
        ref={listRef}
        data={loading && bookings.length === 0 ? [] : visible}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <BookingItem
            booking={item as unknown as Booking}
            highlight={item.id === highlightId}
            onPress={() => router.push(`/booking-detail/${item.id}`)}
            onEdit={() => router.push(`/edit-booking/${item.id}`)}
            onCheckout={() => checkout(item)}
          />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
        ListEmptyComponent={
          loading ? (
            <SkeletonList count={4} height={150} />
          ) : (
            <EmptyState
              icon="calendar-clear-outline"
              title={debouncedSearch ? 'No matches' : 'No stays here'}
              message={debouncedSearch ? `Nothing matches “${debouncedSearch}”.` : 'Try another month or filter.'}
              action={debouncedSearch ? undefined : { label: 'New booking', icon: 'add', onPress: () => router.push('/new-booking') }}
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: GUTTER },
  chipDivider: { width: 1, height: 20, backgroundColor: colors.lineStrong, alignSelf: 'center', marginHorizontal: space.xs },
});

export default BookingsScreen;
