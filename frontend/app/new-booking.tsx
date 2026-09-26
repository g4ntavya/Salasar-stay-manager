import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
} from 'react-native';
// Firestore no longer used — room availability uses RTDB directly
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import LoadingSpinner from '../src/components/LoadingSpinner';
import {
  createBookings,
  createCustomer,
  subscribeAvailableRooms,
  subscribeToActiveBookings,
  RtdbRoom,
  compareRoomIds,
  normalizeRoomId,
  normalizeBookingStatus,
} from '../src/utils/rtdbService';
import { getCached, setCached } from '../src/utils/cache';
import { defaultRoomSeeds } from '../src/utils/defaultRooms';
import { TOTAL_ROOMS } from '../src/utils/roomConstants';
import { parseAmount, describeAmount } from '../src/utils/amount';
import { localDay } from '../src/utils/date';
import * as ImagePicker from 'expo-image-picker';

const NewBookingScreen: React.FC = () => {
  const MAX_ID_IMAGES = 3;
  const router = useRouter();

  const formatDate = (date: Date | null) =>
    date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  // Guest Details
  const [guestName, setGuestName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [membersCount, setMembersCount] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState(''); // Token/advance for advance bookings
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');

  // ID Proof
  const [idNumber, setIdNumber] = useState('');
  const [idImageUrl, setIdImageUrl] = useState('');
  const [idImageUrls, setIdImageUrls] = useState<string[]>([]);
  const placeholderColor = '#555';

  // Booking Details: Date | null state (default to today / tomorrow for better UX)
  const [checkInDate, setCheckInDate] = useState<Date | null>(new Date());
  const [checkOutDate, setCheckOutDate] = useState<Date | null>(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<RtdbRoom[]>([]);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomsErrorShown, setRoomsErrorShown] = useState(false);
  const excludedRooms = useMemo(() => new Set(['1']), []);
  const fallbackRooms = useMemo(
    () =>
      defaultRoomSeeds
        .slice(0, TOTAL_ROOMS)
        .map((seed) => ({
          key: seed.room_number,
          room_no: seed.room_number,
          beds: seed.capacity ?? 1,
          type: seed.type,
          ac_make: seed.ac_make,
          remarks: seed.remarks,
          is_available: seed.status ? seed.status === 'AVAILABLE' : true,
          current_booking_id: seed.current_booking_id ?? null,
        }))
        .filter((room) => !excludedRooms.has(room.room_no))
        .sort((a, b) => compareRoomIds(a.room_no, b.room_no)),
    [excludedRooms]
  );
  const [rooms, setRooms] = useState<RtdbRoom[]>(() => fallbackRooms);
  const [unavailableRooms, setUnavailableRooms] = useState<Set<string>>(new Set());
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const parsedAmount = useMemo(() => parseAmount(amount, paymentMode), [amount, paymentMode]);

  // Determine if this is an advance booking (check-in date is in the future)
  const isAdvanceBooking = useMemo(() => {
    if (!checkInDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkIn = new Date(checkInDate);
    checkIn.setHours(0, 0, 0, 0);
    return checkIn > today;
  }, [checkInDate]);

  // Helper to determine if a room is unavailable. Reused for styling and handlers.
  const isRoomUnavailable = (roomNo: string, room?: RtdbRoom) => {
    // Firestore-derived occupancy state for the selected date
    if (unavailableRooms.has(roomNo)) return true;
    // RTDB-provided flags
    if (room?.is_available === false) return true;
    if (room?.status && room.status.toString().toLowerCase() === 'occupied') return true;
    if (room?.current_booking_id) return true;
    return false;
  };

  const buildAvailableList = (liveRooms: RtdbRoom[]) => {
    const seedMap = new Map<string, RtdbRoom>();
    fallbackRooms.forEach((seed) => {
      if (!excludedRooms.has(seed.room_no)) seedMap.set(seed.room_no, seed);
    });
    liveRooms.forEach((room) => {
      if (!excludedRooms.has(room.room_no)) {
        seedMap.set(room.room_no, {
          ...room,
          is_available: room.is_available !== false,
        });
      }
    });
    return Array.from(seedMap.values()).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
  };

  const resetForm = () => {
    setGuestName('');
    setFatherName('');
    setMobileNumber('');
    setMembersCount('');
    setVehicleNumber('');
    setAddress('');
    setAmount('');
    setTokenAmount('');
    setPaymentMode('CASH');
    setIdNumber('');
    setIdImageUrl('');
    setIdImageUrls([]);
    setCheckInDate(null);
    setCheckOutDate(null);
    setSelectedDate(null);
    setSelectedRooms([]);
  };

  // Hydrate from cache immediately for fast initial load
  useEffect(() => {
    (async () => {
      const cached = await getCached<RtdbRoom[]>('rooms:available');
      if (cached && cached.length) {
        setRooms(buildAvailableList(cached));
        setLoadingRooms(false);
      }
    })();
  }, []);

  useEffect(() => {
    setLoadingRooms(true);
    const unsubscribe = subscribeAvailableRooms(
      (liveRooms) => {
        const usable = buildAvailableList(liveRooms);
        setRooms(usable);
        setCached('rooms:available', liveRooms).catch(() => { }); // Cache for next load
        setSelectedRooms((current) => {
          const stillValid = current.filter((r) => usable.find((u) => u.key === r.key));
          return stillValid.length > 0 ? stillValid : [];
        });
        setLoadingRooms(false);
      },
      (error) => {
        console.error('Error subscribing to rooms:', error);
        const availableFallback = fallbackRooms.filter((r) => r.is_available);
        setRooms(availableFallback);
        setSelectedRooms((current) => {
          const stillValid = current.filter((r) => availableFallback.find((u) => u.key === r.key));
          return stillValid.length > 0 ? stillValid : [];
        });
        if (!roomsErrorShown) {
          const message =
            error && (error as any).code === 'PERMISSION_DENIED'
              ? 'Permission denied while reading rooms. Check your Realtime Database rules or credentials.'
              : 'Unable to load live room availability. Showing default list instead.';
          Alert.alert('Offline mode', message);
          setRoomsErrorShown(true);
        }
        setLoadingRooms(false);
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeToDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  const getDayBounds = (date: Date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  // Live list of current and upcoming bookings, shared with the dashboard (no extra download).
  useEffect(() => subscribeToActiveBookings(setActiveBookings), []);

  // Grey out rooms whose open bookings overlap the selected stay dates.
  useEffect(() => {
    const start = checkInDate || selectedDate || new Date();
    const end = checkOutDate || checkInDate || selectedDate || new Date();
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    if (rangeEnd < rangeStart) rangeEnd.setTime(rangeStart.getTime());
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(23, 59, 59, 999);

    const occupied = new Set<string>();
    activeBookings.forEach((b: any) => {
      const status = normalizeBookingStatus(b?.status);
      if (status === 'CHECKED_OUT' || status === 'CANCELLED') return;
      const roomNo = normalizeRoomId(b?.roomNo ?? b?.room_no);
      const bookingCheckIn = normalizeToDate(b?.checkInDate);
      const bookingCheckOut = normalizeToDate(b?.checkOutDate);
      if (!roomNo || !bookingCheckIn || !bookingCheckOut) return;
      if (bookingCheckIn.getTime() <= rangeEnd.getTime() && bookingCheckOut.getTime() >= rangeStart.getTime()) {
        occupied.add(roomNo);
      }
    });

    // Rooms currently flagged occupied are unavailable too.
    rooms.forEach((room) => {
      if (room.is_available === false || room.current_booking_id) occupied.add(room.room_no);
    });
    setUnavailableRooms(occupied);
  }, [checkInDate, checkOutDate, selectedDate, rooms, activeBookings]);

  useEffect(() => {
    // Auto-adjust selected rooms if any become unavailable
    setSelectedRooms((current) => {
      const valid = current.filter((room) => !isRoomUnavailable(room.room_no, room));
      return valid.length > 0 ? valid : [];
    });
  }, [rooms, unavailableRooms]);

  // Helpers & web input refs for web date popup support
  const checkInInputRef = React.useRef<any>(null);
  const checkOutInputRef = React.useRef<any>(null);

  const toDateInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const formatRoomType = (type?: string) => {
    if (!type) return '';
    return type.replace(/standard/gi, '').trim();
  };

  const openWebDateInput = (ref: React.RefObject<any>) => {
    if (ref && ref.current && typeof ref.current.click === 'function') ref.current.click();
  };

  const pickIdImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow camera access to attach an ID image.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
        allowsEditing: true, // freeform crop
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const dataUri = await assetToDataUri(asset, 0);
        if (dataUri) {
          setIdImageUrl(dataUri);
          setIdImageUrls((prev) => [...prev, dataUri]);
        }
      }
    } catch (err) {
      console.error('Image pick error', err);
      Alert.alert('Error', 'Unable to pick image');
    }
  };

  const pickIdImagesFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access to attach ID images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: true,
        selectionLimit: 5,
        allowsEditing: false, // 🔥 ENTERPRISE: Disable editing for multi-select as it causes issues on some devices
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newUris: string[] = [];
        for (let i = 0; i < result.assets.length; i++) {
          const asset = result.assets[i];
          const dataUri = await assetToDataUri(asset, i);
          if (dataUri) newUris.push(dataUri);
        }
        if (newUris.length > 0) {
          setIdImageUrl(newUris[0]); // keep first as primary
          setIdImageUrls((prev) => [...prev, ...newUris]);
        }
      }
    } catch (err) {
      console.error('Image pick error', err);
      Alert.alert('Error', 'Unable to pick images');
    }
  };

  const addManualImageUrl = () => {
    const trimmed = idImageUrl.trim();
    if (!trimmed) return;
    setIdImageUrls((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const removeImageAt = (idx: number) => {
    setIdImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const assetToDataUri = async (asset: ImagePicker.ImagePickerAsset, idx: number = 0) => {
    const mime = asset.mimeType || 'image/jpeg';
    
    // 🔥 ENTERPRISE FIX: Always return a file:// URI (no base64) to keep caches tiny and staff-visible
    if (asset.uri && !asset.uri.startsWith('data:')) {
      return asset.uri;
    }

    if (asset.base64) {
      try {
        const { saveBase64ToFile } = require('../src/utils/imageStorage');
        return await saveBase64ToFile(`data:${mime};base64,${asset.base64}`, 'temp_new_booking', idx);
      } catch (e) {
        console.warn('[NewBooking] Failed to persist base64 image, falling back to data URI', e);
        return `data:${mime};base64,${asset.base64}`;
      }
    }
    return null;
  };

  // Keep primary URL in sync with list for backward compatibility fields
  useEffect(() => {
    if (idImageUrls.length > 0) {
      setIdImageUrl(idImageUrls[0]);
    } else if (idImageUrl && idImageUrls.length === 0) {
      // keep manual single value
      setIdImageUrls([idImageUrl]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idImageUrls]);

  const validateForm = () => {
    if (!guestName.trim()) {
      Alert.alert('Missing Info', 'Guest name is required');
      return false;
    }
    if (!mobileNumber.trim()) {
      Alert.alert('Missing Info', 'Mobile number is required');
      return false;
    }
    if (!membersCount.trim()) {
      Alert.alert('Missing Info', 'Number of members is required');
      return false;
    }
    if (!amount.trim()) {
      Alert.alert('Missing Info', 'Amount is required');
      return false;
    }
    if (parsedAmount.total <= 0) {
      Alert.alert('Invalid Amount', 'Enter the amount as a number, e.g. 1500 or 1000p, 500c (p = UPI, c = cash).');
      return false;
    }
    if (selectedRooms.length === 0) {
      Alert.alert('Missing Info', 'Please select at least one available room');
      return false;
    }
    // Use unified availability check (RTDB + Firestore)
    const invalid = selectedRooms.find((room) => isRoomUnavailable(room.room_no, room));
    if (invalid) {
      Alert.alert('Room occupied', `Room ${invalid.room_no} is already booked. Please pick another room.`);
      return false;
    }

    // Dates must be selected
    if (!checkInDate || !checkOutDate) {
      Alert.alert('Missing Info', 'Please select both check-in and check-out dates');
      return false;
    }

    // Check-out must not be earlier than check-in (equal allowed)
    if (checkOutDate < checkInDate) {
      Alert.alert('Invalid Dates', 'Check-out must be the same or after check-in');
      return false;
    }

    return true;
  };

  const submissionLock = useRef(false);

  const handleCreateBooking = async () => {
    if (submissionLock.current) {
      console.log('[NewBooking] Blocked duplicate submission attempt');
      return;
    }

    if (!validateForm() || selectedRooms.length === 0 || !checkInDate || !checkOutDate) return;

    const members = Number.parseInt(membersCount, 10) || 0;

    submissionLock.current = true;
    setIsSubmitting(true);

    try {
      console.log('[NewBooking] Starting booking creation process');
      console.log('[NewBooking] Selected rooms:', selectedRooms.map(r => r.room_no));

      const customerId = await createCustomer({
        guestName: guestName.trim(),
        fatherName: fatherName.trim() || undefined,
        mobileNumber: mobileNumber.trim(),
        address: address.trim() || undefined,
        city: undefined,
        amount: amount.trim(),
        idNumber: idNumber.trim() || undefined,
        membersCount: members,
        vehicleNumber: vehicleNumber.trim() || undefined,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        selectedRoom: selectedRooms.map((r) => r.room_no).join(','),
        idImageUrls,
        idImageUrl: idImageUrls[0] ?? idImageUrl ?? undefined,
        paymentMode,
      });
      console.log('[NewBooking] Customer created with ID:', customerId);

      // ──────────── OPTIMISTIC CUSTOMER CACHE WITH LOCAL IMAGES ────────────
      try {
        const primaryImage = idImageUrls[0] || idImageUrl || undefined;
        const optimisticCustomer = {
          id: customerId,
          name: guestName.trim() || 'Guest',
          guestName: guestName.trim() || 'Guest',
          mobile: mobileNumber.trim(),
          mobileNumber: mobileNumber.trim(),
          address: address.trim() || '',
          city: '',
          vehicleNumber: vehicleNumber.trim() || '',
          amount: amount.trim() || '',
          checkInDate: checkInDate.toISOString(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          idImageUrls: idImageUrls.slice(0, MAX_ID_IMAGES),
          idImageUrl: primaryImage,
        };

        const recentCached = (await getCached<any[]>('customers:recent')) || [];
        const listCached = (await getCached<any[]>('customers:list')) || [];

        const mergeUnique = (arr: any[]) => {
          const seen = new Set<string>();
          const merged: any[] = [];
          [optimisticCustomer, ...arr].forEach(c => {
            const key = c?.id || c?.mobile || Math.random().toString();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(c);
          });
          return merged;
        };

        await Promise.all([
          setCached('customers:recent', mergeUnique(recentCached)),
          setCached('customers:list', mergeUnique(listCached)),
        ]);
        console.log('[NewBooking] ✅ Optimistic customer cached with local images');
      } catch (cacheErr) {
        console.warn('[NewBooking] Unable to cache optimistic customer (non-critical):', cacheErr);
      }

      // All rooms of the stay are booked in one atomic write.
      await createBookings(
        customerId,
        selectedRooms.map((room) => room.room_no.toString()),
        checkInDate.toISOString(),
        checkOutDate.toISOString(),
        paymentMode,
        {
          amountRaw: amount.trim(),
          tokenAmount: Number(tokenAmount) || 0,
          guestName: guestName.trim(),
          membersCount: parseInt(membersCount, 10) || 1,
          mobile: mobileNumber.trim(),
        }
      );

      // ──────────── OPTIMISTIC CACHE UPDATE (INSTANT REFLECTION) ────────────
      try {
        console.log('[NewBooking] Performing optimistic cache update...');

        // 1. Update dashboard stats optimistically
        const cachedStats = await getCached<any>('dashboard:stats');
        if (cachedStats) {
          const todayStr = localDay();
          const checkInStr = localDay(checkInDate);

          // Only mark as occupied now if check-in is today or earlier.
          if (checkInStr <= todayStr) {
            const newOccupiedRoomNos = [...(cachedStats.occupiedRoomNos || [])];
            selectedRooms.forEach(r => {
              if (!newOccupiedRoomNos.includes(r.room_no)) {
                newOccupiedRoomNos.push(r.room_no);
              }
            });
            const occupiedCount = newOccupiedRoomNos.length;
            const optimisticStats = {
              ...cachedStats,
              occupiedRooms: occupiedCount,
              availableRooms: (cachedStats.totalRooms || TOTAL_ROOMS) - occupiedCount,
              occupiedRoomNos: newOccupiedRoomNos.sort(),
            };
            await setCached('dashboard:stats', optimisticStats);
            console.log('[NewBooking] ✅ Dashboard stats updated optimistically');
          }
        }

        // 2. Invalidate bookings cache to force fresh fetch (customers already updated optimistically)
        await setCached('bookings:list', null);
        console.log('[NewBooking] ✅ Bookings cache invalidated for fresh fetch');

      } catch (cacheErr) {
        console.warn('[NewBooking] Optimistic cache update failed (non-critical):', cacheErr);
      }

      Alert.alert('Success', 'Booking created successfully!');
      resetForm();

      // Navigate to dashboard
      router.push('/(tabs)/dashboard' as any);

    } catch (error: any) {
      console.error('[NewBooking] Error creating booking:', error);
      Alert.alert('Error', error?.message || 'Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
      submissionLock.current = false;
    }
  };

  if (loadingRooms && rooms.length === 0) {
    return <LoadingSpinner message="Loading available rooms..." />;
  }

  // Handlers for pickers:
  const onCheckInChange = (_event: any, date?: Date | undefined) => {
    setShowCheckInPicker(false);
    if (!date) return; // user dismissed
    if (checkOutDate && date > checkOutDate) {
      Alert.alert('Invalid Date', 'Check-in cannot be after the current check-out date.');
      return;
    }
    setSelectedDate(date);
    setCheckInDate(date);
    if (!checkOutDate) {
      setCheckOutDate(new Date(date.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  const onCheckOutChange = (_event: any, date?: Date | undefined) => {
    setShowCheckOutPicker(false);
    if (!date) return; // user dismissed
    if (!checkInDate) {
      Alert.alert('Pick check-in first', 'Please select a check-in date before selecting check-out.');
      return;
    }
    if (date < checkInDate) {
      Alert.alert('Invalid Date', 'Check-out must not be earlier than the selected check-in date.');
      return;
    }
    setCheckOutDate(date);
  };

  // Web handlers for hidden date inputs
  const onWebCheckInChange = (e: any) => {
    const v = e.target.value; // YYYY-MM-DD
    if (!v) return;
    const d = new Date(v + 'T00:00:00');
    if (checkOutDate && d > checkOutDate) {
      setCheckInDate(d);
      setCheckOutDate(new Date(d.getTime() + 24 * 60 * 60 * 1000));
      setSelectedDate(d);
      window.alert('Selected check-in is after current check-out. Check-out moved to next day.');
    } else {
      setCheckInDate(d);
      setSelectedDate(d);
      if (!checkOutDate) setCheckOutDate(new Date(d.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  const onWebCheckOutChange = (e: any) => {
    const v = e.target.value;
    if (!v) return;
    const d = new Date(v + 'T00:00:00');
    if (!checkInDate) {
      window.alert('Please choose a check-in date first.');
      return;
    }
    if (d < checkInDate) {
      window.alert('Check-out cannot be earlier than check-in.');
      return;
    }
    setCheckOutDate(d);
  };

  const handleSelectRoom = (room: RtdbRoom) => {
    if (isRoomUnavailable(room.room_no, room)) return;
    setSelectedRooms((current) => {
      const exists = current.find((r) => r.key === room.key);
      if (exists) {
        return current.filter((r) => r.key !== room.key);
      }
      return [...current, room];
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>New Booking / Check-in</Text>

          <Text style={styles.sectionTitle}>Guest Details</Text>
          <TextInput
            style={styles.input}
            placeholder="Guest Name *"
            placeholderTextColor={placeholderColor}
            value={guestName}
            onChangeText={setGuestName}
          />
          <TextInput
            style={styles.input}
            placeholder="Father's Name"
            placeholderTextColor={placeholderColor}
            value={fatherName}
            onChangeText={setFatherName}
          />
          <TextInput
            style={styles.input}
            placeholder="Mobile Number *"
            placeholderTextColor={placeholderColor}
            value={mobileNumber}
            onChangeText={setMobileNumber}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Number of Members *"
            placeholderTextColor={placeholderColor}
            value={membersCount}
            onChangeText={setMembersCount}
            keyboardType="number-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Vehicle Number"
            placeholderTextColor={placeholderColor}
            value={vehicleNumber}
            onChangeText={setVehicleNumber}
          />
          <TextInput
            style={styles.input}
            placeholder="Address"
            placeholderTextColor={placeholderColor}
            value={address}
            onChangeText={setAddress}
          />
          <TextInput
            style={styles.input}
            placeholder="Amount * (e.g. 1500 or 1000p, 500c)"
            placeholderTextColor={placeholderColor}
            value={amount}
            onChangeText={setAmount}
            keyboardType="default"
          />
          {amount.trim() !== '' && (
            <Text style={[styles.tokenHelpText, parsedAmount.total > 0 ? styles.tokenPaid : styles.tokenUnpaid]}>
              {parsedAmount.total > 0
                ? `Total ${describeAmount(parsedAmount)}`
                : 'Could not read an amount. Use numbers like 1500 or 1000p, 500c'}
            </Text>
          )}

          {/* Token field - only visible for advance bookings */}
          {isAdvanceBooking && (
            <View>
              <TextInput
                style={[
                  styles.input,
                  Number(tokenAmount) > 0 && styles.inputSuccess
                ]}
                placeholder="Token Amount (optional)"
                placeholderTextColor={placeholderColor}
                value={tokenAmount}
                onChangeText={setTokenAmount}
                keyboardType="numeric"
              />
              <Text style={[
                styles.tokenHelpText,
                Number(tokenAmount) > 0 ? styles.tokenPaid : styles.tokenUnpaid
              ]}>
                {Number(tokenAmount) > 0
                  ? `✓ PAID - Token ₹${tokenAmount} received`
                  : '○ UNPAID - Enter token if advance received'}
              </Text>
            </View>
          )}

          <View style={styles.paymentContainer}>
            <TouchableOpacity
              style={[styles.paymentButton, paymentMode === 'CASH' && styles.paymentButtonActive]}
              onPress={() => setPaymentMode('CASH')}
            >
              <Ionicons name="cash-outline" size={20} color={paymentMode === 'CASH' ? '#fff' : '#4b5563'} />
              <Text style={[styles.paymentButtonText, paymentMode === 'CASH' && styles.paymentButtonTextActive]}>Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paymentButton, paymentMode === 'UPI' && styles.paymentButtonActive]}
              onPress={() => setPaymentMode('UPI')}
            >
              <Ionicons name="qr-code-outline" size={20} color={paymentMode === 'UPI' ? '#fff' : '#4b5563'} />
              <Text style={[styles.paymentButtonText, paymentMode === 'UPI' && styles.paymentButtonTextActive]}>UPI</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>ID Proof</Text>
          <TextInput style={styles.input} value="Aadhaar" editable={false} />
          <TextInput
            style={styles.input}
            placeholder="ID Number (optional)"
            placeholderTextColor={placeholderColor}
            value={idNumber}
            onChangeText={setIdNumber}
            keyboardType="default"
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="ID Image URL"
              placeholderTextColor={placeholderColor}
              value={idImageUrl}
              onChangeText={setIdImageUrl}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.addUrlButton} onPress={addManualImageUrl}>
              <Text style={styles.addUrlText}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.imageRow}>
            <TouchableOpacity style={styles.imageButton} onPress={pickIdImage}>
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.imageButtonText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageButtonSecondary} onPress={pickIdImagesFromLibrary}>
              <Ionicons name="images" size={18} color="#dc2626" />
              <Text style={styles.imageButtonTextSecondary}>Gallery</Text>
            </TouchableOpacity>
            {idImageUrls.length > 0 && (
              <Pressable
                onPress={() => {
                  setIdImageUrls([]);
                  setIdImageUrl('');
                }}
                style={styles.clearImageButton}
              >
                <Text style={styles.clearImageText}>Clear</Text>
              </Pressable>
            )}
          </View>
          {idImageUrls.length > 0 ? (
            <View style={styles.previewList}>
              {idImageUrls.map((uri, idx) => (
                <View key={idx} style={styles.previewItem}>
                  <Image source={uri ? { uri } : require('../assets/images/icon.png')} style={styles.previewImage} />
                  <Pressable style={styles.removeThumb} onPress={() => removeImageAt(idx)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Booking Details</Text>

          {/* Check-in Date Picker */}
          <TouchableOpacity
            style={styles.input}
            onPress={() => {
              if (Platform.OS === 'web') {
                openWebDateInput(checkInInputRef);
              } else {
                setShowCheckInPicker(true);
              }
            }}
          >
            <Text style={styles.inputText}>
              {checkInDate ? formatDate(checkInDate) : 'Select check-in date *'}
            </Text>
          </TouchableOpacity>

          {/* Hidden web inputs (only used on web) */}
          {Platform.OS === 'web' && (
            <>
              <input
                ref={(el) => {
                  // @ts-ignore
                  checkInInputRef.current = el;
                }}
                type="date"
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
                value={checkInDate ? toDateInputValue(checkInDate) : ''}
                onChange={onWebCheckInChange}
              />
              <input
                ref={(el) => {
                  // @ts-ignore
                  checkOutInputRef.current = el;
                }}
                type="date"
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
                value={checkOutDate ? toDateInputValue(checkOutDate) : ''}
                onChange={onWebCheckOutChange}
              />
            </>
          )}

          {/* Check-out Date Picker */}
          <TouchableOpacity
            style={styles.input}
            onPress={() => {
              if (Platform.OS === 'web') {
                openWebDateInput(checkOutInputRef);
              } else {
                setShowCheckOutPicker(true);
              }
            }}
          >
            <Text style={styles.inputText}>
              {checkOutDate ? formatDate(checkOutDate) : 'Select check-out date *'}
            </Text>
          </TouchableOpacity>


          <Text style={styles.sectionTitle}>Select Room</Text>
          {loadingRooms ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#dc2626" />
              <Text style={styles.loadingText}>Fetching rooms...</Text>
            </View>
          ) : rooms.length === 0 ? (
            <Text style={styles.noRoomsText}>No rooms available right now.</Text>
          ) : (
            <View style={styles.roomsGrid}>
              {rooms.map((room) => {
                const isUnavailable = isRoomUnavailable(room.room_no, room);
                const isSelected =
                  !isUnavailable && selectedRooms.some((selected) => selected.key === room.key);

                return (
                  <TouchableOpacity
                    key={room.key}
                    style={[
                      styles.roomCard,
                      isUnavailable && styles.roomCardUnavailable,
                      isSelected && styles.roomCardSelected,
                    ]}
                    onPress={() => handleSelectRoom(room)}
                    disabled={isUnavailable}
                  >
                    {isUnavailable && (
                      <>
                        <View style={styles.unavailableStripe} />
                        <View style={styles.unavailableBadge}>
                          <Text style={styles.unavailableBadgeText}>Booked</Text>
                        </View>
                      </>
                    )}

                    <Text
                      style={[
                        styles.roomNumber,
                        isUnavailable && styles.roomTextUnavailable,
                      ]}
                    >
                      {(() => {
                        const roomNo = room.room_no;
                        const isBasementOrCommon =
                          room.type.toLowerCase().includes('basement') ||
                          room.type.toLowerCase().includes('common') ||
                          room.room_no.toLowerCase().includes('basement') ||
                          room.room_no.toLowerCase().startsWith('cb');

                        if (isBasementOrCommon) {
                          return roomNo;
                        }

                        if (roomNo === '302') return 'Room 302 (Small Hall Non AC)';
                        if (roomNo === '304') return 'Room 304 (Hall AC)';

                        let display = `Room ${roomNo}`;

                        if (roomNo === '107' || roomNo === '110') {
                          // Skip AC labels for these rooms
                        } else {
                          const acRooms = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '101', '102', '103', '105', '106', '107', '110', '112', '114', '115', '116', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '303', '304', '306', '307', '108', '109'];

                          const type = (room.type || '').toUpperCase();
                          const isExplicitNonAc = type.includes('NON AC') || type.includes('NON-AC');
                          const isExplicitAc = type.includes('AC');
                          const isInAcList = acRooms.includes(roomNo);

                          if (isExplicitNonAc) {
                            display += ' (Non AC)';
                          } else if (isExplicitAc || isInAcList) {
                            display += ' (AC)';
                          }
                        }

                        if (room.beds > 0) {
                          display += ` – ${room.beds} bed${room.beds === 1 ? '' : 's'}`;
                        }

                        return display;
                      })()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Date pickers — use fallback value when state is null */}
          {Platform.OS !== 'web' && showCheckInPicker && (
            <DateTimePicker
              testID="dateTimePickerCheckIn"
              value={checkInDate ?? new Date()}
              mode="date"
              display="calendar"
              onChange={onCheckInChange}
              maximumDate={new Date(2100, 11, 31)}
              minimumDate={new Date(1900, 0, 1)}
            />
          )}
          {Platform.OS !== 'web' && showCheckOutPicker && (
            <DateTimePicker
              testID="dateTimePickerCheckOut"
              value={checkOutDate ?? (checkInDate ?? new Date())}
              mode="date"
              display="calendar"
              onChange={onCheckOutChange}
              maximumDate={new Date(2100, 11, 31)}
              minimumDate={checkInDate ?? new Date(1900, 0, 1)}
            />
          )}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleCreateBooking}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Create Booking</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#111827',
    marginTop: 8,
  },
  inputText: {
    fontSize: 16,
    color: '#111827',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  addUrlButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addUrlText: {
    color: '#fff',
    fontWeight: '700',
  },
  tokenHelpText: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
    fontWeight: '600',
  },
  tokenPaid: {
    color: '#16a34a',
  },
  tokenUnpaid: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  inputSuccess: {
    borderColor: '#16a34a',
    borderWidth: 2,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  imageButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  imageButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  imageButtonTextSecondary: {
    color: '#dc2626',
    fontWeight: '600',
  },
  clearImageButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearImageText: {
    color: '#dc2626',
    fontWeight: '600',
  },
  paymentContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  paymentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  paymentButtonActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  paymentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  paymentButtonTextActive: {
    color: '#fff',
  },
  previewImage: {
    marginTop: 8,
    height: 140,
    width: '100%',
    borderRadius: 8,
    resizeMode: 'contain',
    backgroundColor: '#f3f4f6',
  },
  previewList: {
    marginTop: 8,
    gap: 8,
  },
  previewItem: {
    position: 'relative',
  },
  removeThumb: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  roomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  roomCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    position: 'relative',
  },
  roomCardUnavailable: {
    backgroundColor: '#E5E7EB',
    borderColor: '#9CA3AF',
    opacity: 0.95,
  },
  roomCardSelected: {
    borderColor: '#FBBF24',
    backgroundColor: '#D1FAE5',
  },
  roomInfo: {
    justifyContent: 'center',
  },
  roomNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  roomTextUnavailable: {
    color: '#4B5563',
  },
  unavailableBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F97373',
    zIndex: 2,
  },
  unavailableBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  unavailableStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#9CA3AF',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    zIndex: 1,
  },
  roomType: {
    fontSize: 14,
    color: '#6b7280',
  },
  roomCapacity: {
    fontSize: 12,
    color: '#6b7280',
  },
  roomRemarks: {
    fontSize: 12,
    color: '#9ca3af',
  },
  roomStatus: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  roomStatusAvailable: {
    color: '#10b981',
  },
  roomStatusOccupied: {
    color: '#ef4444',
  },
  roomCardDisabled: {
    opacity: 0.6,
  },
  noRoomsText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    padding: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    color: '#6b7280',
  },
  submitButton: {
    marginTop: 20,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#f87171',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default NewBookingScreen;
