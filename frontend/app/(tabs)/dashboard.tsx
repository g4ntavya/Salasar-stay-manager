import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import {
  subscribeToDashboardCounts,
  subscribeToRoomStatusGrid,
  subscribeToActiveBookings,
  subscribeToDayStats,
  compareRoomIds,
  normalizeBookingStatus,
  normalizeRoomId,
  type RtdbRoom,
} from '../../src/utils/rtdbService';
import { TOTAL_ROOMS } from '../../src/utils/roomConstants';
import { getCached, setCached } from '../../src/utils/cache';
import { localDay, addDays } from '../../src/utils/date';
import { checkOutStay } from '../../src/utils/checkoutFlow';
import {
  AppText,
  Avatar,
  Button,
  Card,
  EmptyState,
  PressableScale,
  Row,
  Screen,
  Section,
  Skeleton,
  SwipeRow,
  colors,
  formatRupees,
  radius,
  space,
  statusColors,
  type StatusTone,
} from '../../src/ui';

type GridRoom = RtdbRoom & { hasFutureBooking: boolean };
type Counts = { totalRooms: number; availableRooms: number; occupiedRooms: number; occupiedRoomNos: string[] };
type Stay = { id: string; name: string; rooms: string[]; inDay: string; outDay: string; members: number };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const floorOf = (roomNo: string) => {
  if (/^\d{1,2}$/.test(roomNo)) return 'Ground floor';
  if (/^1\d{2}$/.test(roomNo)) return 'First floor';
  if (/^2\d{2}$/.test(roomNo)) return 'Second floor';
  if (/^3\d{2}$/.test(roomNo)) return 'Third floor';
  return 'Halls & basement';
};
const FLOOR_ORDER = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Halls & basement'];
const shortRoom = (roomNo: string) => roomNo.replace(/^Basement\s*/i, 'B');

const roomTone = (room: GridRoom): StatusTone => {
  if (!room.is_available || room.current_booking_id) return 'occupied';
  if (room.hasFutureBooking) return 'reserved';
  const cleaned = (room.cleaned_status || '').toUpperCase();
  if (cleaned === 'DIRTY' || cleaned === 'CLEANING') return 'cleaning';
  return 'available';
};

/** Room map colours: occupied rooms are solid so free rooms stand out at a glance. */
const TILE_LOOK: Record<string, { bg: string; fg: string }> = {
  occupied: { bg: statusColors.occupied.fg, fg: colors.inkInverse },
  reserved: { bg: statusColors.reserved.bg, fg: statusColors.reserved.fg },
  cleaning: { bg: statusColors.cleaning.bg, fg: statusColors.cleaning.fg },
  available: { bg: statusColors.available.bg, fg: statusColors.available.fg },
};

const LEGEND: { tone: StatusTone; label: string }[] = [
  { tone: 'available', label: 'Free' },
  { tone: 'occupied', label: 'Occupied' },
  { tone: 'reserved', label: 'Reserved' },
  { tone: 'cleaning', label: 'Cleaning' },
];

const fmtShortDate = (day: string) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const fmtArrival = (day: string, today: string) =>
  day === today
    ? 'Today'
    : day === addDays(today, 1)
      ? 'Tomorrow'
      : new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/* ---------------- Occupancy ring ---------------- */

const Ring: React.FC<{ value: number; size?: number; stroke?: number }> = ({ value, size = 104, stroke = 10 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.goldSoft}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText variant="title2" color={colors.inkInverse}>
        {Math.round(pct * 100)}%
      </AppText>
    </View>
  );
};

/* ---------------- Today tile ---------------- */

const TodayTile: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  hint?: string;
  hintTone?: 'danger' | 'muted';
  tone: { fg: string; bg: string };
  onPress: () => void;
}> = ({ icon, label, value, hint, hintTone = 'muted', tone, onPress }) => (
  <PressableScale onPress={onPress} scaleTo={0.96} style={styles.todayTile} accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? ''}`}>
    <View style={[styles.todayIcon, { backgroundColor: tone.bg }]}>
      <Ionicons name={icon} size={17} color={tone.fg} />
    </View>
    {value == null ? (
      <Skeleton width={36} height={24} style={{ marginTop: space.sm }} />
    ) : (
      <AppText variant="numberSm" numberOfLines={1} style={{ marginTop: space.sm, fontSize: value.length > 6 ? 18 : 22 }}>
        {value}
      </AppText>
    )}
    <AppText variant="caption" tone="soft" numberOfLines={1}>
      {label}
    </AppText>
    <AppText variant="caption" tone={hintTone} numberOfLines={1} style={{ fontSize: 11 }}>
      {hint || ' '}
    </AppText>
  </PressableScale>
);

/* ---------------- Screen ---------------- */

const DashboardScreen = () => {
  const router = useRouter();
  const { profile } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [active, setActive] = useState<any[] | null>(null);
  const [collected, setCollected] = useState<{ revenue: number; count: number } | null>(null);
  const [liveError, setLiveError] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const tileSize = gridWidth ? Math.floor((gridWidth - TILE_GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const redirected = useRef(false);
  const today = localDay();

  // Growth users only see analytics.
  useEffect(() => {
    if (profile?.role === 'GROWTH' && !redirected.current) {
      redirected.current = true;
      router.replace('/analytics');
    }
  }, [profile?.role, router]);

  // Last known numbers show instantly; the live listeners take over within a moment.
  useEffect(() => {
    getCached<Counts>('dashboard:stats').then(cached => cached && setCounts(prev => prev ?? cached));
  }, []);

  useEffect(() => {
    const onError = () => setLiveError(true);
    const unsubCounts = subscribeToDashboardCounts(data => {
      setLiveError(false);
      setCounts(data);
      setCached('dashboard:stats', data);
    }, onError);
    const unsubGrid = subscribeToRoomStatusGrid(data => setRooms(data), onError);
    const unsubActive = subscribeToActiveBookings(data => setActive(data), onError);
    const unsubToday = subscribeToDayStats(today, setCollected);
    return () => {
      unsubCounts();
      unsubGrid();
      unsubActive();
      unsubToday();
    };
  }, [today]);

  const { inHouse, dueToday, overdue, checkedInToday, arriving } = useMemo(() => {
    const stays = new Map<string, Stay>();
    for (const b of active || []) {
      const s = normalizeBookingStatus(b.status);
      if (s === 'CHECKED_OUT' || s === 'CANCELLED') continue;
      const key = b.stayId || `${b.customerId}_${b.checkInDay}`;
      const stay: Stay = stays.get(key) || {
        id: b.id,
        name: b.guestName || 'Guest',
        rooms: [],
        inDay: b.checkInDay || '',
        outDay: b.checkOutDay || '',
        members: Number(b.membersCount) || 0,
      };
      const rn = normalizeRoomId(b.roomNo);
      if (rn && !stay.rooms.includes(rn)) stay.rooms.push(rn);
      stays.set(key, stay);
    }
    const all = Array.from(stays.values()).map(s => ({ ...s, rooms: s.rooms.sort(compareRoomIds) }));
    // Guests who should leave first come first: past check-out, then leaving today, then the rest.
    const current = all.filter(s => s.inDay <= today).sort((a, b) => (a.outDay || '').localeCompare(b.outDay || ''));
    return {
      inHouse: current,
      dueToday: current.filter(s => s.outDay === today).length,
      overdue: current.filter(s => s.outDay && s.outDay < today).length,
      checkedInToday: current.filter(s => s.inDay === today).length,
      arriving: all.filter(s => s.inDay > today).sort((a, b) => a.inDay.localeCompare(b.inDay)),
    };
  }, [active, today]);

  const floors = useMemo(() => {
    const grouped = new Map<string, GridRoom[]>();
    for (const room of [...rooms].sort((a, b) => compareRoomIds(a.room_no, b.room_no))) {
      const floor = floorOf(room.room_no);
      if (!grouped.has(floor)) grouped.set(floor, []);
      grouped.get(floor)!.push(room);
    }
    return FLOOR_ORDER.filter(f => grouped.has(f)).map(f => ({ floor: f, rooms: grouped.get(f)! }));
  }, [rooms]);

  const total = counts?.totalRooms || TOTAL_ROOMS;
  const occupied = counts?.occupiedRooms ?? 0;
  const free = Math.max(0, total - occupied);
  const toClean = rooms.filter(r => ['DIRTY', 'CLEANING'].includes((r.cleaned_status || '').toUpperCase())).length;
  const firstName = (profile?.full_name || '').split(' ')[0];
  const dateLine = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const openRoom = (room: GridRoom) => {
    if (room.current_booking_id) router.push(`/booking-detail/${room.current_booking_id}`);
    else router.push({ pathname: '/new-booking', params: { room: room.room_no } });
  };
  const showInHouse = () => router.navigate({ pathname: '/bookings', params: { filter: 'in' } });

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="footnote" tone="soft">
            {dateLine}
          </AppText>
          <AppText variant="title1" style={{ marginTop: 2 }} numberOfLines={1}>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </AppText>
        </View>
        <PressableScale onPress={() => router.push('/profile')} scaleTo={0.92} accessibilityRole="button" accessibilityLabel="Profile and settings">
          <Avatar name={profile?.full_name} size={46} />
        </PressableScale>
      </View>

      {liveError ? (
        <Card tone="outline" style={styles.errorCard}>
          <Row gap={space.sm}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <AppText variant="footnote" tone="soft" style={{ flex: 1 }}>
              Can’t reach live data. Showing the last known numbers.
            </AppText>
          </Row>
        </Card>
      ) : null}

      {/* Occupancy */}
      <LinearGradient colors={[colors.brand, colors.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flex: 1 }}>
          <AppText variant="callout" color="rgba(255,255,255,0.78)">
            Occupied tonight
          </AppText>
          {counts ? (
            <AppText variant="display" color={colors.inkInverse} style={{ marginTop: space.sm }}>
              {occupied}
              <AppText variant="title2" color="rgba(255,255,255,0.7)">
                {' '}
                / {total}
              </AppText>
            </AppText>
          ) : (
            <Skeleton width={120} height={36} style={{ marginTop: space.sm, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          )}
          <AppText variant="footnote" color="rgba(255,255,255,0.8)" style={{ marginTop: space.xs }}>
            {active ? (checkedInToday ? `${checkedInToday} checked in today` : 'No check-ins yet today') : ' '}
          </AppText>
        </View>
        <Ring value={total ? occupied / total : 0} />
      </LinearGradient>

      {/* Today */}
      <View style={styles.todayRow}>
        <TodayTile
          icon="log-out-outline"
          label="To check out"
          value={active ? String(inHouse.length) : null}
          hint={!active ? undefined : overdue ? `${overdue} past check-out` : dueToday ? `${dueToday} leaving today` : 'None due today'}
          hintTone={overdue ? 'danger' : 'muted'}
          tone={statusColors.occupied}
          onPress={showInHouse}
        />
        <TodayTile
          icon="bed-outline"
          label="Free rooms"
          value={counts ? String(free) : null}
          hint={!rooms.length ? undefined : toClean ? `${toClean} to clean` : 'All clean'}
          tone={statusColors.available}
          onPress={() => router.navigate({ pathname: '/rooms', params: { filter: 'free' } })}
        />
        <TodayTile
          icon="wallet-outline"
          label="Collected today"
          value={collected ? formatRupees(collected.revenue) : null}
          hint={!collected ? undefined : collected.count ? `${collected.count} check-out${collected.count > 1 ? 's' : ''}` : 'None yet'}
          tone={statusColors.reserved}
          onPress={() => router.push('/reports')}
        />
      </View>

      {/* Quick actions */}
      <View style={styles.actions}>
        {[
          { icon: 'add-circle-outline' as const, label: 'New booking', onPress: () => router.push('/new-booking') },
          { icon: 'log-out-outline' as const, label: 'Check out', onPress: showInHouse },
          { icon: 'search-outline' as const, label: 'Find guest', onPress: () => router.navigate('/customers') },
          { icon: 'stats-chart-outline' as const, label: 'Reports', onPress: () => router.push('/reports') },
        ].map(a => (
          <PressableScale key={a.label} onPress={a.onPress} scaleTo={0.94} style={styles.action} accessibilityRole="button" accessibilityLabel={a.label}>
            <View style={styles.actionIcon}>
              <Ionicons name={a.icon} size={22} color={colors.brand} />
            </View>
            <AppText variant="caption" tone="soft" align="center" numberOfLines={1}>
              {a.label}
            </AppText>
          </PressableScale>
        ))}
      </View>

      {/* Arriving: only shown when someone is actually expected */}
      {arriving.length > 0 ? (
        <Section
          title="Arriving"
          caption={`${arriving.length} advance booking${arriving.length === 1 ? '' : 's'}`}
          action={arriving.length > 3 ? { label: 'See all', onPress: () => router.navigate({ pathname: '/rooms', params: { view: 'advance' } }) } : undefined}
        >
          <Card padded={false}>
            {arriving.slice(0, 3).map((s, i) => (
              <PressableScale
                key={s.id}
                onPress={() => router.push(`/booking-detail/${s.id}`)}
                scaleTo={0.985}
                accessibilityRole="button"
                accessibilityLabel={`${s.name} arriving ${fmtArrival(s.inDay, today)}`}
              >
                <View style={[styles.arrivalRow, i > 0 && styles.rowLine]}>
                  <View style={styles.arrivalDate}>
                    <AppText variant="caption" color={statusColors.reserved.fg} numberOfLines={1}>
                      {fmtArrival(s.inDay, today)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {s.name}
                    </AppText>
                    <AppText variant="footnote" tone="muted" numberOfLines={1}>
                      Room {s.rooms.join(', ')}
                      {s.members ? ` · ${s.members} ${s.members === 1 ? 'guest' : 'guests'}` : ''}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} />
                </View>
              </PressableScale>
            ))}
          </Card>
        </Section>
      ) : null}

      {/* In house */}
      <Section
        title="In house"
        caption={active && inHouse.length ? 'Swipe left on a guest for more' : undefined}
        action={inHouse.length > 6 ? { label: `See all ${inHouse.length}`, onPress: showInHouse } : undefined}
      >
        {!active ? (
          <Card>
            <Skeleton width="70%" />
            <Skeleton width="45%" style={{ marginTop: space.sm }} />
          </Card>
        ) : inHouse.length === 0 ? (
          <Card>
            <EmptyState icon="bed-outline" title="No guests in house" message="New check-ins will show up here." style={{ paddingVertical: space.xl }} />
          </Card>
        ) : (
          inHouse.slice(0, 6).map(s => {
            const isOverdue = !!s.outDay && s.outDay < today;
            const leavingToday = s.outDay === today;
            return (
              <SwipeRow
                key={s.id}
                style={{ marginBottom: space.sm }}
                primary={{ label: 'Check out', icon: 'log-out-outline', color: colors.brand, onAction: () => checkOutStay(s.id, { name: s.name, rooms: s.rooms }) }}
                secondary={{ label: 'Edit', icon: 'create-outline', color: colors.ink, onAction: () => router.push(`/edit-booking/${s.id}`) }}
              >
                <Card onPress={() => router.push(`/booking-detail/${s.id}`)} padded={false} accessibilityLabel={`${s.name}, room ${s.rooms.join(', ')}`}>
                  <View style={styles.guestRow}>
                    {/* The room is what the desk looks for first, so it leads the card. */}
                    <View style={[styles.roomBadge, isOverdue && styles.roomBadgeAlert]}>
                      <AppText variant="numberSm" color={isOverdue ? colors.inkInverse : colors.brand} numberOfLines={1} style={styles.roomBadgeText}>
                        {shortRoom(s.rooms[0] || '—')}
                      </AppText>
                      {s.rooms.length > 1 ? (
                        <AppText variant="caption" color={isOverdue ? colors.inkInverse : colors.brand} style={styles.roomBadgeMore}>
                          +{s.rooms.length - 1}
                        </AppText>
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {s.name}
                      </AppText>
                      <AppText variant="footnote" tone={isOverdue ? 'danger' : 'muted'} numberOfLines={1}>
                        {s.rooms.length > 1 ? `Rooms ${s.rooms.join(', ')} · ` : ''}
                        {isOverdue ? `due ${fmtShortDate(s.outDay)}` : leavingToday ? 'leaves today' : `until ${fmtShortDate(s.outDay)}`}
                      </AppText>
                    </View>
                    <Button
                      title="Check out"
                      size="sm"
                      variant={isOverdue || leavingToday ? 'primary' : 'tonal'}
                      onPress={() => checkOutStay(s.id, { name: s.name, rooms: s.rooms })}
                    />
                  </View>
                </Card>
              </SwipeRow>
            );
          })
        )}
      </Section>

      {/* Room map */}
      <Section title="Rooms" caption="Tap a free room to book it, an occupied one to see the guest">
        <View style={styles.legend}>
          {LEGEND.map(l => (
            <Row key={l.tone} gap={6}>
              <View style={[styles.legendDot, { backgroundColor: TILE_LOOK[l.tone].bg, borderColor: statusColors[l.tone].fg }]} />
              <AppText variant="caption" tone="soft">
                {l.label}
              </AppText>
            </Row>
          ))}
        </View>
        {rooms.length === 0 ? (
          <Card>
            <View style={styles.grid}>
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} height={52} radius={radius.sm} style={styles.tileSkeleton} />
              ))}
            </View>
          </Card>
        ) : (
          <Card>
            <View onLayout={e => setGridWidth(e.nativeEvent.layout.width)} />
            {floors.map((f, fi) => (
              <View key={f.floor} style={fi > 0 && { marginTop: space.lg }}>
                <AppText variant="caption" tone="soft" style={{ marginBottom: space.sm }}>
                  {f.floor}
                </AppText>
                <View style={styles.grid}>
                  {f.rooms.map(room => {
                    const tone = roomTone(room);
                    const look = TILE_LOOK[tone];
                    return (
                      <PressableScale
                        key={room.key}
                        onPress={() => openRoom(room)}
                        scaleTo={0.9}
                        style={[styles.tile, { backgroundColor: look.bg, width: tileSize || '18%' }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Room ${room.room_no}, ${LEGEND.find(l => l.tone === tone)?.label}`}
                      >
                        <AppText variant="bodyStrong" color={look.fg} numberOfLines={1} style={styles.tileText}>
                          {shortRoom(room.room_no)}
                        </AppText>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
};

const TILE_GAP = 8;
const COLUMNS = 5;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.lg, paddingBottom: space.xl },
  errorCard: { marginBottom: space.md, padding: space.md },
  hero: { borderRadius: radius.xl, padding: space.xxl, flexDirection: 'row', alignItems: 'center', gap: space.lg, overflow: 'hidden' },
  todayRow: { flexDirection: 'row', gap: space.sm + 2, marginTop: space.lg },
  todayTile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.line },
  todayIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xxl, marginBottom: space.xxl },
  action: { width: '23%', alignItems: 'center', gap: space.sm },
  actionIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  arrivalDate: { minWidth: 72, paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: statusColors.reserved.bg, alignItems: 'center' },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  roomBadge: { minWidth: 56, height: 48, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  roomBadgeAlert: { backgroundColor: colors.danger },
  roomBadgeText: { fontSize: 20, lineHeight: 24 },
  roomBadgeMore: { fontSize: 10, lineHeight: 12, marginTop: -1 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginBottom: space.md },
  legendDot: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: { height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tileText: { fontSize: 15 },
  tileSkeleton: { width: '18%' },
});

export default DashboardScreen;
