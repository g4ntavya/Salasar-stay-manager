import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { createBookings, createCustomer, type RtdbRoom } from '../src/utils/rtdbService';
import { getCached, setCached } from '../src/utils/cache';
import { parseAmount, describeAmount } from '../src/utils/amount';
import { localDay } from '../src/utils/date';
import { useRoomAvailability } from '../src/utils/useRoomAvailability';
import { RoomPicker } from '../src/components/RoomPicker';
import { IdPhotos } from '../src/components/IdPhotos';
import { DateField, formatDateLabel } from '../src/components/DateField';
import {
  AppText,
  Button,
  Card,
  Field,
  IconButton,
  PressableScale,
  Segmented,
  colors,
  formatRupees,
  haptic,
  motion,
  radius,
  space,
  GUTTER,
} from '../src/ui';

const DAY = 24 * 60 * 60 * 1000;
const STEPS = ['Guest details', 'Rooms'] as const;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Two steps: everything about the guest and the stay first, then the rooms. */
const NewBookingScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ room?: string }>();
  const { width } = useWindowDimensions();

  // Guest
  const [guestName, setGuestName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [membersCount, setMembersCount] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [address, setAddress] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  // Stay & payment
  const [checkInDate, setCheckInDate] = useState<Date>(() => new Date());
  const [checkOutDate, setCheckOutDate] = useState<Date>(() => new Date(Date.now() + DAY));
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
  const [tokenAmount, setTokenAmount] = useState('');

  // Rooms. Tapping a free room on Home or Rooms opens this screen with that room already chosen.
  const [pickedRooms, setPickedRooms] = useState<string[]>(() => (params.room ? [params.room] : []));
  const inDay = localDay(checkInDate);
  const outDay = localDay(checkOutDate);
  const { rooms, unavailable, error: roomsError } = useRoomAvailability(inDay, outDay);
  // Flow
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ name: string; rooms: string[]; advance: boolean } | null>(null);
  const saving = submitting || !!done;

  // Rooms that are not free for these dates (or were just booked on another phone) drop out.
  // While saving, our own rooms turn "booked" as they are claimed, so the choice is frozen.
  const selectedRooms = useMemo(
    () => (saving ? pickedRooms : pickedRooms.filter(r => !unavailable.has(r))),
    [saving, pickedRooms, unavailable]
  );
  const blocked = useMemo(() => (saving ? new Set([...unavailable].filter(r => !pickedRooms.includes(r))) : unavailable), [saving, unavailable, pickedRooms]);

  const submitLock = useRef(false);
  const roomsScroll = useRef<ScrollView>(null);

  const parsedAmount = useMemo(() => parseAmount(amount, paymentMode), [amount, paymentMode]);
  const isAdvance = inDay > localDay();
  const nights = Math.max(1, Math.round((new Date(checkOutDate).setHours(12, 0, 0, 0) - new Date(checkInDate).setHours(12, 0, 0, 0)) / DAY));

  /* ---------- Pager ---------- */

  const page = useSharedValue(0);
  useEffect(() => {
    page.set(withTiming(step, { duration: motion.slow, easing: motion.ease }));
  }, [step, page]);
  const pagerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -page.get() * width }] }));
  const progressStyle = useAnimatedStyle(() => ({ width: `${50 + page.get() * 50}%` }));

  const goToRooms = () => {
    const problem = !guestName.trim()
      ? 'Enter the guest’s name.'
      : !mobileNumber.trim()
        ? 'Enter a mobile number.'
        : !membersCount.trim()
          ? 'Enter how many people are staying.'
          : !amount.trim()
            ? 'Enter the amount.'
            : parsedAmount.total <= 0
              ? 'Enter the amount as a number, for example 1500 or 1000p, 500c (p = UPI, c = cash).'
              : outDay < inDay
                ? 'Check-out cannot be before check-in.'
                : '';
    if (problem) {
      haptic.warning();
      Alert.alert('Almost there', problem);
      return;
    }
    Keyboard.dismiss();
    haptic.tap();
    roomsScroll.current?.scrollTo({ y: 0, animated: false });
    setStep(1);
  };

  const back = () => {
    Keyboard.dismiss();
    if (step > 0) setStep(0);
    else if (router.canGoBack()) router.back();
    else router.replace('/dashboard');
  };

  const toggleRoom = (room: RtdbRoom) =>
    setPickedRooms(selectedRooms.includes(room.room_no) ? selectedRooms.filter(r => r !== room.room_no) : [...selectedRooms, room.room_no]);

  /* ---------- Submit ---------- */

  const submit = async () => {
    if (submitLock.current) return;
    if (selectedRooms.length === 0) {
      haptic.warning();
      Alert.alert('Choose a room', 'Select at least one free room.');
      return;
    }
    const taken = selectedRooms.find(r => unavailable.has(r));
    if (taken) {
      Alert.alert('Room taken', `Room ${taken} was just booked. Please pick another.`);
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    try {
      const customerId = await createCustomer({
        guestName: guestName.trim(),
        fatherName: fatherName.trim() || undefined,
        mobileNumber: mobileNumber.trim(),
        address: address.trim() || undefined,
        amount: amount.trim(),
        idNumber: idNumber.trim() || undefined,
        membersCount: Number.parseInt(membersCount, 10) || 0,
        vehicleNumber: vehicleNumber.trim() || undefined,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        selectedRoom: selectedRooms.join(','),
        idImageUrls: photos,
        paymentMode,
      });

      const ids = await createBookings(customerId, selectedRooms, checkInDate.toISOString(), checkOutDate.toISOString(), paymentMode, {
        amountRaw: amount.trim(),
        tokenAmount: Number(tokenAmount) || 0,
        guestName: guestName.trim(),
        membersCount: Number.parseInt(membersCount, 10) || 1,
        mobile: mobileNumber.trim(),
      });

      // The guest shows up in Guests right away; Bookings refetches on arrival.
      const optimistic = {
        id: customerId,
        name: guestName.trim(),
        mobile: mobileNumber.trim(),
        vehicleNumber: vehicleNumber.trim(),
        amount: amount.trim(),
        checkInDate: checkInDate.toISOString(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        idImageUrls: photos,
      };
      await Promise.all(
        ['customers:recent', 'customers:list'].map(async key => {
          const list = (await getCached<any[]>(key)) || [];
          await setCached(key, [optimistic, ...list.filter(c => c?.id !== customerId)]);
        })
      ).catch(() => {});
      await setCached('bookings:list', null).catch(() => {});

      haptic.success();
      Keyboard.dismiss();
      setDone({ name: guestName.trim(), rooms: selectedRooms, advance: isAdvance });
      setTimeout(() => {
        router.back();
        if (isAdvance) router.navigate({ pathname: '/rooms', params: { view: 'advance' } });
        else router.navigate({ pathname: '/bookings', params: { highlight: ids[0], filter: 'in' } });
      }, 1350);
    } catch (error: any) {
      haptic.warning();
      Alert.alert('Booking not saved', error?.message || 'Check your connection and try again.');
      submitLock.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Keyboard: the action bar steps aside while typing ---------- */

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const amountHint = amount.trim() ? (parsedAmount.total > 0 ? describeAmount(parsedAmount) : 'Amount not recognised') : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.topBar}>
        <IconButton icon={step === 0 ? 'close' : 'arrow-back'} onPress={back} accessibilityLabel={step === 0 ? 'Close' : 'Back to guest details'} />
        <View style={{ flex: 1 }}>
          <AppText variant="title3">{isAdvance ? 'Advance booking' : 'New booking'}</AppText>
          <AppText variant="caption" tone="muted">
            Step {step + 1} of 2 · {STEPS[step]}
          </AppText>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>

      <View style={styles.flex}>
        <View style={[styles.flex, { overflow: 'hidden' }]}>
          <Animated.View style={[styles.pager, { width: width * 2 }, pagerStyle]}>
            {/* Step 1: guest, ID, dates, payment */}
            <KeyboardAwareScrollView
              bottomOffset={56}
              style={{ width }}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              pointerEvents={step === 0 ? 'auto' : 'none'}
            >
              <AppText variant="title3" style={styles.heading}>
                Guest
              </AppText>
              <Card>
                <Field label="Name" required icon="person-outline" value={guestName} onChangeText={setGuestName} autoCapitalize="words" returnKeyType="next" />
                <Field label="Mobile" required icon="call-outline" value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" />
                <View style={styles.row}>
                  <Field label="Members" required icon="people-outline" value={membersCount} onChangeText={setMembersCount} keyboardType="number-pad" style={styles.half} />
                  <Field label="Vehicle" icon="car-outline" value={vehicleNumber} onChangeText={setVehicleNumber} autoCapitalize="characters" style={styles.half} />
                </View>
                <Field label="Father’s name" icon="person-circle-outline" value={fatherName} onChangeText={setFatherName} autoCapitalize="words" />
                <Field label="Address" icon="location-outline" value={address} onChangeText={setAddress} style={{ marginBottom: 0 }} />
              </Card>

              <AppText variant="title3" style={styles.heading}>
                ID proof
              </AppText>
              <Card>
                <Field label="Aadhaar number" icon="card-outline" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" />
                <IdPhotos photos={photos} onChange={setPhotos} />
              </Card>

              <AppText variant="title3" style={styles.heading}>
                Stay
              </AppText>
              <Card>
                <View style={styles.row}>
                  <DateField
                    label="Check-in"
                    required
                    value={checkInDate}
                    onChange={d => {
                      setCheckInDate(d);
                      if (localDay(checkOutDate) < localDay(d)) setCheckOutDate(new Date(d.getTime() + DAY));
                    }}
                    style={styles.half}
                  />
                  <DateField label="Check-out" required value={checkOutDate} onChange={setCheckOutDate} minimumDate={checkInDate} style={styles.half} />
                </View>
                <AppText variant="caption" tone="soft">
                  {nights} night{nights > 1 ? 's' : ''}
                  {isAdvance ? ' · the room is held but not occupied until check-in' : ''}
                </AppText>
              </Card>

              <AppText variant="title3" style={styles.heading}>
                Payment
              </AppText>
              <Card>
                <Field
                  label="Amount"
                  required
                  icon="wallet-outline"
                  value={amount}
                  onChangeText={setAmount}
                  hint={amountHint}
                  hintTone={parsedAmount.total > 0 ? 'success' : 'danger'}
                />
                <AppText variant="caption" tone="soft" style={styles.label}>
                  Paid by
                </AppText>
                <Segmented
                  value={paymentMode}
                  onChange={setPaymentMode}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'UPI', label: 'UPI' },
                  ]}
                />
                {isAdvance ? (
                  <Field
                    label="Token received"
                    icon="ribbon-outline"
                    value={tokenAmount}
                    onChangeText={setTokenAmount}
                    keyboardType="numeric"
                    hint={Number(tokenAmount) > 0 ? `${formatRupees(tokenAmount)} advance paid` : 'Leave empty if no advance was paid'}
                    hintTone={Number(tokenAmount) > 0 ? 'success' : 'muted'}
                    style={{ marginTop: space.lg, marginBottom: 0 }}
                  />
                ) : null}
              </Card>
            </KeyboardAwareScrollView>

            {/* Step 2: rooms */}
            <ScrollView
              ref={roomsScroll}
              style={{ width }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              pointerEvents={step === 1 ? 'auto' : 'none'}
            >
              <PressableScale onPress={back} scaleTo={0.98} style={styles.summary} accessibilityRole="button" accessibilityLabel="Edit guest details">
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {guestName.trim() || 'Guest'}
                    {membersCount ? ` · ${membersCount} ${membersCount === '1' ? 'person' : 'people'}` : ''}
                  </AppText>
                  <AppText variant="footnote" tone="soft" numberOfLines={1}>
                    {formatDateLabel(checkInDate)} → {formatDateLabel(checkOutDate)} · {nights} night{nights > 1 ? 's' : ''}
                  </AppText>
                  <AppText variant="footnote" tone="soft" numberOfLines={1}>
                    {parsedAmount.total > 0 ? describeAmount(parsedAmount) : '—'}
                  </AppText>
                </View>
                <View style={styles.editPill}>
                  <Ionicons name="create-outline" size={14} color={colors.brand} />
                  <AppText variant="caption" tone="brand">
                    Edit
                  </AppText>
                </View>
              </PressableScale>

              <AppText variant="title3" style={styles.heading}>
                Choose rooms
              </AppText>
              {roomsError ? (
                <AppText variant="caption" tone="danger" style={{ marginBottom: space.md }}>
                  Live availability could not be loaded. Rooms booked on other phones may not be greyed out.
                </AppText>
              ) : null}
              <Card>
                <RoomPicker rooms={rooms} selected={new Set(selectedRooms)} unavailable={blocked} onToggle={toggleRoom} />
              </Card>
            </ScrollView>
          </Animated.View>
        </View>

        {!keyboardOpen ? (
          <Animated.View entering={FadeInDown.duration(motion.base).easing(motion.ease)} exiting={FadeOut.duration(motion.fast)} style={styles.footer}>
            {step === 0 ? (
              <>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{parsedAmount.total > 0 ? formatRupees(parsedAmount.total) : '₹0'}</AppText>
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {nights} night{nights > 1 ? 's' : ''}
                    {selectedRooms.length ? ` · Room ${selectedRooms.join(', ')}` : ''}
                  </AppText>
                </View>
                <Button title="Next" iconRight="arrow-forward" size="lg" onPress={goToRooms} />
              </>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {selectedRooms.length ? `Room ${selectedRooms.join(', ')}` : 'No room selected'}
                  </AppText>
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {selectedRooms.length ? `${selectedRooms.length} room${selectedRooms.length > 1 ? 's' : ''} · ` : ''}
                    {formatRupees(parsedAmount.total)}
                  </AppText>
                </View>
                <Button title="Confirm" icon="checkmark" size="lg" onPress={submit} loading={submitting} disabled={selectedRooms.length === 0} />
              </>
            )}
          </Animated.View>
        ) : null}
      </View>

      {done ? <BookedOverlay name={done.name} rooms={done.rooms} advance={done.advance} /> : null}
    </SafeAreaView>
  );
};

/* ---------- Success ---------- */

const CHECK_LEN = 48;

const BookedOverlay: React.FC<{ name: string; rooms: string[]; advance: boolean }> = ({ name, rooms, advance }) => {
  const circle = useSharedValue(0);
  const tick = useSharedValue(0);

  useEffect(() => {
    circle.set(withSpring(1, motion.bouncy));
    tick.set(withDelay(180, withTiming(1, { duration: 420, easing: motion.ease })));
  }, [circle, tick]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: circle.get() }], opacity: Math.min(1, circle.get() * 1.5) }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - tick.get()) }));

  return (
    <Animated.View entering={FadeIn.duration(motion.fast)} style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Animated.View style={[styles.doneCircle, circleStyle]}>
        <Svg width={44} height={44} viewBox="0 0 44 44">
          <AnimatedPath
            d="M10 23 L19 31 L34 14"
            stroke={colors.inkInverse}
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={CHECK_LEN}
            animatedProps={tickProps}
          />
        </Svg>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(220).duration(motion.base).easing(motion.ease)} style={{ alignItems: 'center' }}>
        <AppText variant="title1" style={{ marginTop: space.xl }}>
          {advance ? 'Booking saved' : 'Checked in'}
        </AppText>
        <AppText variant="body" tone="soft" align="center" style={{ marginTop: space.xs }}>
          {name} · Room {rooms.join(', ')}
        </AppText>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: GUTTER, paddingTop: space.sm, paddingBottom: space.md },
  progressTrack: { height: 3, marginHorizontal: GUTTER, borderRadius: 2, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.brand },
  pager: { flex: 1, flexDirection: 'row' },
  content: { paddingHorizontal: GUTTER, paddingBottom: space.huge },
  heading: { marginTop: space.xl, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  label: { marginBottom: space.xs + 2, marginLeft: 2 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.brandSoft },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: GUTTER,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  overlay: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  doneCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});

export default NewBookingScreen;
