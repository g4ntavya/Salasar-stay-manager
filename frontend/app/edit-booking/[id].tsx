import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  fetchBookingById,
  fetchCustomerById,
  updateCustomer,
  extendStay,
  reassignBookingRooms,
  type BookingDetail,
  type RtdbRoom,
} from '../../src/utils/rtdbService';
import { parseAmount, describeAmount, normalizePaymentMode } from '../../src/utils/amount';
import { localDay } from '../../src/utils/date';
import { setCached } from '../../src/utils/cache';
import { useRoomAvailability } from '../../src/utils/useRoomAvailability';
import { RoomPicker } from '../../src/components/RoomPicker';
import { IdPhotos } from '../../src/components/IdPhotos';
import { DateField, formatDateLabel } from '../../src/components/DateField';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  LoadingState,
  Segmented,
  SelectField,
  colors,
  haptic,
  space,
  GUTTER,
} from '../../src/ui';

type Form = {
  name: string;
  mobile: string;
  members: string;
  vehicle: string;
  fatherName: string;
  address: string;
  idNumber: string;
  amount: string;
  paymentMode: 'CASH' | 'UPI';
  checkOut: Date | null;
  rooms: string[];
  photos: string[];
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Change anything about an open stay: guest details, photos, check-out date, amount and rooms. */
export default function EditBookingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [initial, setInitial] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const b = await fetchBookingById(id).catch(() => null);
      if (!b) {
        setMissing(true);
        return;
      }
      const c = b.customerId ? await fetchCustomerById(b.customerId) : null;
      const out = new Date(b.checkOutDate);
      const loaded: Form = {
        name: c?.name || b.customer?.name || '',
        mobile: c?.mobile || b.customer?.mobile || '',
        members: c?.membersCount ? String(c.membersCount) : '',
        vehicle: c?.vehicleNumber || '',
        fatherName: c?.father_name || '',
        address: c?.address || '',
        idNumber: c?.id_number || '',
        amount: b.customer?.amount || c?.amount || '',
        paymentMode: normalizePaymentMode(c?.paymentMode),
        checkOut: isNaN(out.getTime()) ? null : out,
        rooms: [...(b.roomNumbers?.length ? b.roomNumbers : [b.roomNo])].filter(Boolean),
        photos: c?.idImageUrls || [],
      };
      setBooking(b);
      setInitial(loaded);
      setForm(loaded);
    })();
  }, [id]);

  const inDay = booking ? localDay(booking.checkInDate) : '';
  const outDay = form?.checkOut ? localDay(form.checkOut) : '';
  const { rooms, unavailable } = useRoomAvailability(inDay, outDay, booking?.relatedBookingIds || (booking ? [booking.id] : []));
  const parsed = useMemo(() => parseAmount(form?.amount, form?.paymentMode), [form?.amount, form?.paymentMode]);
  // While saving, rooms just added to this stay would otherwise flash as "Booked".
  const blocked = useMemo(
    () => (saving && form ? new Set([...unavailable].filter(r => !form.rooms.includes(r))) : unavailable),
    [saving, form, unavailable]
  );

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => (f ? { ...f, [key]: value } : f));
  const toggleRoom = (room: RtdbRoom) =>
    set('rooms', form!.rooms.includes(room.room_no) ? form!.rooms.filter(r => r !== room.room_no) : [...form!.rooms, room.room_no]);

  const changed = useMemo(() => {
    if (!form || !initial) return { guest: false, rooms: false, dates: false, photos: false, any: false };
    const guestKeys: (keyof Form)[] = ['name', 'mobile', 'members', 'vehicle', 'fatherName', 'address', 'idNumber', 'amount', 'paymentMode'];
    const guest = guestKeys.some(k => String(form[k]).trim() !== String(initial[k]).trim());
    const rooms = !sameList([...form.rooms].sort(), [...initial.rooms].sort());
    const dates = !!form.checkOut && (!initial.checkOut || localDay(form.checkOut) !== localDay(initial.checkOut));
    const photos = !sameList(form.photos, initial.photos);
    return { guest, rooms, dates, photos, any: guest || rooms || dates || photos };
  }, [form, initial]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/dashboard'));

  const confirmDiscard = () => {
    if (!changed.any) return close();
    Alert.alert('Discard changes?', 'Your edits to this stay will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: close },
    ]);
  };

  const save = async () => {
    if (!form || !booking) return;
    const problem = !form.name.trim()
      ? 'Enter the guest’s name.'
      : !form.mobile.trim()
        ? 'Enter a mobile number.'
        : parsed.total <= 0
          ? 'Enter the amount, for example 1500 or 1000p, 500c.'
          : form.rooms.length === 0
            ? 'Select at least one room.'
            : form.rooms.some(r => unavailable.has(r))
              ? `Room ${form.rooms.find(r => unavailable.has(r))} is booked for these dates.`
              : outDay && outDay < inDay
                ? 'Check-out cannot be before check-in.'
                : '';
    if (problem) {
      haptic.warning();
      Alert.alert('Check the details', problem);
      return;
    }

    setSaving(true);
    try {
      if (changed.guest || changed.photos) {
        await updateCustomer(booking.customerId, {
          name: form.name,
          mobile: form.mobile,
          membersCount: form.members ? Number(form.members) : undefined,
          vehicleNumber: form.vehicle,
          fatherName: form.fatherName,
          address: form.address,
          idNumber: form.idNumber,
          amount: form.amount,
          paymentMode: form.paymentMode,
          ...(changed.photos ? { idImageUrls: form.photos, replacePhotos: true } : {}),
        });
      }
      // Rooms first (checked against the current dates), then dates (checked against the new rooms).
      if (changed.rooms) await reassignBookingRooms(booking.id, form.rooms);
      if (changed.dates && outDay) await extendStay(booking.id, outDay);

      await setCached('bookings:list', null).catch(() => {});
      haptic.success();
      close();
    } catch (error: any) {
      haptic.warning();
      Alert.alert('Could not save', error?.message || 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (missing) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="document-outline" title="Stay not found" message="It may have been checked out or deleted on another phone." action={{ label: 'Close', onPress: close }} />
      </SafeAreaView>
    );
  }
  if (!form || !booking) return <LoadingState />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="close" onPress={confirmDiscard} accessibilityLabel="Close without saving" />
        <View style={{ flex: 1 }}>
          <AppText variant="title3" numberOfLines={1}>
            Edit stay
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {initial?.name || 'Guest'} · Room {initial?.rooms.join(', ')}
          </AppText>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView bottomOffset={56} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <AppText variant="title3" style={styles.heading}>
            Guest
          </AppText>
          <Card>
            <Field label="Name" required icon="person-outline" value={form.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
            <Field label="Mobile" required icon="call-outline" value={form.mobile} onChangeText={v => set('mobile', v)} keyboardType="phone-pad" />
            <View style={styles.row}>
              <Field label="Members" icon="people-outline" value={form.members} onChangeText={v => set('members', v)} keyboardType="number-pad" style={{ flex: 1 }} />
              <Field label="Vehicle" icon="car-outline" value={form.vehicle} onChangeText={v => set('vehicle', v)} autoCapitalize="characters" style={{ flex: 1 }} />
            </View>
            <Field label="Father’s name" icon="person-circle-outline" value={form.fatherName} onChangeText={v => set('fatherName', v)} autoCapitalize="words" />
            <Field label="Address" icon="location-outline" value={form.address} onChangeText={v => set('address', v)} />
            <Field label="Aadhaar number" icon="card-outline" value={form.idNumber} onChangeText={v => set('idNumber', v)} keyboardType="number-pad" style={{ marginBottom: 0 }} />
          </Card>

          <AppText variant="title3" style={styles.heading}>
            ID photos
          </AppText>
          <Card>
            <IdPhotos photos={form.photos} onChange={p => set('photos', p)} />
          </Card>

          <AppText variant="title3" style={styles.heading}>
            Dates
          </AppText>
          <Card>
            <View style={styles.row}>
              <SelectField label="Check-in" value={formatDateLabel(new Date(booking.checkInDate))} icon="log-in-outline" disabled style={{ flex: 1, marginBottom: 0 }} />
              <DateField
                label="Check-out"
                value={form.checkOut}
                onChange={d => set('checkOut', d)}
                minimumDate={new Date(booking.checkInDate)}
                style={{ flex: 1, marginBottom: 0 }}
              />
            </View>
          </Card>

          <AppText variant="title3" style={styles.heading}>
            Payment
          </AppText>
          <Card>
            <Field
              label="Amount"
              required
              icon="wallet-outline"
              value={form.amount}
              onChangeText={v => set('amount', v)}
              hint={form.amount.trim() ? (parsed.total > 0 ? describeAmount(parsed) : 'Amount not recognised') : undefined}
              hintTone={parsed.total > 0 ? 'success' : 'danger'}
            />
            <AppText variant="caption" tone="soft" style={styles.label}>
              Paid by
            </AppText>
            <Segmented
              value={form.paymentMode}
              onChange={v => set('paymentMode', v)}
              options={[
                { value: 'CASH', label: 'Cash' },
                { value: 'UPI', label: 'UPI' },
              ]}
            />
          </Card>

          <AppText variant="title3" style={styles.heading}>
            Rooms
          </AppText>
          <AppText variant="caption" tone="muted" style={{ marginTop: -space.sm, marginBottom: space.md }}>
            {form.rooms.length ? `Selected: ${form.rooms.join(', ')}` : 'Select at least one room'}
          </AppText>
          <Card>
            <RoomPicker rooms={rooms} selected={new Set(form.rooms)} unavailable={blocked} onToggle={toggleRoom} />
          </Card>
        </KeyboardAwareScrollView>

        {/* The save bar steps aside while typing so the form keeps the room above the keyboard. */}
        {!keyboardOpen ? (
          <View style={styles.footer}>
            <Button title="Save changes" size="lg" onPress={save} loading={saving} disabled={!changed.any} fullWidth />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: GUTTER, paddingTop: space.sm, paddingBottom: space.md },
  content: { paddingHorizontal: GUTTER, paddingBottom: space.huge },
  heading: { marginTop: space.xl, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.md },
  label: { marginBottom: space.xs + 2, marginLeft: 2 },
  footer: { paddingHorizontal: GUTTER, paddingVertical: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
});
