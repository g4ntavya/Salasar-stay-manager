import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchAllRooms,
  RtdbRoom,
  compareRoomIds,
  fetchAdvanceBookings,
  AdvanceBooking,
  subscribeToRoomStatusGrid,
  subscribeToActiveBookings,
  updateRoomCleanedStatus,
  normalizeRoomId,
  normalizeBookingStatus,
} from '../../src/utils/rtdbService';
import { localDay } from '../../src/utils/date';
import { TOTAL_ROOMS } from '../../src/utils/roomConstants';
import { defaultRoomSeeds } from '../../src/utils/defaultRooms';
import {
  AppText,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  PressableScale,
  ScreenHeader,
  Segmented,
  StatusPill,
  colors,
  formatRupees,
  haptic,
  fonts,
  radius,
  space,
  statusColors,
  GUTTER,
  useTabBarSpace,
  type StatusTone,
} from '../../src/ui';

type ViewMode = 'rooms' | 'advance';

type RoomWithBookingFlag = RtdbRoom & { hasFutureBooking?: boolean };

// Room 1 is not let out.
const EXCLUDED = new Set(['1']);
const SEED_ROOMS: RoomWithBookingFlag[] = defaultRoomSeeds
  .slice(0, TOTAL_ROOMS)
  .filter(seed => !EXCLUDED.has(seed.room_number))
  .map(seed => ({
    key: seed.room_number,
    room_no: seed.room_number,
    beds: seed.capacity ?? 1,
    type: seed.type,
    ac_make: seed.ac_make,
    remarks: seed.remarks,
    is_available: true,
    current_booking_id: null,
  }));

/** Live rooms over the built-in list, so every room shows even before the first sync. */
const mergeWithSeeds = (live: RoomWithBookingFlag[]): RoomWithBookingFlag[] => {
  const byNo = new Map(SEED_ROOMS.map(r => [r.room_no, r]));
  live.forEach(room => {
    if (!EXCLUDED.has(room.room_no)) byNo.set(room.room_no, { ...room, is_available: room.is_available !== false });
  });
  return Array.from(byNo.values()).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
};

const RoomsScreen = () => {
  const router = useRouter();
  const bottomSpace = useTabBarSpace();
  const [viewMode, setViewMode] = useState<ViewMode>('rooms');
  const [rooms, setRooms] = useState<RoomWithBookingFlag[]>(SEED_ROOMS);
  const [advanceBookings, setAdvanceBookings] = useState<AdvanceBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<any[]>([]);
  const { width: screenWidth } = useWindowDimensions();
  const cellWidth = Math.floor((screenWidth - GUTTER * 2 - CELL_GAP * 2) / 3);

  // Opened with ?view=advance (after saving an advance booking).
  const params = useLocalSearchParams<{ view?: string; filter?: string }>();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FREE' | 'OCCUPIED' | 'CLEANING'>('ALL');
  const paramKey = params.view || params.filter ? `${params.view ?? ''}|${params.filter ?? ''}` : '';
  const [handledKey, setHandledKey] = useState('');
  if (paramKey !== handledKey) {
    setHandledKey(paramKey);
    if (params.view === 'advance') setViewMode('advance');
    if (params.filter === 'free' || params.filter === 'cleaning') {
      setViewMode('rooms');
      setStatusFilter(params.filter === 'free' ? 'FREE' : 'CLEANING');
    }
  }
  useEffect(() => {
    // Clear them so the same link works again next time.
    if (paramKey) router.setParams({ view: undefined, filter: undefined });
  }, [paramKey, router]);

  // Room flags and current stays both stream live; the grid needs no manual refresh.
  useEffect(
    () =>
      subscribeToRoomStatusGrid(data => {
        setRooms(mergeWithSeeds(data));
        setRefreshing(false);
      }),
    []
  );
  const loadAdvanceBookings = useCallback(async () => {
    try {
      setAdvanceBookings(await fetchAdvanceBookings());
    } catch (error) {
      console.warn('[Rooms] Could not load arrivals:', error);
    }
  }, []);

  // Arrivals are derived from the live list of current stays, so they follow it.
  useEffect(
    () =>
      subscribeToActiveBookings(list => {
        setActive(list);
        loadAdvanceBookings();
      }),
    [loadAdvanceBookings]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setRooms(mergeWithSeeds(await fetchAllRooms()));
    } catch (error) {
      console.warn('[Rooms] Refresh failed:', error);
    }
    await loadAdvanceBookings();
    setRefreshing(false);
  }, [loadAdvanceBookings]);

  // Who is in (or booked into) each room.
  const guestByRoom = useMemo(() => {
    const today = localDay();
    const map = new Map<string, { name: string; inDay: string }>();
    for (const b of active) {
      const s = normalizeBookingStatus(b.status);
      if (s === 'CHECKED_OUT' || s === 'CANCELLED') continue;
      const roomNo = normalizeRoomId(b.roomNo);
      const current = map.get(roomNo);
      // Prefer the guest staying now over a later arrival.
      if (!current || (b.checkInDay <= today && current.inDay > today) || (b.checkInDay < current.inDay && current.inDay > today)) {
        map.set(roomNo, { name: b.guestName || 'Guest', inDay: b.checkInDay || '' });
      }
    }
    return map;
  }, [active]);


  const roomState = (room: RoomWithBookingFlag): { tone: StatusTone; label: string } => {
    if (room.is_available === false || room.current_booking_id) return { tone: 'occupied', label: 'Occupied' };
    if (room.hasFutureBooking) return { tone: 'reserved', label: 'Reserved' };
    return { tone: 'available', label: 'Free' };
  };
  const cleaning = (room: RoomWithBookingFlag) => {
    const c = (room.cleaned_status || 'CLEANED').toUpperCase();
    if (c === 'DIRTY') return { label: 'Needs cleaning', short: 'Dirty', tone: 'cleaning' as StatusTone, icon: 'alert-circle-outline' as const };
    if (c === 'CLEANING') return { label: 'Being cleaned', short: 'Cleaning', tone: 'reserved' as StatusTone, icon: 'time-outline' as const };
    return { label: 'Clean', short: 'Clean', tone: 'available' as StatusTone, icon: 'checkmark-circle-outline' as const };
  };

  const counts = {
    free: rooms.filter(r => roomState(r).tone === 'available').length,
    occupied: rooms.filter(r => roomState(r).tone === 'occupied').length,
    cleaning: rooms.filter(r => ['DIRTY', 'CLEANING'].includes((r.cleaned_status || '').toUpperCase())).length,
  };

  const visibleRooms = rooms.filter(r => {
    if (statusFilter === 'FREE') return roomState(r).tone === 'available';
    if (statusFilter === 'OCCUPIED') return roomState(r).tone === 'occupied';
    if (statusFilter === 'CLEANING') return ['DIRTY', 'CLEANING'].includes((r.cleaned_status || '').toUpperCase());
    return true;
  });

  const cycleCleaning = async (room: RoomWithBookingFlag) => {
    const current = (room.cleaned_status || 'CLEANED').toUpperCase();
    const next = current === 'CLEANED' ? 'DIRTY' : current === 'DIRTY' ? 'CLEANING' : 'CLEANED';
    haptic.tap();
    setRooms(prev => prev.map(r => (r.room_no === room.room_no ? { ...r, cleaned_status: next } : r)));
    try {
      await updateRoomCleanedStatus(room.room_no, next);
    } catch {
      setRooms(prev => prev.map(r => (r.room_no === room.room_no ? { ...r, cleaned_status: current } : r)));
      Alert.alert('Could not update', 'Check your connection and try again.');
    }
  };

  const openRoom = (room: RoomWithBookingFlag) => {
    if (room.current_booking_id) router.push(`/booking-detail/${room.current_booking_id}` as any);
    else router.push({ pathname: '/new-booking', params: { room: room.room_no } });
  };

  const fmtArrival = (day: string) => {
    const d = new Date(`${day}T12:00:00`);
    return isNaN(d.getTime()) ? { day: '—', month: '', weekday: '' } : { day: String(d.getDate()), month: d.toLocaleString('en-IN', { month: 'short' }), weekday: d.toLocaleString('en-IN', { weekday: 'short' }) };
  };

  const renderRoom = ({ item }: { item: RoomWithBookingFlag }) => {
    const st = roomState(item);
    const cl = cleaning(item);
    const look = ROOM_LOOK[st.tone as keyof typeof ROOM_LOOK] ?? ROOM_LOOK.available;
    const guest = guestByRoom.get(normalizeRoomId(item.room_no));
    const detail =
      st.tone === 'occupied'
        ? guest
          ? guest.name.split(' ')[0]
          : 'Guest in room'
        : st.tone === 'reserved'
          ? guest
            ? `From ${fmtShort(guest.inDay)}`
            : 'Booked ahead'
          : cl.tone === 'available'
            ? 'Ready'
            : cl.label;
    const tinted = st.tone !== 'available';
    return (
      <View style={[styles.roomCell, { width: cellWidth }]}>
        <Card
          onPress={() => openRoom(item)}
          elevated={!tinted}
          style={[styles.roomCard, { backgroundColor: look.bg, borderColor: look.border }]}
          accessibilityLabel={`Room ${item.room_no}, ${st.label}${guest ? `, ${guest.name}` : ''}`}
        >
          <View style={styles.roomTop}>
            <AppText variant="title2" numberOfLines={1} style={styles.roomNo}>
              {shortRoom(item.room_no)}
            </AppText>
            <View style={[styles.badge, { backgroundColor: look.fg }]}>
              <Ionicons name={look.icon} size={13} color={colors.inkInverse} />
            </View>
          </View>
          <AppText variant="caption" tone="soft" numberOfLines={1}>
            {roomMeta(item)}
          </AppText>
          <AppText variant="caption" color={look.fg} numberOfLines={1} style={styles.stateLabel}>
            {look.label}
          </AppText>
          <AppText variant="caption" color={tinted ? colors.ink : colors.inkMuted} numberOfLines={1}>
            {detail}
          </AppText>
          <PressableScale
            onPress={() => cycleCleaning(item)}
            scaleTo={0.92}
            hitSlop={6}
            style={[
              styles.cleanChip,
              tinted && styles.cleanChipOnTint,
              cl.tone !== 'available' && { backgroundColor: statusColors[cl.tone].bg, borderColor: 'transparent' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${cl.label}. Tap to change housekeeping status`}
          >
            <Ionicons name={cl.icon} size={12} color={cl.tone === 'available' ? colors.inkSoft : statusColors[cl.tone].fg} />
            <AppText variant="caption" color={cl.tone === 'available' ? colors.inkSoft : statusColors[cl.tone].fg} numberOfLines={1} style={{ fontSize: 11 }}>
              {cl.short}
            </AppText>
          </PressableScale>
        </Card>
      </View>
    );
  };

  const renderAdvance = ({ item }: { item: AdvanceBooking }) => {
    const a = fmtArrival(item.arrivalDate);
    return (
      <Card onPress={() => router.push(`/booking-detail/${item.id}` as any)} style={styles.advCard} accessibilityLabel={`${item.guestName} arriving ${item.arrivalDate}`}>
        <View style={styles.advDate}>
          <AppText variant="overline" tone="gold" style={{ fontSize: 10 }}>
            {a.weekday}
          </AppText>
          <AppText variant="numberSm">{a.day}</AppText>
          <AppText variant="caption" tone="muted">
            {a.month}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {item.guestName}
          </AppText>
          <AppText variant="footnote" tone="muted" numberOfLines={1}>
            {item.roomNumbers.length ? `Room ${item.roomNumbers.join(', ')}` : 'Room not assigned'} · {item.membersCount} guest{item.membersCount > 1 ? 's' : ''}
          </AppText>
          <View style={styles.advMoney}>
            <StatusPill tone={item.tokenPaid ? 'available' : 'cancelled'} label={item.tokenPaid ? `Token ${formatRupees(item.tokenAmount)}` : 'No token'} size="sm" />
            <AppText variant="callout" tone="soft">
              of {formatRupees(item.totalAmount)}
            </AppText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </Card>
    );
  };

  const header = (
    <View>
      <ScreenHeader
        title={viewMode === 'rooms' ? 'Rooms' : 'Arriving'}
        subtitle={viewMode === 'rooms' ? `${counts.free} free · ${counts.occupied} occupied · ${counts.cleaning} to clean` : `${advanceBookings.length} advance booking${advanceBookings.length === 1 ? '' : 's'}`}
      />
      <Segmented
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: 'rooms', label: 'Rooms' },
          { value: 'advance', label: `Arriving${advanceBookings.length ? ` ${advanceBookings.length}` : ''}` },
        ]}
        style={{ marginBottom: space.md }}
      />
      {viewMode === 'rooms' ? (
        <ChipRow style={{ marginBottom: space.lg }}>
          <Chip label="All" count={rooms.length} selected={statusFilter === 'ALL'} onPress={() => setStatusFilter('ALL')} />
          <Chip label="Free" count={counts.free} selected={statusFilter === 'FREE'} onPress={() => setStatusFilter('FREE')} />
          <Chip label="Occupied" count={counts.occupied} selected={statusFilter === 'OCCUPIED'} onPress={() => setStatusFilter('OCCUPIED')} />
          <Chip label="To clean" count={counts.cleaning} selected={statusFilter === 'CLEANING'} onPress={() => setStatusFilter('CLEANING')} />
        </ChipRow>
      ) : (
        <View style={{ height: space.sm }} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {viewMode === 'rooms' ? (
        <FlatList
          key="rooms"
          data={visibleRooms}
          renderItem={renderRoom}
          keyExtractor={item => `room-${item.room_no}`}
          numColumns={3}
          columnWrapperStyle={{ gap: CELL_GAP }}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomSpace }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListEmptyComponent={<EmptyState icon="bed-outline" title="No rooms here" message="Try another filter." />}
        />
      ) : (
        <FlatList
          key="advance"
          data={advanceBookings}
          renderItem={renderAdvance}
          keyExtractor={item => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomSpace }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title="No upcoming arrivals"
              message="Advance bookings with a token show up here."
              action={{ label: 'New booking', icon: 'add', onPress: () => router.push('/new-booking') }}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const CELL_GAP = 10;

/** Room tile looks: taken rooms are filled with colour, free rooms stay white, so the grid reads at a glance. */
const ROOM_LOOK = {
  available: { bg: colors.surface, border: colors.line, fg: '#2E7A57', icon: 'checkmark' as const, label: 'Free' },
  occupied: { bg: '#F6DDD3', border: '#EBC3B3', fg: '#9C3A24', icon: 'person' as const, label: 'Occupied' },
  reserved: { bg: '#F4E6CC', border: '#E6CFA2', fg: '#86601F', icon: 'time' as const, label: 'Reserved' },
};
const shortRoom = (roomNo: string) => roomNo.replace(/^Basement\s*/i, 'B');
const fmtShort = (day: string) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const roomMeta = (room: RtdbRoom) => {
  const type = String(room.type || '').replace(/standard/i, '').trim();
  const beds = room.beds ? `${room.beds} bed${room.beds === 1 ? '' : 's'}` : '';
  return [type, beds].filter(Boolean).join(' · ') || 'Room';
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: GUTTER },
  roomCell: { marginBottom: CELL_GAP },
  roomCard: { padding: space.md, borderWidth: 1, borderRadius: radius.md },
  roomTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  roomNo: { fontSize: 22, lineHeight: 28, flexShrink: 1 },
  badge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stateLabel: { marginTop: space.sm, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  cleanChipOnTint: { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: 'transparent' },
  cleanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: space.sm,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  advCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  advDate: { width: 58, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.goldSoft },
  advMoney: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
});

export default RoomsScreen;
