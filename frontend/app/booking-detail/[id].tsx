import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Alert, ScrollView, Modal, Linking, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { checkOutStay } from '../../src/utils/checkoutFlow';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import {
  fetchBookingById,
  reassignBookingRooms,
  confirmCheckIn,
  extendStay,
  type BookingDetail,
  type RtdbRoom,
} from '../../src/utils/rtdbService';
import { getCached, getCachedItemSync } from '../../src/utils/cache';
import { useRoomAvailability } from '../../src/utils/useRoomAvailability';
import { RoomPicker } from '../../src/components/RoomPicker';
import { mediaImageSource } from '../../src/utils/imageStorage';
import { localDay } from '../../src/utils/date';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { parseAmount } from '../../src/utils/amount';
import {
  AppText,
  Avatar,
  Button,
  Card,
  EmptyState,
  IconButton,
  InfoRow,
  NavBar,
  PressableScale,
  SelectField,
  Sheet,
  SlideToConfirm,
  StatusPill,
  colors,
  formatRupees,
  haptic,
  radius,
  space,
  statusColors,
  GUTTER,
} from '../../src/ui';

// Helper to convert cached booking format to BookingDetail
const cachedToBookingDetail = (cached: any): BookingDetail | null => {
  if (!cached) return null;
  return {
    id: cached.id,
    customerId: cached.customer_id || cached.customerId,
    roomNo: cached.room?.room_number || cached.room_id,
    roomNumbers: cached.room_numbers || [cached.room?.room_number || cached.room_id],
    checkInDate: cached.check_in,
    checkOutDate: cached.check_out_expected || cached.check_out_actual,
    status: cached.status,
    createdAt: cached.created_at ? new Date(cached.created_at).getTime() : Date.now(),
    customer: cached.customer ? {
      name: cached.customer.name,
      mobile: cached.customer.mobile,
      father_name: cached.customer.father_name,
      address: cached.customer.address,
      city: cached.customer.city,
      amount: cached.customer.amount || cached.total_amount || '',
      idImageUrl: cached.customer.idImageUrl || cached.customer.id_image_url,
      idImageUrls: cached.customer.idImageUrls || [],
    } : undefined,
  };
};

const BookingDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // INSTANT: Try to get booking from memory cache synchronously (before first render)
  const initialBooking = useMemo(() => {
    if (!id) return null;
    const cached = getCachedItemSync<any>('bookings:list', id);
    return cachedToBookingDetail(cached);
  }, [id]);

  const [booking, setBooking] = useState<BookingDetail | null>(initialBooking);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [editRoomsVisible, setEditRoomsVisible] = useState(false);
  const [roomSelection, setRoomSelection] = useState<Set<string>>(new Set());
  const [savingRooms, setSavingRooms] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Extend Stay State
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [newCheckoutDate, setNewCheckoutDate] = useState(new Date());
  const [extending, setExtending] = useState(false);

  const handleExtendStay = async () => {
    if (!id || !booking) return;
    setExtending(true);
    try {
      const newOut = localDay(newCheckoutDate);

      if (newOut <= localDay(booking.checkOutDate)) {
        Alert.alert('Pick a later date', 'To shorten the stay, use Edit instead.');
        return;
      }
      await extendStay(id, newOut);
      haptic.success();
      setShowExtendModal(false);
      load();
    } catch (error: any) {
      console.error('Extend stay error', error);
      Alert.alert('Could not extend', error?.message || 'Check your connection and try again.');
    } finally {
      setExtending(false);
    }
  };

  const [confirmingCheckIn, setConfirmingCheckIn] = useState(false);

  const handleConfirmCheckIn = async () => {
    if (!id || !booking) return;

    Alert.alert(
      'Confirm Check-in',
      `Are you sure you want to mark Room ${booking.roomNo} as occupied and start the stay for ${booking.customer?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setConfirmingCheckIn(true);
            try {
              await confirmCheckIn(id, booking.roomNo);
              haptic.success();
              load();
            } catch (error: any) {
              console.error('Confirm check-in error', error);
              Alert.alert('Error', error?.message || 'Failed to confirm check-in');
            } finally {
              setConfirmingCheckIn(false);
            }
          }
        }
      ]
    );
  };

  // If no initial booking from memory cache, try async cache or fetch
  useEffect(() => {
    if (!id || booking) return; // Already have data from sync cache

    const loadFromCacheOrFetch = async () => {
      // Try async cache (in case memory cache wasn't populated yet)
      const cachedList = await getCached<any[]>('bookings:list');
      if (cachedList && cachedList.length) {
        const cachedBooking = cachedList.find((b: any) => b.id === id);
        if (cachedBooking) setBooking(prev => prev ?? cachedToBookingDetail(cachedBooking));
      }
      // The focus listener below fetches the live record either way.
    };

    loadFromCacheOrFetch();
  }, [id, booking]);

  const hasBooking = useRef(!!initialBooking);
  useEffect(() => {
    hasBooking.current = !!booking;
  }, [booking]);
  const load = useCallback(async () => {
    if (!id) return;
    // Refreshes quietly when something is already on screen (e.g. back from Edit).
    if (!hasBooking.current) setLoading(true);
    try {
      const data = await fetchBookingById(id);
      if (data) setBooking(data);
      else if (!hasBooking.current) setMissing(true);
    } catch (error) {
      console.error('Error loading booking', error);
      if (!hasBooking.current) Alert.alert('Could not load this stay', 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Rooms for the "Change rooms" sheet, judged against this stay's own dates.
  const { rooms, unavailable } = useRoomAvailability(
    booking ? localDay(booking.checkInDate) : '',
    booking ? localDay(booking.checkOutDate) : '',
    booking?.relatedBookingIds || (booking ? [booking.id] : [])
  );

  const handleCheckout = async (): Promise<boolean> => {
    if (!id || !booking) return false;
    const ok = await checkOutStay(id, { name: booking.customer?.name, rooms: booking.roomNumbers }, { confirm: false });
    if (!ok) return false;
    setBooking(prev => (prev ? { ...prev, status: 'CHECKED_OUT', checkOutActual: new Date().toISOString() } : prev));
    // Let the tick register before leaving.
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/dashboard')), 700);
    return true;
  };

  if (missing && !booking) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar title="Stay" />
        <EmptyState icon="document-outline" title="Stay not found" message="It may have been deleted on another phone." />
      </SafeAreaView>
    );
  }

  if (loading || !booking) {
    return <LoadingSpinner message="Loading booking..." />;
  }

  const isBooked = booking.status === 'BOOKED';
  const isConfirmed = booking.status === 'CONFIRMED';
  const isActive = isBooked || isConfirmed;
  const arrivesLater = isActive && localDay(booking.checkInDate) > localDay();
  const inHouse = isBooked && !arrivesLater;

  const openRooms = () => {
    setRoomSelection(new Set(roomList));
    setEditRoomsVisible(true);
  };

  const toggleRoomSelection = (room: RtdbRoom) =>
    setRoomSelection(prev => {
      const next = new Set(prev);
      if (next.has(room.room_no)) next.delete(room.room_no);
      else next.add(room.room_no);
      return next;
    });

  const handleSaveRooms = async () => {
    if (!id) return;
    if (roomSelection.size === 0) {
      Alert.alert('Missing selection', 'Please select at least one room.');
      return;
    }
    setSavingRooms(true);
    try {
      await reassignBookingRooms(id, Array.from(roomSelection.values()));
      haptic.success();
      setEditRoomsVisible(false);
      load();
    } catch (error: any) {
      console.error('Reassign rooms error', error);
      Alert.alert('Room update failed', error?.message || 'Could not update room allocation.');
    } finally {
      setSavingRooms(false);
    }
  };


  const openEdit = () => router.push(`/edit-booking/${booking.id}` as any);

  const nights = (() => {
    const a = new Date(booking.checkInDate);
    const b = new Date(booking.checkOutActual || booking.checkOutDate);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    const noon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
    return Math.max(1, Math.round((noon(b) - noon(a)) / 86400000));
  })();
  const amount = parseAmount(booking.customer?.amount, 'CASH');
  const pill = arrivesLater
    ? { tone: 'reserved' as const, label: `Arrives ${formatShort(booking.checkInDate)}` }
    : inHouse
      ? { tone: 'occupied' as const, label: 'In house' }
      : isConfirmed
        ? { tone: 'reserved' as const, label: 'Arriving' }
        : { tone: 'checkedOut' as const, label: 'Checked out' };
  const idPhotos = (booking.customer?.idImageUrls || []).filter(u => typeof u === 'string' && (u.startsWith('http') || u.startsWith('file://')));
  const roomList = booking.roomNumbers?.length ? booking.roomNumbers : [booking.roomNo].filter(Boolean);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavBar
        title="Stay"
        subtitle={roomList.length ? `Room ${roomList.join(', ')}` : undefined}
        right={isActive ? <IconButton icon="create-outline" onPress={openEdit} accessibilityLabel="Edit stay" /> : undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Guest summary */}
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <Avatar name={booking.customer?.name} size={60} />
            <View style={{ flex: 1 }}>
              <AppText variant="title2" numberOfLines={2}>
                {booking.customer?.name || 'Guest'}
              </AppText>
              <View style={{ marginTop: space.xs }}>
                <StatusPill tone={pill.tone} label={pill.label} size="sm" />
              </View>
            </View>
            {booking.customer?.mobile ? (
              <IconButton icon="call" variant="tonal" accessibilityLabel={`Call ${booking.customer.mobile}`} onPress={() => Linking.openURL(`tel:${booking.customer?.mobile}`)} />
            ) : null}
          </View>
          <View style={styles.stats}>
            {[
              { label: roomList.length > 1 ? 'Rooms' : 'Room', value: roomList.join(', ') || '—' },
              { label: 'Nights', value: nights ? String(nights) : '—' },
              { label: 'Amount', value: amount.total > 0 ? formatRupees(amount.total) : '—' },
            ].map((stat, i) => (
              <View key={stat.label} style={[styles.stat, i > 0 && styles.statLine]}>
                <AppText variant="caption" tone="muted">
                  {stat.label}
                </AppText>
                <AppText variant="numberSm" numberOfLines={1} style={{ fontSize: stat.value.length > 7 ? 17 : 22 }}>
                  {stat.value}
                </AppText>
              </View>
            ))}
          </View>
        </Card>

        {/* Stay timeline */}
        <Card style={styles.card}>
          <AppText variant="overline" tone="muted" style={{ marginBottom: space.md }}>
            Stay
          </AppText>
          <View style={styles.timeline}>
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" tone="muted">
                Check-in
              </AppText>
              <AppText variant="bodyStrong">{formatDate(booking.checkInDate)}</AppText>
            </View>
          </View>
          <View style={styles.rail} />
          <View style={styles.timeline}>
            <View style={[styles.dot, !isActive && { backgroundColor: statusColors.checkedOut.fg }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" tone="muted">
                {booking.checkOutActual ? 'Checked out' : 'Expected check-out'}
              </AppText>
              <AppText variant="bodyStrong">{formatDate(booking.checkOutActual || booking.checkOutDate)}</AppText>
              {booking.checkOutActual && booking.checkOutDate ? (
                <AppText variant="caption" tone="muted">
                  Planned {formatDate(booking.checkOutDate)}
                </AppText>
              ) : null}
            </View>
            {isActive ? <Button title="Extend" icon="calendar-outline" size="sm" variant="tonal" onPress={() => {
                  const next = new Date(booking.checkOutDate);
                  next.setDate(next.getDate() + 1);
                  setNewCheckoutDate(isNaN(next.getTime()) ? new Date() : next);
                  setShowExtendModal(true);
                }}
              /> : null}
          </View>
        </Card>

        {/* Rooms */}
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText variant="overline" tone="muted">
              Rooms
            </AppText>
            {isActive ? (
              <PressableScale onPress={openRooms} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change rooms" style={styles.editLink}>
                <Ionicons name="create-outline" size={16} color={colors.brand} />
                <AppText variant="callout" tone="brand">
                  Change
                </AppText>
              </PressableScale>
            ) : null}
          </View>
          <View style={styles.roomChips}>
            {roomList.map(rn => (
              <View key={rn} style={styles.roomChip}>
                <Ionicons name="bed-outline" size={15} color={colors.brand} />
                <AppText variant="callout">{rn}</AppText>
              </View>
            ))}
          </View>
          {booking.room?.type ? (
            <AppText variant="caption" tone="muted" style={{ marginTop: space.sm }}>
              {booking.room.type}
            </AppText>
          ) : null}
        </Card>

        {/* Guest & ID */}
        <Card style={styles.card}>
          <View style={[styles.rowBetween, { marginBottom: space.xs }]}>
            <AppText variant="overline" tone="muted">
              Guest
            </AppText>
            {isActive ? (
              <PressableScale onPress={openEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit guest details" style={styles.editLink}>
                <Ionicons name="create-outline" size={16} color={colors.brand} />
                <AppText variant="callout" tone="brand">
                  Edit
                </AppText>
              </PressableScale>
            ) : null}
          </View>
          <InfoRow label="Mobile" value={booking.customer?.mobile} icon="call-outline" />
          <InfoRow label="Father's name" value={booking.customer?.father_name} icon="person-outline" />
          <InfoRow label="Address" value={[booking.customer?.address, booking.customer?.city].filter(Boolean).join(', ')} icon="location-outline" last />
          {idPhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
              {idPhotos.map((url, idx) => (
                <PressableScale key={`${url}-${idx}`} onPress={() => setSelectedImage(url)} scaleTo={0.95} accessibilityLabel={`ID photo ${idx + 1}`}>
                  <Image source={mediaImageSource(url)} style={styles.photo} contentFit="cover" transition={150} />
                </PressableScale>
              ))}
            </ScrollView>
          ) : (
            <AppText variant="caption" tone="muted" style={{ marginTop: space.md }}>
              No ID photos yet.
            </AppText>
          )}
          {booking.customerId ? (
            <Button
              title="Open guest profile"
              variant="secondary"
              iconRight="chevron-forward"
              onPress={() => router.push(`/customer-detail/${booking.customerId}` as any)}
              style={{ marginTop: space.lg }}
              fullWidth
            />
          ) : null}
        </Card>
      </ScrollView>

      {/* Primary action */}
      {isActive ? (
        <View style={styles.footer}>
          {isConfirmed ? (
            <Button title="Confirm check-in" icon="log-in-outline" size="lg" onPress={handleConfirmCheckIn} loading={confirmingCheckIn} fullWidth />
          ) : inHouse ? (
            <SlideToConfirm label="Slide to check out" onConfirm={handleCheckout} />
          ) : (
            <Button title="Edit booking" icon="create-outline" size="lg" variant="secondary" onPress={openEdit} fullWidth />
          )}
        </View>
      ) : null}

      {/* Extend stay */}
      <Sheet
        visible={showExtendModal}
        onClose={() => setShowExtendModal(false)}
        title="Extend stay"
        subtitle={`Currently until ${formatDate(booking.checkOutDate)}`}
        footer={<Button title="Save new date" size="lg" fullWidth loading={extending} onPress={handleExtendStay} />}
      >
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={newCheckoutDate}
            mode="date"
            display="inline"
            themeVariant="light"
            accentColor={colors.brand}
            minimumDate={new Date(booking.checkOutDate)}
            onValueChange={(_event, date) => setNewCheckoutDate(date)}
          />
        ) : (
          <SelectField
            label="New check-out date"
            value={formatDate(newCheckoutDate.toISOString())}
            onPress={() =>
              DateTimePickerAndroid.open({
                value: newCheckoutDate,
                mode: 'date',
                minimumDate: new Date(booking.checkOutDate),
                onValueChange: (_event, date) => setNewCheckoutDate(date),
              })
            }
          />
        )}
      </Sheet>

      {/* Change rooms */}
      <Sheet
        visible={editRoomsVisible}
        onClose={() => setEditRoomsVisible(false)}
        title="Change rooms"
        subtitle="Rooms booked for these dates are greyed out."
        footer={<Button title={`Save ${roomSelection.size} room${roomSelection.size === 1 ? '' : 's'}`} size="lg" fullWidth loading={savingRooms} onPress={handleSaveRooms} />}
      >
        <RoomPicker rooms={rooms} selected={roomSelection} unavailable={unavailable} onToggle={toggleRoomSelection} />
      </Sheet>

      {/* Full-screen ID photo */}
      <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={() => setSelectedImage(null)} statusBarTranslucent>
        <Pressable style={styles.viewer} onPress={() => setSelectedImage(null)} accessibilityLabel="Close photo">
          {selectedImage ? <Image source={mediaImageSource(selectedImage)} style={styles.viewerImg} contentFit="contain" /> : null}
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={26} color={colors.inkInverse} />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const formatShort = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: GUTTER, paddingBottom: space.huge },
  hero: { marginTop: space.xs, marginBottom: space.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stats: { flexDirection: 'row', marginTop: space.lg, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: space.xs },
  statLine: { borderLeftWidth: 1, borderLeftColor: colors.line },
  card: { marginBottom: space.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  timeline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  rail: { width: 2, height: 22, backgroundColor: colors.line, marginLeft: 5, marginVertical: 4 },
  roomChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  roomChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandSoft, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  photos: { gap: space.sm, marginTop: space.md },
  photo: { width: 120, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  footer: { paddingHorizontal: GUTTER, paddingTop: space.md, paddingBottom: space.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 56, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});

export default BookingDetailScreen;
