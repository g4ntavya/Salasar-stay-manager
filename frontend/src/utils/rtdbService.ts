import { rtdb } from '@/lib/firebase';
import {
  ref,
  push,
  set,
  update,
  get,
  onValue,
  off,
  DataSnapshot,
  runTransaction,
  query,
  orderByChild,
  limitToLast,
} from 'firebase/database';
import { TOTAL_ROOMS } from './roomConstants';
import { BookingStatus } from '../types';

export type RtdbRoom = {
  key: string;
  room_no: string;
  beds: number;
  type: string;
  ac_make?: string;
  remarks?: string;
  status?: 'available' | 'occupied';
  is_available: boolean;
  current_booking_id?: string | null;
};

export const normalizeRoomId = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return value.toString();
  return String(value).trim();
};

export const compareRoomIds = (a: string, b: string) => {
  const numA = Number(a);
  const numB = Number(b);
  const aIsNum = !Number.isNaN(numA);
  const bIsNum = !Number.isNaN(numB);
  if (aIsNum && bIsNum) return numA - numB;
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

// UI-only overrides for room labels/capacity without mutating backend data.
const ROOM_UI_LABEL_OVERRIDES: Record<
  string,
  {
    type?: string;
    beds?: number;
    ac_make?: string;
    remarks?: string;
  }
> = {
  '2': { beds: 3, type: 'AC' },
  '3': { beds: 3, type: 'AC' },
  '4': { beds: 2, type: 'AC' },
  '5': { beds: 3, type: 'AC' },
  '6': { beds: 4, type: 'AC' },
  '7': { beds: 4, type: 'AC' },
  '8': { beds: 3, type: 'AC' },
  '9': { beds: 2, type: 'AC' },
  '10': { beds: 3, type: 'AC' },
  '11': { beds: 3, type: 'AC' },
  '101': { beds: 4, type: 'AC' },
  '102': { beds: 3, type: 'AC' },
  '103': { beds: 3, type: 'AC' },
  '104': { beds: 2, type: 'Non AC' },
  '105': { beds: 2, type: 'AC' },
  '106': { beds: 3, type: 'AC' },
  '108': { beds: 3, type: 'AC' },
  '109': { beds: 3, type: 'AC' },
  '111': { beds: 2, type: 'Non AC' },
  '112': { beds: 2, type: 'AC' },
  '113': { beds: 3, type: 'AC' },
  '114': { beds: 3, type: 'AC' },
  '115': { beds: 3, type: 'AC' },
  '116': { beds: 4, type: 'AC' },
  '201': { beds: 4, type: 'AC' },
  '202': { beds: 6, type: 'AC' },
  '203': { beds: 4, type: 'AC' },
  '204': { beds: 6, type: 'AC' },
  '205': { beds: 4, type: 'AC' },
  '206': { beds: 2, type: 'AC' },
  '207': { beds: 4, type: 'AC' },
  '208': { beds: 4, type: 'AC' },
  '209': { beds: 2, type: 'AC' },
  '210': { beds: 4, type: 'AC' },
  '211': { beds: 4, type: 'Non AC' },
  '301': { beds: 4, type: 'Non AC' },
  '302': { beds: 0, type: 'Non AC Small Hall' },
  '303': { beds: 4, type: 'AC' },
  '304': { beds: 0, type: 'AC Big Hall' },
  '305': { beds: 4, type: 'Non AC' },
  '306': { beds: 6, type: 'AC' },
  '307': { beds: 4, type: 'AC' },
  'Basement 1': { beds: 1, type: 'Basement' },
  'Basement 2': { beds: 1, type: 'Basement' },
  'CB1': { beds: 0, type: 'Common Bathroom' },
  'CB2': { beds: 0, type: 'Common Bathroom' },
  'CB3': { beds: 0, type: 'Common Bathroom' },
};

export type RtdbCustomerInput = {
  guestName: string;
  fatherName?: string;
  mobileNumber: string;
  membersCount: number;
  vehicleNumber?: string;
  address?: string;
  city?: string;
  amount?: string;
  idNumber?: string;
  idImageUrl?: string | null;
  idImageUrls?: string[];
  checkInDate: string;
  checkOutDate: string;
  selectedRoom: string | number;
};

export const updateCustomer = async (
  id: string,
  data: Partial<RtdbCustomerInput>
): Promise<void> => {
  const now = Date.now();
  const idImages = Array.isArray(data.idImageUrls) ? data.idImageUrls : undefined;
  const trimmedIdNumber =
    data.idNumber !== undefined && data.idNumber !== null ? data.idNumber.trim() : undefined;
  const primaryIdImage =
    (idImages && idImages.length > 0 ? idImages[0] : undefined) ??
    (data.idImageUrl !== undefined ? data.idImageUrl || '' : undefined);
  const shouldUpdateIdType =
    data.idNumber !== undefined || data.idImageUrl !== undefined || data.idImageUrls !== undefined;
  const hasIdDetails =
    (trimmedIdNumber && trimmedIdNumber.length > 0) ||
    (primaryIdImage !== undefined && primaryIdImage !== '');
  const idTypeValue = hasIdDetails ? 'Aadhaar' : '';
  const updates: any = {
    updatedAt: now,
  };

  const maybeAssign = (key: string, value: any) => {
    if (value !== undefined) updates[key] = value;
  };

  const nameLower = data.guestName ? data.guestName.toLowerCase() : undefined;
  const vehicleLower = data.vehicleNumber ? data.vehicleNumber.toLowerCase() : undefined;

  maybeAssign('guestName', data.guestName);
  maybeAssign('fatherName', data.fatherName);
  maybeAssign('mobileNumber', data.mobileNumber);
  maybeAssign('membersCount', data.membersCount);
  maybeAssign('vehicleNumber', data.vehicleNumber);
  maybeAssign('address', data.address);
  maybeAssign('city', data.city);
  maybeAssign('amount', data.amount);
  maybeAssign('nameLower', nameLower);
  maybeAssign('vehicleLower', vehicleLower);
  if (shouldUpdateIdType) {
    maybeAssign('idType', idTypeValue);
  }
  if (trimmedIdNumber !== undefined) {
    maybeAssign('idNumber', trimmedIdNumber);
  }
  if (data.idImageUrl !== undefined || idImages !== undefined) {
    maybeAssign('idImageUrl', primaryIdImage ?? '');
    maybeAssign('idImageUrls', idImages ?? (primaryIdImage ? [primaryIdImage] : []));
  }
  maybeAssign('checkInDate', data.checkInDate);
  maybeAssign('checkOutDate', data.checkOutDate);
  maybeAssign('selectedRoom', data.selectedRoom);

  // legacy aliases
  maybeAssign('name', data.guestName);
  maybeAssign('father_name', data.fatherName);
  maybeAssign('phone', data.mobileNumber);
  maybeAssign('member_count', data.membersCount);
  maybeAssign('vehicle_number', data.vehicleNumber);
  maybeAssign('address', data.address);
  maybeAssign('city', data.city);
  maybeAssign('amount', data.amount);
  maybeAssign('name_lower', nameLower);
  maybeAssign('vehicle_lower', vehicleLower);
  if (trimmedIdNumber !== undefined) {
    maybeAssign('id_number', trimmedIdNumber);
  }
  if (data.idImageUrl !== undefined || idImages !== undefined) {
    maybeAssign('id_image_url', primaryIdImage ?? '');
    maybeAssign('id_image_urls', idImages ?? (primaryIdImage ? [primaryIdImage] : []));
  }
  if (shouldUpdateIdType) {
    maybeAssign('id_type', idTypeValue);
  }

  await update(ref(rtdb, `customers/${id}`), updates);
};

export const deleteCustomer = async (id: string): Promise<void> => {
  // First, find and delete all bookings associated with this customer
  const bookingsRef = ref(rtdb, 'bookings');
  const bookingsSnapshot = await get(bookingsRef);
  
  if (bookingsSnapshot.exists()) {
    const bookingsData = bookingsSnapshot.val();
    const deletePromises: Promise<void>[] = [];
    
    // Find all bookings for this customer
    Object.entries(bookingsData).forEach(([bookingId, booking]: [string, any]) => {
      if (booking.customerId === id) {
        console.log(`[DeleteCustomer] Deleting booking ${bookingId} for customer ${id}`);
        deletePromises.push(set(ref(rtdb, `bookings/${bookingId}`), null));
      }
    });
    
    // Delete all associated bookings
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`[DeleteCustomer] Deleted ${deletePromises.length} bookings`);
    }
  }
  
  // Finally, delete the customer
  await set(ref(rtdb, `customers/${id}`), null);
  console.log(`[DeleteCustomer] Deleted customer ${id}`);
};

export const createCustomer = async (data: RtdbCustomerInput): Promise<string> => {
  const customersRef = ref(rtdb, 'customers');
  const newCustomerRef = push(customersRef);
  const now = Date.now();
  const idImages = Array.isArray(data.idImageUrls) ? data.idImageUrls : [];
  const trimmedIdNumber = (data.idNumber || '').trim();
  const hasIdDetails =
    trimmedIdNumber.length > 0 ||
    idImages.length > 0 ||
    (data.idImageUrl !== undefined && data.idImageUrl !== null && data.idImageUrl !== '');
  const primaryIdImage = idImages[0] ?? data.idImageUrl ?? '';
  const normalizedIdImages =
    idImages.length > 0 ? idImages : data.idImageUrl ? [data.idImageUrl] : [];
  const idTypeValue = hasIdDetails ? 'Aadhaar' : '';
  const nameLower = data.guestName ? data.guestName.toLowerCase() : '';
  const vehicleLower = data.vehicleNumber ? data.vehicleNumber.toLowerCase() : '';

  // Persist the exact field names requested by product plus legacy aliases for existing UI.
  await set(newCustomerRef, {
    guestName: data.guestName,
    fatherName: data.fatherName ?? '',
    mobileNumber: data.mobileNumber,
    membersCount: data.membersCount,
    vehicleNumber: data.vehicleNumber ?? '',
    address: data.address ?? '',
    city: data.city ?? '',
    amount: data.amount ?? '',
    nameLower,
    vehicleLower,
    idType: idTypeValue,
    idNumber: trimmedIdNumber,
    idImageUrl: hasIdDetails ? primaryIdImage : '',
    idImageUrls: hasIdDetails ? normalizedIdImages : [],
    checkInDate: data.checkInDate,
    checkOutDate: data.checkOutDate,
    selectedRoom: data.selectedRoom,
    status: 'active',
    createdAt: now,
    updatedAt: now,

    // Legacy aliases (for existing list components)
    name: data.guestName,
    father_name: data.fatherName ?? '',
    phone: data.mobileNumber,
    name_lower: nameLower,
    vehicle_lower: vehicleLower,
    id_type: idTypeValue,
    id_number: trimmedIdNumber,
    id_image_url: hasIdDetails ? primaryIdImage : '',
    member_count: data.membersCount,
    vehicle_number: data.vehicleNumber ?? '',
  });
  return newCustomerRef.key as string;
};

const matchesRoomNumber = (value: any, roomNo: string | number) => {
  const target = normalizeRoomId(roomNo);
  return normalizeRoomId(value.room_no) === target || normalizeRoomId(value.roomNumber) === target;
};

const findRoomEntryByRoomNo = (
  roomsVal: Record<string, any>,
  roomNo: string | number
): [string, any] | undefined =>
  Object.entries(roomsVal).find(([, value]: any) => matchesRoomNumber(value, roomNo)) as
    | [string, any]
    | undefined;

const ensureRoomExists = async (
  roomNo: string | number,
  roomsVal: Record<string, any>
): Promise<{ roomKey: string; roomVal: any }> => {
  const normalizedId = normalizeRoomId(roomNo);
  const existing = findRoomEntryByRoomNo(roomsVal, normalizedId);
  if (existing) {
    return { roomKey: existing[0], roomVal: existing[1] };
  }
  const roomsRef = ref(rtdb, 'rooms');
  const newRoomRef = push(roomsRef);
  const now = Date.now();
  const payload = {
    room_no: normalizedId,
    roomNumber: normalizedId,
    beds: 1,
    type: 'Standard',
    status: 'available',
    is_available: true,
    remarks: '',
    current_booking_id: null,
    createdAt: now,
    updatedAt: now,
  };
  await set(newRoomRef, payload);
  return { roomKey: newRoomRef.key as string, roomVal: payload };
};

function deriveRoomAvailability(room: any) {
  // Treat rooms as occupied only when explicitly marked unavailable.
  // If a stale current_booking_id remains but is_available is true (e.g., after checkout),
  // the room should be treated as free.
  const availableFlag = room?.is_available !== false;
  const hasActiveBooking = Boolean(room?.current_booking_id) && availableFlag === false;
  const isAvailable = availableFlag && !hasActiveBooking;
  return {
    isAvailable,
    normalizedStatus: isAvailable ? 'available' : 'occupied',
  };
}

export function normalizeBookingStatus(status?: string): BookingStatus {
  const normalized = (status || '').toString().toUpperCase();
  if (normalized === 'CHECKED_OUT' || normalized === 'CHECKEDOUT') return 'CHECKED_OUT';
  if (normalized === 'CANCELLED') return 'CANCELLED';
  return 'BOOKED';
}

export const createBooking = async (
  customerId: string,
  roomNo: string | number,
  checkInDate: string,
  checkOutDate: string
): Promise<string> => {
  const normalizedRoomNo = normalizeRoomId(roomNo);
  
  // Fetch room data once
  const roomsSnap = await get(ref(rtdb, 'rooms'));
  const roomsVal = roomsSnap.val() || {};
  const { roomKey, roomVal } = await ensureRoomExists(normalizedRoomNo, roomsVal);
  
  const bookingsRef = ref(rtdb, 'bookings');
  const newBookingRef = push(bookingsRef);
  const bookingId = newBookingRef.key as string;
  const now = Date.now();
  const roomRef = ref(rtdb, `rooms/${roomKey}`);
  let roomLocked = false;

  try {
    // Atomically reserve the room: abort if already occupied.
    console.log('[RTDB] Starting room transaction for:', normalizedRoomNo);
    const txResult = await runTransaction(roomRef, (currentRoom) => {
      const existingRoom = currentRoom || roomVal;
      if (!existingRoom) {
        console.log('[RTDB] Transaction aborted: room does not exist');
        return undefined; // Abort transaction
      }
      const { isAvailable } = deriveRoomAvailability(existingRoom);
      if (!isAvailable) {
        console.log('[RTDB] Transaction aborted: room not available');
        return undefined; // Abort transaction
      }

      console.log('[RTDB] Transaction updating room to occupied');
      return {
        ...existingRoom,
        is_available: false,
        status: 'occupied',
        current_booking_id: bookingId,
        updatedAt: now,
      };
    }, { applyLocally: false });

    console.log('[RTDB] Transaction result:', { committed: txResult.committed });
    if (!txResult.committed) {
      throw new Error('Room already occupied');
    }
    roomLocked = true;

    // Write booking - simplified payload
    console.log('[RTDB] Writing booking to database:', bookingId);
    await set(newBookingRef, {
      customerId,
      roomNo: normalizedRoomNo,
      checkInDate,
      checkOutDate,
      status: 'BOOKED',
      createdAt: now,
      updatedAt: now,
    });
    console.log('[RTDB] Booking created successfully:', bookingId);

    return bookingId;
  } catch (error) {
    console.error('[RTDB] Error in createBooking:', error);
    if (roomLocked) {
      // Roll back room lock if booking write fails.
      await update(roomRef, {
        is_available: true,
        status: 'available',
        current_booking_id: null,
        updatedAt: Date.now(),
      }).catch(() => {});
    }
    throw error;
  }
};

export const markRoomOccupied = async (roomKey: string, bookingId: string) => {
  const roomRef = ref(rtdb, `rooms/${roomKey}`);
  const now = Date.now();
  const res = await runTransaction(roomRef, (currentRoom) => {
    if (!currentRoom) {
      return undefined; // Abort transaction
    }
    const { isAvailable } = deriveRoomAvailability(currentRoom);
    if (!isAvailable && currentRoom.current_booking_id !== bookingId) {
      return undefined; // Abort transaction
    }
    return {
      ...currentRoom,
      is_available: false,
      status: 'occupied',
      current_booking_id: bookingId,
      updatedAt: now,
    };
  });

  if (!res.committed) {
    throw new Error('Room already occupied');
  }
};

export const fetchCustomerById = async (
  id: string
): Promise<{
  id: string;
  name: string;
  father_name?: string;
  address?: string;
  city?: string;
  amount?: string;
  mobile: string;
  id_number?: string;
  id_type?: string;
  membersCount?: number;
  vehicleNumber?: string;
  createdAt?: number;
  checkInDate?: string;
  idImageUrl?: string;
  idImageUrls?: string[];
} | null> => {
  const snap = await get(ref(rtdb, `customers/${id}`));
  if (!snap.exists()) return null;
  const c = snap.val() as any;
  const amount = c.amount ?? '';
  return {
    id,
    name: c.guestName || c.name || 'Guest',
    father_name: c.fatherName || c.father_name || '',
    address: c.address || '',
    amount,
    mobile: c.mobileNumber || c.phone || '',
    id_number: c.idNumber || c.id_number || '',
    id_type: c.idType || c.id_type || '',
    membersCount: c.membersCount || c.member_count || 1,
    vehicleNumber: c.vehicleNumber || c.vehicle_number || '',
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : undefined,
    checkInDate: c.checkInDate,
    idImageUrl: c.idImageUrl || c.id_image_url || '',
    idImageUrls: c.idImageUrls || [],
  };
};

export const fetchCustomers = async (limit: number = 200): Promise<
  Array<{
    id: string;
    name: string;
    mobile: string;
    father_name?: string;
    address?: string;
    city?: string;
    id_number?: string;
    id_type?: string;
    membersCount?: number;
    vehicleNumber?: string;
    createdAt?: number;
    checkInDate?: string;
    idImageUrl?: string;
    idImageUrls?: string[];
  }>
> => {
  const customersRef = ref(rtdb, 'customers');
  let snap;
  try {
    const q = query(customersRef, orderByChild('createdAt'), limitToLast(limit));
    snap = await get(q);
  } catch (err) {
    console.warn('Customer ordered fetch failed; falling back to full fetch.', err);
    snap = await get(customersRef);
  }
  // Fallback for historical data without createdAt ordering.
  if (!snap || !snap.exists()) {
    snap = await get(customersRef);
  }
  if (!snap.exists()) return [];
  const val = snap.val() || {};
  return Object.entries(val).map(([key, value]) => {
    const c = value as any;
    return {
      id: key,
      name: c.guestName || c.name || 'Guest',
      father_name: c.fatherName || c.father_name || '',
      address: c.address || '',
      city: c.city || '',
      mobile: c.mobileNumber || c.phone || '',
      id_number: c.idNumber || c.id_number || '',
      id_type: c.idType || c.id_type || '',
      membersCount: c.membersCount || c.member_count || 1,
      vehicleNumber: c.vehicleNumber || c.vehicle_number || '',
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : undefined,
      checkInDate: c.checkInDate,
      idImageUrl: c.idImageUrl || c.id_image_url || '',
      idImageUrls: c.idImageUrls || [],
    };
  });
};

const roomIsAvailable = (room: RtdbRoom) =>
  room.is_available !== false && !room.current_booking_id;

export const computeRoomStats = (rooms: RtdbRoom[]) => {
  // Always report against the fixed inventory size, even if RTDB has fewer entries.
  const totalRooms = TOTAL_ROOMS;
  const occupiedRooms = rooms.filter((r) => !roomIsAvailable(r)).length;
  const availableRooms = Math.max(totalRooms - occupiedRooms, 0);
  const occupiedRoomNos = rooms
    .filter((r) => !roomIsAvailable(r))
    .map((r) => r.room_no)
    .sort(compareRoomIds);
  return { totalRooms, occupiedRooms, availableRooms, occupiedRoomNos };
};

export type BookingDetail = {
  id: string;
  customerId: string;
  roomNo: string;
  roomNumbers?: string[];
  relatedBookingIds?: string[];
  status: string;
  checkInDate: string;
  checkOutDate: string;
  checkOutActual?: string;
  createdAt?: number;
  roomKey?: string;
  customer?: {
    name: string;
    mobile: string;
    father_name?: string;
    address?: string;
    city?: string;
    amount?: string;
  };
  room?: RtdbRoom;
};

export const fetchBookingById = async (bookingId: string): Promise<BookingDetail | null> => {
  const bookingRef = ref(rtdb, `bookings/${bookingId}`);
  const [bookingSnap, customersSnap, roomsSnap, bookingsSnap] = await Promise.all([
    get(bookingRef),
    get(ref(rtdb, 'customers')),
    get(ref(rtdb, 'rooms')),
    get(ref(rtdb, 'bookings')),
  ]);
  if (!bookingSnap.exists()) return null;
  const bookingVal = bookingSnap.val() as any;
  const customersVal = customersSnap.val() || {};
  const roomsVal = roomsSnap.val() || {};
  const allBookingsVal = bookingsSnap.val() || {};

  const roomEntry = findRoomEntryByRoomNo(roomsVal, bookingVal.roomNo);
  const roomKey = roomEntry ? roomEntry[0] : undefined;
  const room = roomEntry
    ? mapRoomsSnapshot({ val: () => ({ [roomEntry[0]]: roomEntry[1] }) } as any)[0]
    : undefined;

  const customer = customersVal[bookingVal.customerId];

  const roomNumbers = new Set<string>();
  const relatedBookingIds: string[] = [];
  const selectedRoomField =
    customer?.selectedRoom || customer?.selected_room || customer?.selectedRooms || bookingVal?.selectedRoom;
  if (selectedRoomField && typeof selectedRoomField === 'string') {
    selectedRoomField
      .split(',')
      .map((s: string) => normalizeRoomId(s))
      .filter((n: string) => n.length > 0)
      .forEach((n: string) => roomNumbers.add(n));
  }
  Object.entries<any>(allBookingsVal).forEach(([entryId, b]: [string, any]) => {
    if (b?.customerId !== bookingVal.customerId) return;
    const status = normalizeBookingStatus(b?.status);
    if (status === 'CHECKED_OUT') return;
    relatedBookingIds.push(entryId || b?.id || b?.bookingId || b?.booking_id || (b as any)._id || b?.key || '');
    const rn = normalizeRoomId(b?.roomNo ?? b?.room_no);
    if (rn) roomNumbers.add(rn);
  });

  return {
    id: bookingId,
    customerId: bookingVal.customerId,
    roomNo: normalizeRoomId(bookingVal.roomNo),
    roomNumbers: Array.from(roomNumbers.values()),
    relatedBookingIds: relatedBookingIds.filter(Boolean),
    status: normalizeBookingStatus(bookingVal.status),
    checkInDate: bookingVal.checkInDate,
    checkOutDate: bookingVal.checkOutDate || bookingVal.checkoutDate,
    checkOutActual: bookingVal.checkOutActual,
    createdAt: bookingVal.createdAt,
    roomKey,
    room,
    customer: customer
      ? {
          name: customer.guestName || customer.name || 'Guest',
          mobile: customer.mobileNumber || customer.phone || '',
          father_name: customer.fatherName || customer.father_name || '',
          address: customer.address || '',
          city: customer.city || '',
          amount: customer.amount || '',
        }
      : undefined,
  };
};

export const reassignBookingRooms = async (bookingId: string, newRoomNumbers: Array<string | number>) => {
  const normalizedRooms = Array.from(
    new Set(newRoomNumbers.map((n) => normalizeRoomId(n)).filter((n) => n.length > 0))
  );
  if (normalizedRooms.length === 0) {
    throw new Error('Please select at least one room.');
  }

  const bookingRef = ref(rtdb, `bookings/${bookingId}`);
  const bookingSnap = await get(bookingRef);
  if (!bookingSnap.exists()) throw new Error('Booking not found');
  const bookingVal = bookingSnap.val() as any;
  const customerId = bookingVal.customerId;
  const checkInMs = new Date(bookingVal.checkInDate).getTime();
  const checkOutMs = new Date(bookingVal.checkOutDate || bookingVal.checkoutDate || bookingVal.checkInDate).getTime();
  if (Number.isNaN(checkInMs) || Number.isNaN(checkOutMs)) {
    throw new Error('Booking dates are invalid; cannot reassign rooms.');
  }

  const [bookingsSnap, roomsSnap] = await Promise.all([
    get(ref(rtdb, 'bookings')),
    get(ref(rtdb, 'rooms')),
  ]);
  const allBookings = bookingsSnap.val() || {};
  const roomsVal = roomsSnap.val() || {};

  const editableBookings: Array<{ id: string; val: any }> = [];
  for (const [id, val] of Object.entries<any>(allBookings)) {
    if (val?.customerId !== customerId) continue;
    const status = normalizeBookingStatus(val?.status);
    if (status === 'CHECKED_OUT') continue;
    editableBookings.push({ id, val });
  }
  const editableIds = new Set(editableBookings.map((b) => b.id));

  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart <= bEnd && aEnd >= bStart;

  // Conflict check: ensure target rooms are not held by other active bookings for the same date range.
  for (const roomNo of normalizedRooms) {
    const roomEntry = findRoomEntryByRoomNo(roomsVal, roomNo);
    const heldBy = roomEntry ? (roomEntry[1] as any).current_booking_id : null;
    if (heldBy && !editableIds.has(heldBy)) {
      throw new Error(`Room ${roomNo} is already occupied.`);
    }

    for (const [otherId, otherVal] of Object.entries<any>(allBookings)) {
      if (editableIds.has(otherId)) continue;
      const status = normalizeBookingStatus(otherVal?.status);
      if (status === 'CHECKED_OUT' || status === 'CANCELLED') continue;
      const otherRoom = normalizeRoomId(otherVal?.roomNo ?? otherVal?.room_no);
      if (otherRoom !== roomNo) continue;
      const otherIn = new Date(otherVal?.checkInDate).getTime();
      const otherOut = new Date(otherVal?.checkOutDate || otherVal?.checkoutDate || otherVal?.checkInDate).getTime();
      if (Number.isNaN(otherIn) || Number.isNaN(otherOut)) continue;
      if (overlaps(checkInMs, checkOutMs, otherIn, otherOut)) {
        throw new Error(`Room ${roomNo} is booked in the selected date range.`);
      }
    }
  }

  // First free current rooms for this booking group to avoid stale occupancy.
  for (const entry of editableBookings) {
    const { roomKey } = await ensureRoomExists(entry.val.roomNo, roomsVal);
    const roomRef = ref(rtdb, `rooms/${roomKey}`);
    await runTransaction(roomRef, (room) => {
      if (!room) return undefined;
      if (room.current_booking_id && !editableIds.has(room.current_booking_id)) {
        return room; // held by another booking; do not clobber
      }
      return {
        ...room,
        is_available: true,
        status: 'available',
        current_booking_id: null,
        updatedAt: Date.now(),
      };
    });
  }

  const updatedBookingIds: string[] = [];
  const now = Date.now();
  const reuseCount = Math.min(editableBookings.length, normalizedRooms.length);
  const bookingsToClose = editableBookings.slice(reuseCount);

  for (let i = 0; i < reuseCount; i += 1) {
    const entry = editableBookings[i];
    const roomNo = normalizedRooms[i];
    const { roomKey } = await ensureRoomExists(roomNo, roomsVal);
    const roomRef = ref(rtdb, `rooms/${roomKey}`);

    // Occupy the new room only if it remains available for this booking group.
    await runTransaction(roomRef, (currentRoom) => {
      if (!currentRoom) return undefined;
      const { isAvailable } = deriveRoomAvailability(currentRoom);
      const heldByUs =
        currentRoom.current_booking_id && editableIds.has(currentRoom.current_booking_id);
      if (!isAvailable && !heldByUs) {
        return undefined; // abort if another booking grabbed it
      }
      return {
        ...currentRoom,
        is_available: false,
        status: 'occupied',
        current_booking_id: entry.id,
        updatedAt: Date.now(),
      };
    });

    await update(ref(rtdb, `bookings/${entry.id}`), {
      roomNo: roomNo.toString(),
      room_no: roomNo.toString(),
      selectedRoom: roomNo.toString(),
      updatedAt: now,
    });
    updatedBookingIds.push(entry.id);
  }

  // Add additional room bookings if the new selection is larger.
  const extraRooms = normalizedRooms.slice(reuseCount);
  for (const roomNo of extraRooms) {
    const newBookingId = await createBooking(
      customerId,
      roomNo.toString(),
      bookingVal.checkInDate,
      bookingVal.checkOutDate || bookingVal.checkoutDate || bookingVal.checkInDate
    );
    updatedBookingIds.push(newBookingId);
  }

  // Close any leftover bookings that no longer map to a selected room.
  const checkoutIso = new Date().toISOString();
  for (const entry of bookingsToClose) {
    await update(ref(rtdb, `bookings/${entry.id}`), {
      status: 'CHECKED_OUT',
      checkOutActual: checkoutIso,
      checkOutDate: entry.val.checkOutDate || entry.val.checkoutDate || checkoutIso,
      checkoutDate: entry.val.checkOutDate || entry.val.checkoutDate || checkoutIso,
      updatedAt: now,
    });
  }

  // Sync selected rooms on the customer record to keep UI lists consistent.
  const selectedRoomStr = normalizedRooms.join(',');
  await update(ref(rtdb, `customers/${customerId}`), {
    selectedRoom: selectedRoomStr,
    selected_room: selectedRoomStr,
    selectedRooms: selectedRoomStr,
    updatedAt: Date.now(),
  }).catch(() => {});

  return { updatedBookingIds };
};

export const handleCheckout = async (bookingId: string) => {
  const bookingRef = ref(rtdb, `bookings/${bookingId}`);
  const bookingSnap = await get(bookingRef);
  if (!bookingSnap.exists()) throw new Error('Booking not found');
  const bookingVal = bookingSnap.val() as any;
  const customerId = bookingVal.customerId;

  // Load all bookings + rooms once
  const [bookingsSnap, roomsSnap] = await Promise.all([
    get(ref(rtdb, 'bookings')),
    get(ref(rtdb, 'rooms')),
  ]);
  const roomsVal = roomsSnap.val() || {};
  const allBookings = bookingsSnap.val() || {};

  const nowIso = new Date().toISOString();

  const toCheckout: Array<{ id: string; val: any }> = [];
  for (const [id, val] of Object.entries<any>(allBookings)) {
    if (customerId && val?.customerId !== customerId) continue;
    const status = normalizeBookingStatus(val?.status);
    if (status === 'CHECKED_OUT') continue;
    toCheckout.push({ id, val });
  }

  // Checkout each booking and free its room
  for (const entry of toCheckout) {
    const bVal = entry.val;
    const checkoutDate = bVal.checkOutDate || bVal.checkoutDate || nowIso;
    const bRef = ref(rtdb, `bookings/${entry.id}`);
    await update(bRef, {
      status: 'checked_out',
      checkOutActual: nowIso,
      checkOutDate: checkoutDate,
      checkoutDate,
      updatedAt: Date.now(),
    });

    const { roomKey } = await ensureRoomExists(bVal.roomNo, roomsVal);
    const roomRef = ref(rtdb, `rooms/${roomKey}`);
    await runTransaction(roomRef, (room) => {
      if (!room) {
        return undefined; // Abort transaction
      }
      return {
        ...room,
        is_available: true,
        status: 'available',
        current_booking_id: null,
        updatedAt: Date.now(),
      };
    });
  }
};

// alias for existing callers
export const checkoutBooking = handleCheckout;

// Convenience helper to mark a room available (can be used independently)
export const markRoomAvailable = async (roomKey: string) => {
  const roomRef = ref(rtdb, `rooms/${roomKey}`);
  await update(roomRef, {
    is_available: true,
    status: 'available',
    current_booking_id: null,
    updatedAt: Date.now(),
  });
};

/**
 * Reconcile room availability using bookings snapshot.
 * - For bookings with status 'CHECKED_OUT' ensure the linked room is marked available.
 * - For bookings with status 'BOOKED' but checkOutDate in the past, mark booking CHECKED_OUT and release room.
 * This can be called as an admin action or run periodically to fix historical state.
 */
export const reconcileRoomsFromBookings = async () => {
  const bookingsSnap = await get(ref(rtdb, 'bookings'));
  if (!bookingsSnap.exists()) return { processed: 0 };
  const bookingsVal = bookingsSnap.val() || {};

  const roomsSnap = await get(ref(rtdb, 'rooms'));
  const roomsVal = roomsSnap.val() || {};

  let processed = 0;

  const now = Date.now();

  for (const [bookingId, b] of Object.entries(bookingsVal)) {
    const booking: any = b as any;
    const status: string = booking.status;
    const roomNo = booking.roomNo;
    const checkoutStr = booking.checkOutDate || booking.checkoutDate;

    // Determine if booking should be considered checked out
    const checkoutDateMs = checkoutStr ? new Date(checkoutStr).getTime() : null;
    const isPastCheckout = checkoutDateMs !== null && checkoutDateMs <= now;
    const normalizedStatus = normalizeBookingStatus(status);

    if (normalizedStatus === 'CHECKED_OUT' || isPastCheckout) {
      // Find matching room key by room_no
      const roomEntry = findRoomEntryByRoomNo(roomsVal, roomNo);
      const roomKey = roomEntry ? roomEntry[0] : null;

      // Update booking if it's still marked booked/pending
      const bookingUpdates: any = {};
      if (normalizedStatus !== 'CHECKED_OUT') {
        const checkoutIso = new Date().toISOString();
        bookingUpdates.status = 'CHECKED_OUT';
        bookingUpdates.checkOutActual = booking.checkOutActual ?? checkoutStr ?? checkoutIso;
        bookingUpdates.checkOutDate = booking.checkOutDate || booking.checkoutDate || checkoutIso;
        bookingUpdates.checkoutDate = bookingUpdates.checkOutDate;
        bookingUpdates.updatedAt = Date.now();
      }

      if (Object.keys(bookingUpdates).length > 0) {
        await update(ref(rtdb, `bookings/${bookingId}`), bookingUpdates);
      }

      if (roomKey) {
        // Only set available if the room is currently marked occupied.
        const roomObj: any = roomsVal[roomKey];
        const { isAvailable } = deriveRoomAvailability(roomObj);
        if (roomObj && roomObj.current_booking_id && roomObj.current_booking_id === bookingId) {
          await update(ref(rtdb, `rooms/${roomKey}`), {
            is_available: true,
            status: 'available',
            current_booking_id: null,
            updatedAt: Date.now(),
          });
        } else if (roomObj && !isAvailable) {
          // If room appears occupied but booking id doesn't match, still free it to unblock availability.
          await update(ref(rtdb, `rooms/${roomKey}`), {
            is_available: true,
            status: 'available',
            current_booking_id: null,
            updatedAt: Date.now(),
          });
        }
      }

      processed += 1;
    }
  }

  return { processed };
};

export const fetchAvailableRooms = async (): Promise<RtdbRoom[]> => {
  const roomsRef = ref(rtdb, 'rooms');
  const snap = await get(roomsRef);
  if (!snap.exists()) return [];
  return mapRoomsSnapshot(snap)
    .filter((room) => roomIsAvailable(room))
    .sort((a, b) => compareRoomIds(a.room_no, b.room_no));
};

export const fetchAllRooms = async (): Promise<RtdbRoom[]> => {
  const roomsRef = ref(rtdb, 'rooms');
  const snap = await get(roomsRef);
  if (!snap.exists()) return [];
  return mapRoomsSnapshot(snap).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
};

export const subscribeToRooms = (
  callback: (rooms: RtdbRoom[]) => void,
  onError?: (error: unknown) => void
) => {
  const roomsRef = ref(rtdb, 'rooms');
  const handler = (snap: DataSnapshot) => {
    const mapped = mapRoomsSnapshot(snap).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
    callback(mapped);
  };
  const errorHandler = (error: unknown) => {
    console.error('RTDB rooms subscription error', error);
    if (onError) onError(error);
  };
  onValue(roomsRef, handler, errorHandler);
  return () => off(roomsRef, 'value', handler);
};

export const subscribeAvailableRooms = (
  callback: (rooms: RtdbRoom[]) => void,
  onError?: (error: unknown) => void
) =>
  subscribeToRooms(
    (rooms) =>
      callback(
        rooms
          .filter((r) => roomIsAvailable(r))
          .sort((a, b) => compareRoomIds(a.room_no, b.room_no))
      ),
    onError
  );

export const subscribeToDashboardCounts = (
  callback: (data: { totalRooms: number; occupiedRooms: number; availableRooms: number; occupiedRoomNos: string[] }) => void,
  onError?: (error: unknown) => void
) => {
  const roomsRef = ref(rtdb, 'rooms');
  const handler = (snap: DataSnapshot) => {
    const rooms = mapRoomsSnapshot(snap);
    callback(computeRoomStats(rooms));
  };
  const errorHandler = (error: unknown) => {
    console.error('RTDB dashboard subscription error', error);
    if (onError) onError(error);
  };
  onValue(roomsRef, handler, errorHandler);
  return () => off(roomsRef, 'value', handler);
};

const mapRoomsSnapshot = (snap: DataSnapshot): RtdbRoom[] => {
  const val = snap.val() || {};
  return Object.entries(val).map(([key, value]) => {
    const room = value as any;
    const { isAvailable, normalizedStatus } = deriveRoomAvailability(room);
    const roomId = normalizeRoomId(room.room_no || room.roomNumber || key);
    const override = ROOM_UI_LABEL_OVERRIDES[roomId];
    const rawBeds = override?.beds ?? room.beds;
    const parsedBeds = Number(rawBeds);
    const beds = Number.isFinite(parsedBeds) ? parsedBeds : 1;

    return {
      key,
      room_no: roomId,
      beds,
      type: override?.type || room.type || 'Standard',
      ac_make: override?.ac_make ?? room.ac_make,
      remarks: override?.remarks ?? room.remarks,
      status: normalizedStatus,
      is_available: isAvailable,
      current_booking_id: room.current_booking_id ?? null,
    } as RtdbRoom;
  });
};
