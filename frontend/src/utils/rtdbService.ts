// Realtime Database data layer.
//
// Schema (see database.rules.json for types, indexes and access rules):
//   rooms/{roomNo}          room flags: is_available, current_booking_id, status, cleaned_status
//   customers/{id}          guest details (one record per stay, as created by New Booking)
//   customerIndex/{id}      tiny search record { n, m, v, t, u, deleted? } synced to devices
//   bookings/{id}           one record per room of a stay; all rooms of a stay share `stayId`
//   stats/{daily|monthly}   revenue totals, see ../firebase/stats.ts
//
// Every read is either a single path, an indexed query, or a bounded range, so
// bandwidth stays proportional to what a screen shows, not to the size of history.

import { rtdb } from '../firebase/firebase';
import {
  ref,
  push,
  set,
  update,
  get,
  onValue,
  query,
  orderByChild,
  orderByKey,
  limitToLast,
  equalTo,
  startAt,
  startAfter,
  endAt,
  runTransaction,
} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultRoomSeeds } from './defaultRooms';
import { TOTAL_ROOMS } from './roomConstants';
import { amountFields, parseAmount, normalizePaymentMode } from './amount';
import { localDay, addDays } from './date';
import { stayDelta, statsUpdates, type RevenueDelta } from '../firebase/stats';
import { queueImageUpload } from './uploadQueue';
import { isBase64Image, saveBase64ToFile } from './imageStorage';

// ID images are shown in the app for 90 days after the stay; the media server keeps the archive.
export const IMAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_ID_IMAGES = 3;

/* ============================================================
   TYPES
============================================================ */

export type RtdbRoom = {
  key: string;
  room_no: string;
  beds: number;
  type: string;
  ac_make?: string;
  remarks?: string;
  is_available: boolean;
  current_booking_id: string | null;
  cleaned_status?: string;
  status?: string;
};

export type BookingEnriched = {
  id: string;
  customerId: string;
  roomNo: string;
  room_id?: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  paymentMode?: string;
  customer?: {
    name: string;
    mobile?: string;
    father_name?: string;
    address?: string;
    city?: string;
    amount?: string;
    idImageUrl?: string;
    idImageUrls?: string[];
  };
  room?: RtdbRoom;
  total_amount?: string;
  totalAmount?: string;
  payment_mode?: string;
  created_at?: string;
  createdAt?: number;
  check_in?: string;
  check_out_expected?: string;
  check_out_actual?: string;
  customer_id?: string;
  room_numbers?: string[];
};

export type BookingDetail = {
  id: string;
  customerId: string;
  roomNo: string;
  roomNumbers?: string[];
  checkInDate: string;
  checkOutDate: string;
  checkOutActual?: string;
  status: string;
  createdAt: number;
  customer?: {
    name: string;
    mobile?: string;
    father_name?: string;
    address?: string;
    city?: string;
    amount?: string;
    idImageUrl?: string;
    idImageUrls?: string[];
  };
  room?: RtdbRoom;
  relatedBookingIds?: string[];
};

export type AdvanceBooking = {
  id: string;
  guestName: string;
  membersCount: number;
  arrivalDate: string;
  roomNumbers: string[];
  tokenAmount: number;
  totalAmount: number;
  tokenPaid: boolean;
  paymentMode: string;
  mobile?: string;
};

export type CustomerSearchResult = {
  id: string;
  name: string;
  mobile: string;
  vehicleNumber: string;
  createdAt: number;
  checkInDate?: string;
};

type BookingRecord = Record<string, any> & { id: string };
type Updates = Record<string, unknown>;

/* ============================================================
   UTILITIES
============================================================ */

export const normalizeBookingStatus = (status?: string): string => {
  if (!status) return 'BOOKED';
  const s = status.toUpperCase().replace(/[\s_-]/g, '').trim();
  if (s === 'AVAILABLE') return 'AVAILABLE';
  if (s === 'CHECKEDOUT') return 'CHECKED_OUT';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
  if (s === 'CONFIRMED') return 'CONFIRMED';
  return 'BOOKED';
};

// Alias kept for existing callers.
export const normalizeStatus = normalizeBookingStatus;

export const normalizeRoomId = (id: any): string => {
  if (id == null) return '';
  return id.toString().trim().replace(/\./g, '_');
};

export const compareRoomIds = (a: any, b: any): number => {
  const sA = String(a || '');
  const sB = String(b || '');

  const isALast = sA.toLowerCase().includes('basement') || sA.toLowerCase().startsWith('cb');
  const isBLast = sB.toLowerCase().includes('basement') || sB.toLowerCase().startsWith('cb');
  if (isALast && !isBLast) return 1;
  if (!isALast && isBLast) return -1;

  const numA = parseInt(sA.replace(/\D/g, ''), 10);
  const numB = parseInt(sB.replace(/\D/g, ''), 10);
  if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
  return sA.localeCompare(sB);
};

const isOpen = (b: any) => {
  const s = normalizeBookingStatus(b?.status);
  return s !== 'CHECKED_OUT' && s !== 'CANCELLED';
};

const checkInDayOf = (b: any): string => b?.checkInDay || localDay(b?.checkInDate || b?.check_in || '');
const checkOutDayOf = (b: any): string =>
  b?.checkOutDay || localDay(b?.checkOutDate || b?.check_out_expected || b?.checkoutDate || '');
const stayIdOf = (b: any): string => b?.stayId || `${b?.customerId || b?.id}_${checkInDayOf(b)}`;

/** Amount of a booking's stay as { total, cash, upi }, whatever format it was stored in. */
export const bookingAmount = (b: any) => {
  if (b?.payments && (b.payments.cash != null || b.payments.upi != null)) {
    const cash = Number(b.payments.cash) || 0;
    const upi = Number(b.payments.upi) || 0;
    return { total: cash + upi, cash, upi };
  }
  const parsed = parseAmount(b?.amountRaw ?? b?.totalAmount ?? b?.total_amount ?? b?.amount, b?.paymentMode);
  return { total: parsed.total, cash: parsed.cash, upi: parsed.upi };
};

const snapToRecords = (val: Record<string, any> | null): BookingRecord[] =>
  Object.entries(val || {})
    .filter(([, b]) => b && typeof b === 'object')
    .map(([id, b]) => ({ ...b, id }));

const groupByStay = (bookings: BookingRecord[]) => {
  const stays = new Map<string, BookingRecord[]>();
  for (const b of bookings) {
    const key = stayIdOf(b);
    const list = stays.get(key);
    if (list) list.push(b);
    else stays.set(key, [b]);
  }
  return stays;
};

/** Sums revenue deltas per day so several stays on the same day become one increment per field. */
const mergeStatsUpdates = (deltas: { day: string; delta: RevenueDelta }[]): Updates => {
  const byDay = new Map<string, RevenueDelta>();
  for (const { day, delta } of deltas) {
    const acc = byDay.get(day);
    if (!acc) {
      byDay.set(day, { ...delta });
      continue;
    }
    for (const key of Object.keys(delta) as (keyof RevenueDelta)[]) acc[key] += delta[key];
  }
  return Array.from(byDay.entries()).reduce<Updates>(
    (all, [day, delta]) => ({ ...all, ...statsUpdates(day, delta) }),
    {}
  );
};

/* ============================================================
   ROOMS
============================================================ */

const mapRoom = (key: string, data: any): RtdbRoom => {
  const roomData = data || {};
  const roomNo = String(roomData.room_no ?? roomData.roomNo ?? key);
  const seed = defaultRoomSeeds.find(s => s.room_number === roomNo);
  const status = roomData.status ? normalizeBookingStatus(roomData.status) : 'AVAILABLE';
  return {
    key,
    room_no: roomNo,
    beds: seed ? seed.capacity : (roomData.beds ?? roomData.capacity ?? 1),
    type: roomData.type ?? roomData.room_type ?? (seed?.type || 'Standard'),
    ac_make: roomData.ac_make ?? seed?.ac_make,
    remarks: roomData.remarks,
    status,
    is_available:
      roomData.is_available !== false &&
      !roomData.current_booking_id &&
      status !== 'BOOKED' &&
      status !== 'CONFIRMED',
    current_booking_id: roomData.current_booking_id ?? null,
    cleaned_status: roomData.cleaned_status || 'CLEANED',
  };
};

const mapRooms = (val: Record<string, any> | null): RtdbRoom[] =>
  Object.entries(val || {}).map(([key, data]) => mapRoom(key, data));

const occupyRoom = (updates: Updates, roomNo: string, bookingId: string, now: number) => {
  updates[`rooms/${roomNo}/is_available`] = false;
  updates[`rooms/${roomNo}/current_booking_id`] = bookingId;
  updates[`rooms/${roomNo}/status`] = 'BOOKED';
  updates[`rooms/${roomNo}/updatedAt`] = now;
};

const freeRoom = (updates: Updates, roomNo: string, now: number) => {
  updates[`rooms/${roomNo}/is_available`] = true;
  updates[`rooms/${roomNo}/current_booking_id`] = null;
  updates[`rooms/${roomNo}/status`] = 'AVAILABLE';
  updates[`rooms/${roomNo}/updatedAt`] = now;
};

// One shared listener on `rooms` for the whole app (a few KB; only changes stream after the first load).
let roomsUnsubscribe: (() => void) | null = null;
let lastKnownRooms: RtdbRoom[] | null = null;
const roomsWatchers = new Set<(rooms: RtdbRoom[]) => void>();
const roomsErrorWatchers = new Set<(error: unknown) => void>();

export const subscribeToRooms = (
  callback: (rooms: RtdbRoom[]) => void,
  onError?: (error: unknown) => void
) => {
  roomsWatchers.add(callback);
  if (onError) roomsErrorWatchers.add(onError);
  if (!roomsUnsubscribe) {
    roomsUnsubscribe = onValue(
      ref(rtdb, 'rooms'),
      snap => {
        lastKnownRooms = mapRooms(snap.val());
        roomsWatchers.forEach(w => w(lastKnownRooms!));
      },
      error => {
        // A failed listener is dead; reset so the next subscriber starts a fresh one.
        roomsUnsubscribe = null;
        lastKnownRooms = null;
        roomsErrorWatchers.forEach(w => w(error));
      }
    );
  } else if (lastKnownRooms) {
    callback(lastKnownRooms);
  }

  return () => {
    roomsWatchers.delete(callback);
    if (onError) roomsErrorWatchers.delete(onError);
    if (roomsWatchers.size === 0 && roomsUnsubscribe) {
      roomsUnsubscribe();
      roomsUnsubscribe = null;
      lastKnownRooms = null;
    }
  };
};

export const subscribeAvailableRooms = subscribeToRooms;

export const fetchAllRooms = async (): Promise<RtdbRoom[]> => {
  if (lastKnownRooms) return lastKnownRooms;
  const snap = await get(ref(rtdb, 'rooms'));
  return mapRooms(snap.val());
};

const fetchRoom = async (roomNo: string): Promise<RtdbRoom | undefined> => {
  if (!roomNo) return undefined;
  const cached = lastKnownRooms?.find(r => normalizeRoomId(r.room_no) === roomNo);
  if (cached) return cached;
  const snap = await get(ref(rtdb, `rooms/${roomNo}`));
  return snap.exists() ? mapRoom(roomNo, snap.val()) : undefined;
};

export const updateRoomCleanedStatus = async (roomNo: string, status: string): Promise<void> => {
  await update(ref(rtdb, `rooms/${normalizeRoomId(roomNo)}`), { cleaned_status: status, updatedAt: Date.now() });
};

export const computeRoomStats = (rooms: RtdbRoom[]) => {
  const occupied = rooms.filter(r => r.is_available === false || !!r.current_booking_id);
  return {
    totalRooms: TOTAL_ROOMS,
    occupiedRooms: occupied.length,
    availableRooms: Math.max(0, TOTAL_ROOMS - occupied.length),
    occupiedRoomNos: occupied.map(r => r.room_no).sort(),
    rooms,
  };
};

/* ============================================================
   ACTIVE BOOKINGS (shared live listener)
============================================================ */

// Bookings whose expected checkout is yesterday or later: current stays plus advance
// bookings. This set stays small forever, unlike "the last N bookings".
let activeUnsubscribe: (() => void) | null = null;
let lastActiveBookings: BookingRecord[] | null = null;
const activeWatchers = new Set<(bookings: BookingRecord[]) => void>();
const activeErrorWatchers = new Set<(error: unknown) => void>();

const activeBookingsQuery = () =>
  query(ref(rtdb, 'bookings'), orderByChild('checkOutDay'), startAt(addDays(localDay(), -1)));

export const subscribeToActiveBookings = (
  callback: (bookings: BookingRecord[]) => void,
  onError?: (error: unknown) => void
) => {
  activeWatchers.add(callback);
  if (onError) activeErrorWatchers.add(onError);
  if (!activeUnsubscribe) {
    activeUnsubscribe = onValue(
      activeBookingsQuery(),
      snap => {
        lastActiveBookings = snapToRecords(snap.val());
        activeWatchers.forEach(w => w(lastActiveBookings!));
      },
      error => {
        activeUnsubscribe = null;
        lastActiveBookings = null;
        activeErrorWatchers.forEach(w => w(error));
      }
    );
  } else if (lastActiveBookings) {
    callback(lastActiveBookings);
  }

  return () => {
    activeWatchers.delete(callback);
    if (onError) activeErrorWatchers.delete(onError);
    if (activeWatchers.size === 0 && activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
      lastActiveBookings = null;
    }
  };
};

export const fetchActiveBookings = async (): Promise<BookingRecord[]> => {
  if (lastActiveBookings) return lastActiveBookings;
  const snap = await get(activeBookingsQuery());
  return snapToRecords(snap.val());
};

/** Room numbers of open bookings whose stay window includes `day`. */
const roomsOccupiedOn = (bookings: BookingRecord[], day: string): Set<string> => {
  const set = new Set<string>();
  for (const b of bookings) {
    if (!isOpen(b)) continue;
    const inDay = checkInDayOf(b);
    const outDay = checkOutDayOf(b);
    if (!inDay || !outDay || inDay > outDay) continue;
    if (inDay <= day && day <= outDay) {
      const roomNo = normalizeRoomId(b.roomNo ?? b.room_no);
      if (roomNo) set.add(roomNo);
    }
  }
  return set;
};

export const subscribeToDashboardCounts = (
  callback: (stats: ReturnType<typeof computeRoomStats>) => void,
  onError?: (error: unknown) => void
) => {
  let rooms: RtdbRoom[] = [];
  let bookingRooms: Set<string> | null = null;

  const emit = () => {
    const base = computeRoomStats(rooms);
    // Bookings are the source of truth once loaded; room flags cover the first moments.
    const occupiedRoomNos = Array.from(bookingRooms ?? new Set(base.occupiedRoomNos.map(normalizeRoomId)))
      .filter(Boolean)
      .sort(compareRoomIds);
    callback({
      ...base,
      occupiedRooms: occupiedRoomNos.length,
      availableRooms: Math.max(0, base.totalRooms - occupiedRoomNos.length),
      occupiedRoomNos,
    });
  };

  const roomsUnsub = subscribeToRooms(r => {
    rooms = r;
    emit();
  }, onError);
  const bookingsUnsub = subscribeToActiveBookings(bookings => {
    bookingRooms = roomsOccupiedOn(bookings, localDay());
    emit();
  }, onError);

  return () => {
    roomsUnsub();
    bookingsUnsub();
  };
};

export const subscribeToRoomStatusGrid = (
  callback: (rooms: (RtdbRoom & { hasFutureBooking: boolean })[]) => void,
  onError?: (error: unknown) => void
) => {
  let rooms: RtdbRoom[] = [];
  let blocked = new Set<string>();

  const emit = () =>
    callback(rooms.map(r => ({ ...r, hasFutureBooking: blocked.has(normalizeRoomId(r.room_no)) })));

  const roomsUnsub = subscribeToRooms(r => {
    rooms = r;
    emit();
  }, onError);
  const bookingsUnsub = subscribeToActiveBookings(bookings => {
    const today = localDay();
    blocked = new Set(
      bookings
        .filter(b => isOpen(b) && (!checkOutDayOf(b) || checkOutDayOf(b) >= today))
        .map(b => normalizeRoomId(b.roomNo ?? b.room_no))
        .filter(Boolean)
    );
    emit();
  }, onError);

  return () => {
    roomsUnsub();
    bookingsUnsub();
  };
};

/* ============================================================
   CUSTOMERS
============================================================ */

const str = (value: unknown) => (value == null ? '' : String(value).trim());

const isWithinRetentionWindow = (customer: any): boolean => {
  const refDate = customer?.updatedAt ?? customer?.createdAt ?? customer?.checkInDate;
  if (!refDate) return true;
  const ts = typeof refDate === 'string' ? Date.parse(refDate) : Number(refDate);
  if (Number.isNaN(ts)) return true;
  return ts >= Date.now() - IMAGE_RETENTION_MS;
};

const toArray = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  if (typeof val === 'object') return Object.values(val as object).filter((v): v is string => typeof v === 'string');
  return typeof val === 'string' ? [val] : [];
};

/** Canonical customer shape for the UI, tolerant of legacy field names. */
const normalizeCustomer = (id: string, raw: any) => {
  const c = raw || {};
  const images = isWithinRetentionWindow(c)
    ? Array.from(new Set([...toArray(c.idImageUrls), ...toArray(c.idImageUrl)]))
        .filter(u => /^(https?:|file:|data:image)/.test(u))
        .slice(0, MAX_ID_IMAGES)
    : [];
  return {
    ...c,
    id,
    name: c.name || c.guestName || 'Guest',
    mobile: c.mobile || c.mobileNumber || '',
    father_name: c.father_name || c.fatherName || '',
    address: c.address || '',
    city: c.city || '',
    amount: str(c.amount),
    membersCount: c.membersCount ?? '',
    vehicleNumber: c.vehicleNumber || '',
    id_type: c.id_type || 'Aadhaar',
    id_number: c.id_number || '',
    idImageUrls: images,
    idImageUrl: images[0] || '',
  };
};

const indexEntry = (c: { name?: string; mobile?: string; vehicleNumber?: string; createdAt?: number }, now: number) => ({
  n: str(c.name),
  m: str(c.mobile),
  v: str(c.vehicleNumber),
  t: c.createdAt || now,
  u: now,
});

/** Splits image inputs into already-uploaded URLs and local files that need uploading. */
const splitImages = async (inputs: unknown[], customerId: string) => {
  const remote: string[] = [];
  const local: string[] = [];
  for (const value of inputs) {
    if (typeof value !== 'string' || !value.trim()) continue;
    if (remote.length + local.length >= MAX_ID_IMAGES) break;
    if (value.startsWith('http')) remote.push(value);
    else if (isBase64Image(value)) local.push(await saveBase64ToFile(value, customerId, local.length));
    else local.push(value);
  }
  return { remote, local };
};

const collectImageInputs = (data: any): unknown[] =>
  Array.from(new Set([...(Array.isArray(data.idImageUrls) ? data.idImageUrls : []), data.idImageUrl].filter(Boolean)));

export const createCustomer = async (data: any): Promise<string> => {
  const id = push(ref(rtdb, 'customers')).key as string;
  const now = Date.now();

  const { remote, local } = await splitImages(collectImageInputs(data), id);

  const customer = {
    id,
    name: str(data.guestName || data.name) || 'Guest',
    mobile: str(data.mobileNumber || data.mobile),
    father_name: str(data.fatherName || data.father_name),
    address: str(data.address),
    city: str(data.city),
    id_type: str(data.idType || data.id_type) || 'Aadhaar',
    id_number: str(data.idNumber || data.id_number),
    membersCount: Number(data.membersCount || data.members) || 0,
    purpose: str(data.purpose),
    vehicleNumber: str(data.vehicleNumber),
    amount: str(data.amount),
    paymentMode: normalizePaymentMode(data.paymentMode),
    checkInDate: str(data.checkInDate),
    checkOutDate: str(data.checkOutDate),
    selectedRoom: str(data.selectedRoom),
    idImageUrls: remote,
    createdAt: now,
    updatedAt: now,
  };

  await update(ref(rtdb), {
    [`customers/${id}`]: customer,
    [`customerIndex/${id}`]: indexEntry(customer, now),
  });

  // Photos upload in the background; the queue writes each URL into idImageUrls/{index}.
  local.forEach((uri, i) => queueImageUpload(uri, id, remote.length + i));
  return id;
};

export const fetchCustomers = async (limitCount: number = 50): Promise<any[]> => {
  try {
    // Push IDs sort chronologically, so key order needs no index.
    const snap = await get(query(ref(rtdb, 'customers'), orderByKey(), limitToLast(limitCount)));
    return Object.entries(snap.val() || {})
      .map(([id, c]) => normalizeCustomer(id, c))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (err) {
    console.warn('[fetchCustomers] Error:', err);
    return [];
  }
};

export const fetchCustomerById = async (id: string): Promise<any | null> => {
  try {
    const snap = await get(ref(rtdb, `customers/${id}`));
    return snap.exists() ? normalizeCustomer(id, snap.val()) : null;
  } catch (err) {
    console.warn('[fetchCustomerById] Error:', err);
    return null;
  }
};

/* ---------- Customer search (all guests, on-device) ---------- */

// Each device keeps a copy of customerIndex (~100 bytes per guest) and only downloads
// entries changed since its last sync. Search is then instant and works offline.
const INDEX_STORAGE_KEY = 'customerIndex:v1';
let indexCache: { syncedTo: number; entries: Record<string, any> } | null = null;
let indexSync: Promise<void> | null = null;

const loadIndex = async () => {
  if (indexCache) return indexCache;
  try {
    const raw = await AsyncStorage.getItem(INDEX_STORAGE_KEY);
    indexCache = raw ? JSON.parse(raw) : { syncedTo: 0, entries: {} };
  } catch {
    indexCache = { syncedTo: 0, entries: {} };
  }
  return indexCache!;
};

export const syncCustomerIndex = (): Promise<void> => {
  if (indexSync) return indexSync;
  indexSync = (async () => {
    const index = await loadIndex();
    const snap = await get(query(ref(rtdb, 'customerIndex'), orderByChild('u'), startAfter(index.syncedTo)));
    const changed: Record<string, any> = snap.val() || {};
    for (const [id, entry] of Object.entries(changed)) {
      if (entry?.deleted) delete index.entries[id];
      else index.entries[id] = entry;
      index.syncedTo = Math.max(index.syncedTo, Number(entry?.u) || 0);
    }
    if (Object.keys(changed).length > 0) {
      await AsyncStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index)).catch(() => {});
    }
  })().finally(() => {
    indexSync = null;
  });
  return indexSync;
};

/** Matches name, mobile or vehicle number across every guest ever recorded. */
export const searchCustomers = async (queryStr: string, limit = 50): Promise<CustomerSearchResult[]> => {
  const q = queryStr.toLowerCase().trim();
  if (q.length < 2) return [];
  await syncCustomerIndex().catch(err => console.warn('[searchCustomers] Sync failed, using local index:', err));
  const { entries } = await loadIndex();
  return Object.entries(entries)
    .filter(([, e]) => str(e.n).toLowerCase().includes(q) || str(e.m).includes(q) || str(e.v).toLowerCase().includes(q))
    .sort(([, a], [, b]) => (b.t || 0) - (a.t || 0))
    .slice(0, limit)
    .map(([id, e]) => ({
      id,
      name: e.n || 'Guest',
      mobile: e.m || '',
      vehicleNumber: e.v || '',
      createdAt: e.t || 0,
    }));
};

/* ---------- Update / delete ---------- */

const bookingsOfCustomer = async (customerId: string): Promise<BookingRecord[]> => {
  const snap = await get(query(ref(rtdb, 'bookings'), orderByChild('customerId'), equalTo(customerId)));
  return snapToRecords(snap.val());
};

/**
 * Updates for changing the amount of every stay of a customer. Stays that already
 * checked out move their revenue by the difference.
 */
const amountChangeUpdates = async (customerId: string, raw: string, defaultMode: unknown): Promise<Updates> => {
  const updates: Updates = {};
  const deltas: { day: string; delta: RevenueDelta }[] = [];
  const now = Date.now();

  for (const stay of groupByStay(await bookingsOfCustomer(customerId)).values()) {
    const next = amountFields(raw, defaultMode);
    const counted = stay.find(b => b.revenueCounted && b.checkedOutDay);
    if (counted) {
      const before = stayDelta(bookingAmount(counted), -1);
      const after = stayDelta(next.payments, 1);
      deltas.push({ day: counted.checkedOutDay, delta: before }, { day: counted.checkedOutDay, delta: after });
    }
    for (const b of stay) {
      for (const [field, value] of Object.entries(next)) updates[`bookings/${b.id}/${field}`] = value;
      updates[`bookings/${b.id}/updatedAt`] = now;
    }
  }
  return { ...updates, ...mergeStatsUpdates(deltas) };
};

export const updateCustomer = async (id: string, data: any): Promise<void> => {
  const current = (await get(ref(rtdb, `customers/${id}`))).val() || {};
  const now = Date.now();
  const patch: Record<string, unknown> = {};

  const fieldMap: Record<string, string> = {
    guestName: 'name', name: 'name',
    mobileNumber: 'mobile', mobile: 'mobile',
    fatherName: 'father_name', father_name: 'father_name',
    idNumber: 'id_number', id_number: 'id_number',
    idType: 'id_type', id_type: 'id_type',
    address: 'address', city: 'city', amount: 'amount',
    vehicleNumber: 'vehicleNumber', purpose: 'purpose',
  };
  for (const [key, value] of Object.entries(data)) {
    const field = fieldMap[key];
    if (field && value !== undefined) patch[field] = str(value);
  }
  if (data.membersCount !== undefined) patch.membersCount = Number(data.membersCount) || 0;

  let localImages: string[] = [];
  const imageInputs = collectImageInputs(data);
  if (imageInputs.length > 0) {
    const { remote, local } = await splitImages(imageInputs, id);
    patch.idImageUrls = remote;
    localImages = local;
  }

  let updates: Updates = {};
  for (const [field, value] of Object.entries(patch)) updates[`customers/${id}/${field}`] = value;
  updates[`customers/${id}/updatedAt`] = now;

  const merged = { ...current, ...patch };
  updates[`customerIndex/${id}`] = indexEntry(
    { name: str(merged.name || merged.guestName), mobile: str(merged.mobile || merged.mobileNumber), vehicleNumber: merged.vehicleNumber, createdAt: current.createdAt },
    now
  );

  if (patch.amount !== undefined && patch.amount !== str(current.amount)) {
    updates = { ...updates, ...(await amountChangeUpdates(id, patch.amount as string, current.paymentMode)) };
  }

  await update(ref(rtdb), updates);
  const remoteCount = (patch.idImageUrls as string[] | undefined)?.length ?? 0;
  localImages.forEach((uri, i) => queueImageUpload(uri, id, remoteCount + i));
};

export const deleteCustomer = async (id: string): Promise<void> => {
  const bookings = await bookingsOfCustomer(id);
  const now = Date.now();
  const updates: Updates = {};
  const deltas: { day: string; delta: RevenueDelta }[] = [];

  for (const stay of groupByStay(bookings).values()) {
    const counted = stay.find(b => b.revenueCounted && b.checkedOutDay);
    if (counted) deltas.push({ day: counted.checkedOutDay, delta: stayDelta(bookingAmount(counted), -1) });
  }

  for (const b of bookings) {
    updates[`bookings/${b.id}`] = null;
    const roomNo = normalizeRoomId(b.roomNo);
    const room = roomNo ? await fetchRoom(roomNo) : undefined;
    if (room?.current_booking_id === b.id) freeRoom(updates, roomNo, now);
  }

  updates[`customers/${id}`] = null;
  // Tombstone so other devices drop the guest from their search index.
  updates[`customerIndex/${id}`] = { deleted: true, u: now };

  await update(ref(rtdb), { ...updates, ...mergeStatsUpdates(deltas) });
};

/* ============================================================
   BOOKINGS
============================================================ */

type BookingExtras = {
  amountRaw?: string;
  totalAmount?: number | string;
  tokenAmount?: number;
  guestName?: string;
  mobile?: string;
  membersCount?: number;
};

/**
 * Creates one booking per room for a stay, atomically. Rooms for a stay starting
 * today or earlier are claimed with a transaction first, so two phones can never
 * put different guests in the same room.
 */
export const createBookings = async (
  customerId: string,
  roomNos: string[],
  checkInDate: string,
  checkOutDate: string,
  paymentMode: string = 'CASH',
  extras: BookingExtras = {}
): Promise<string[]> => {
  const rooms = Array.from(new Set(roomNos.map(normalizeRoomId).filter(Boolean)));
  if (rooms.length === 0) throw new Error('Please select at least one room.');

  const now = Date.now();
  const checkInDay = localDay(checkInDate);
  const checkOutDay = localDay(checkOutDate);
  const stayId = `${customerId}_${checkInDay}`;
  const startsNow = checkInDay <= localDay();
  const amount = amountFields(extras.amountRaw ?? extras.totalAmount, paymentMode);
  const ids = rooms.map(() => push(ref(rtdb, 'bookings')).key as string);

  // Claim rooms (only stays that start now occupy a room immediately).
  const claimed: string[] = [];
  if (startsNow) {
    for (let i = 0; i < rooms.length; i++) {
      const result = await runTransaction(ref(rtdb, `rooms/${rooms[i]}/current_booking_id`), current =>
        current && current !== ids[i] ? undefined : ids[i]
      );
      if (!result.committed) {
        const releases: Updates = {};
        claimed.forEach(r => (releases[`rooms/${r}/current_booking_id`] = null));
        if (claimed.length) await update(ref(rtdb), releases).catch(() => {});
        throw new Error(`Room ${rooms[i]} was just booked on another device. Please pick another room.`);
      }
      claimed.push(rooms[i]);
    }
  }

  const updates: Updates = {};
  rooms.forEach((roomNo, i) => {
    updates[`bookings/${ids[i]}`] = {
      id: ids[i],
      customerId,
      stayId,
      roomNo,
      checkInDate,
      checkOutDate,
      checkInDay,
      checkOutDay,
      status: 'BOOKED',
      ...amount,
      tokenAmount: Number(extras.tokenAmount) || 0,
      guestName: str(extras.guestName) || 'Guest',
      mobile: str(extras.mobile),
      membersCount: Number(extras.membersCount) || 1,
      createdAt: now,
      updatedAt: now,
    };
    if (startsNow) occupyRoom(updates, roomNo, ids[i], now);
  });

  try {
    await update(ref(rtdb), updates);
  } catch (err) {
    if (claimed.length) {
      const releases: Updates = {};
      claimed.forEach(r => (releases[`rooms/${r}/current_booking_id`] = null));
      await update(ref(rtdb), releases).catch(() => {});
    }
    throw err;
  }
  return ids;
};

export const createBooking = async (
  customerId: string,
  roomNo: string,
  checkInDate: string,
  checkOutDate: string,
  paymentMode: string = 'CASH',
  extraData: BookingExtras = {}
): Promise<string> => {
  const [id] = await createBookings(customerId, [roomNo], checkInDate, checkOutDate, paymentMode, extraData);
  return id;
};

const customersByIds = async (ids: string[]): Promise<Record<string, any>> => {
  const entries = await Promise.all(
    Array.from(new Set(ids.filter(Boolean))).map(id =>
      get(ref(rtdb, `customers/${id}`))
        .then(s => [id, s.val()] as const)
        .catch(() => [id, null] as const)
    )
  );
  return Object.fromEntries(entries.filter(([, c]) => c));
};

export async function fetchBookingsEnriched(
  limit: number = 50,
  options?: { customersVal?: Record<string, any>; roomsVal?: Record<string, any> }
): Promise<BookingEnriched[]> {
  let bookings: BookingRecord[];
  try {
    bookings = snapToRecords((await get(query(ref(rtdb, 'bookings'), orderByKey(), limitToLast(limit)))).val());
  } catch (err) {
    console.warn('[fetchBookingsEnriched] Failed to load bookings:', err);
    return [];
  }

  const today = localDay();
  // Advance bookings live in the Rooms tab, not in the Bookings list.
  const visible = bookings.filter(b => !(checkInDayOf(b) > today && normalizeBookingStatus(b.status) !== 'CHECKED_OUT'));

  const [customers, rooms] = await Promise.all([
    options?.customersVal ? Promise.resolve(options.customersVal) : customersByIds(visible.map(b => b.customerId)),
    options?.roomsVal ? Promise.resolve(mapRooms(options.roomsVal)) : fetchAllRooms().catch(() => [] as RtdbRoom[]),
  ]);
  const roomByNo = new Map(rooms.map(r => [normalizeRoomId(r.room_no), r]));

  const result: BookingEnriched[] = [];
  for (const stay of groupByStay(visible).values()) {
    const first = stay.reduce((a, b) => ((a.createdAt || 0) <= (b.createdAt || 0) ? a : b));
    const customer = normalizeCustomer(first.customerId, customers[first.customerId] || {});
    const { total } = bookingAmount(first);
    const roomNumbers = Array.from(new Set(stay.map(b => normalizeRoomId(b.roomNo)).filter(Boolean))).sort(compareRoomIds);
    const status = stay.some(isOpen) ? normalizeBookingStatus(stay.find(isOpen)!.status) : 'CHECKED_OUT';
    const checkIn = first.checkInDate || '';
    const checkOut = first.checkOutDate || '';
    const paymentMode = first.paymentMode || 'CASH';

    result.push({
      id: first.id,
      customerId: first.customerId,
      roomNo: roomNumbers[0] || '',
      room_id: roomNumbers[0] || '',
      checkInDate: checkIn,
      checkOutDate: checkOut,
      status,
      paymentMode,
      customer: {
        name: customers[first.customerId] ? customer.name : first.guestName || 'Guest',
        mobile: customer.mobile || first.mobile || '',
        father_name: customer.father_name,
        address: customer.address,
        city: customer.city,
        amount: first.amountRaw ?? customer.amount,
        idImageUrl: customer.idImageUrl,
        idImageUrls: customer.idImageUrls,
      },
      room: roomByNo.get(roomNumbers[0]),
      total_amount: String(total),
      totalAmount: String(total),
      payment_mode: paymentMode,
      createdAt: first.createdAt,
      check_in: checkIn,
      check_out_expected: checkOut,
      check_out_actual: stay.find(b => b.check_out_actual)?.check_out_actual,
      room_numbers: roomNumbers,
    });
  }
  return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

const staySiblings = async (booking: BookingRecord): Promise<BookingRecord[]> => {
  if (booking.stayId) {
    const snap = await get(query(ref(rtdb, 'bookings'), orderByChild('stayId'), equalTo(booking.stayId)));
    const siblings = snapToRecords(snap.val());
    return siblings.length ? siblings : [booking];
  }
  const sameDay = checkInDayOf(booking);
  return (await bookingsOfCustomer(booking.customerId)).filter(b => checkInDayOf(b) === sameDay);
};

const fetchBookingRecord = async (bookingId: string): Promise<BookingRecord | null> => {
  const snap = await get(ref(rtdb, `bookings/${bookingId}`));
  return snap.exists() ? { ...snap.val(), id: bookingId } : null;
};

export const fetchBookingById = async (bookingId: string): Promise<BookingDetail | null> => {
  const booking = await fetchBookingRecord(bookingId);
  if (!booking) return null;

  const mainRoomNo = normalizeRoomId(booking.roomNo);
  const [customerSnap, siblings, room] = await Promise.all([
    booking.customerId ? get(ref(rtdb, `customers/${booking.customerId}`)) : Promise.resolve(null),
    staySiblings(booking),
    fetchRoom(mainRoomNo),
  ]);
  const customer = normalizeCustomer(booking.customerId, customerSnap?.val() || {});

  return {
    id: bookingId,
    customerId: booking.customerId,
    roomNo: mainRoomNo,
    roomNumbers: Array.from(new Set([mainRoomNo, ...siblings.map(b => normalizeRoomId(b.roomNo))].filter(Boolean))).sort(compareRoomIds),
    checkInDate: booking.checkInDate || '',
    checkOutDate: booking.checkOutDate || '',
    checkOutActual: booking.check_out_actual,
    status: normalizeBookingStatus(booking.status),
    createdAt: booking.createdAt || Date.now(),
    customer: {
      name: customerSnap?.exists() ? customer.name : booking.guestName || 'Guest',
      mobile: customer.mobile || booking.mobile || '',
      father_name: customer.father_name,
      address: customer.address,
      city: customer.city,
      amount: booking.amountRaw ?? customer.amount,
      idImageUrl: customer.idImageUrl,
      idImageUrls: customer.idImageUrls,
    },
    room,
    relatedBookingIds: siblings.map(b => b.id),
  };
};

/* ============================================================
   CHECKOUT / CHECK-IN / EXTEND
============================================================ */

/**
 * Checks out every room of the stay and records the stay's revenue once,
 * on today's date, in the same atomic write.
 */
export const handleCheckout = async (bookingId: string) => {
  const booking = await fetchBookingRecord(bookingId);
  if (!booking) throw new Error('Booking not found');

  const siblings = await staySiblings(booking);
  const open = siblings.filter(isOpen);
  if (open.length === 0) return { success: true, roomsCheckedOut: 0 };

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const today = localDay(now);
  const alreadyCounted = siblings.some(b => b.revenueCounted);
  const updates: Updates = {};

  for (const b of open) {
    updates[`bookings/${b.id}/status`] = 'CHECKED_OUT';
    updates[`bookings/${b.id}/check_out_actual`] = nowIso;
    updates[`bookings/${b.id}/checkedOutDay`] = today;
    updates[`bookings/${b.id}/updatedAt`] = now;
    const roomNo = normalizeRoomId(b.roomNo);
    const room = roomNo ? await fetchRoom(roomNo) : undefined;
    if (roomNo && (!room?.current_booking_id || room.current_booking_id === b.id)) freeRoom(updates, roomNo, now);
  }

  if (!alreadyCounted) {
    // The flag lives on the booking whose amount was counted, so edits/deletes can reverse it.
    updates[`bookings/${open[0].id}/revenueCounted`] = true;
    Object.assign(updates, statsUpdates(today, stayDelta(bookingAmount(open[0]), 1)));
  }

  await update(ref(rtdb), updates);
  return { success: true, roomsCheckedOut: open.length };
};

export const checkoutBooking = async (bookingId: string): Promise<void> => {
  await handleCheckout(bookingId);
};

export const confirmCheckIn = async (bookingId: string, roomNo: string) => {
  const booking = await fetchBookingRecord(bookingId);
  if (!booking) return;
  const now = Date.now();
  const room = normalizeRoomId(roomNo || booking.roomNo);
  const updates: Updates = {
    [`bookings/${bookingId}/status`]: 'BOOKED',
    [`bookings/${bookingId}/confirmedAt`]: now,
    [`bookings/${bookingId}/updatedAt`]: now,
  };
  if (room) occupyRoom(updates, room, bookingId, now);
  await update(ref(rtdb), updates);
};

/** Moves the expected checkout of every open room in the stay to `newCheckOutDay` (YYYY-MM-DD). */
export const extendStay = async (bookingId: string, newCheckOutDay: string) => {
  const booking = await fetchBookingRecord(bookingId);
  if (!booking) throw new Error('Booking not found');
  const [y, m, d] = newCheckOutDay.split('-').map(Number);
  const newCheckOut = new Date(y, m - 1, d, 12, 0, 0).toISOString();
  const now = Date.now();
  const updates: Updates = {};

  for (const b of (await staySiblings(booking)).filter(isOpen)) {
    updates[`bookings/${b.id}/checkOutDate`] = newCheckOut;
    updates[`bookings/${b.id}/checkOutDay`] = newCheckOutDay;
    updates[`bookings/${b.id}/previousCheckOutDate`] = b.checkOutDate || '';
    updates[`bookings/${b.id}/extendedAt`] = now;
    updates[`bookings/${b.id}/updatedAt`] = now;
  }
  await update(ref(rtdb), updates);
};

/* ============================================================
   REASSIGN ROOMS
============================================================ */

export const reassignBookingRooms = async (bookingId: string, newRoomNumbers: (string | number)[]) => {
  const targetRooms = Array.from(new Set(newRoomNumbers.map(normalizeRoomId).filter(Boolean)));
  if (targetRooms.length === 0) throw new Error('Please select at least one room.');

  const booking = await fetchBookingRecord(bookingId);
  if (!booking) throw new Error('Booking not found');
  const inDay = checkInDayOf(booking);
  const outDay = checkOutDayOf(booking);
  if (!inDay || !outDay) throw new Error('Booking dates are invalid; cannot reassign rooms.');

  const editable = (await staySiblings(booking))
    .filter(isOpen)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const editableIds = new Set(editable.map(b => b.id));

  // Conflicts: any other open booking in a target room whose dates overlap this stay.
  const others = snapToRecords(
    (await get(query(ref(rtdb, 'bookings'), orderByChild('checkOutDay'), startAt(inDay)))).val()
  );
  for (const roomNo of targetRooms) {
    const clash = others.find(
      o =>
        !editableIds.has(o.id) &&
        isOpen(o) &&
        normalizeRoomId(o.roomNo) === roomNo &&
        checkInDayOf(o) <= outDay &&
        checkOutDayOf(o) >= inDay
    );
    if (clash) throw new Error(`Room ${roomNo} is already booked for overlapping dates.`);
  }

  const now = Date.now();
  const startsNow = inDay <= localDay();
  const updates: Updates = {};
  const updatedBookingIds: string[] = [];

  for (const b of editable) {
    const oldRoom = normalizeRoomId(b.roomNo);
    if (oldRoom && !targetRooms.includes(oldRoom)) freeRoom(updates, oldRoom, now);
  }

  targetRooms.forEach((roomNo, i) => {
    const existing = editable[i];
    const id = existing?.id ?? (push(ref(rtdb, 'bookings')).key as string);
    updatedBookingIds.push(id);
    if (existing) {
      updates[`bookings/${id}/roomNo`] = roomNo;
      updates[`bookings/${id}/updatedAt`] = now;
    } else {
      const { id: _omit, roomNo: _room, revenueCounted: _rc, ...template } = booking;
      updates[`bookings/${id}`] = { ...template, id, roomNo, stayId: stayIdOf(booking), createdAt: now, updatedAt: now };
    }
    if (startsNow) occupyRoom(updates, roomNo, id, now);
  });
  editable.slice(targetRooms.length).forEach(b => (updates[`bookings/${b.id}`] = null));

  updates[`customers/${booking.customerId}/selectedRoom`] = targetRooms.join(',');
  updates[`customers/${booking.customerId}/updatedAt`] = now;

  await update(ref(rtdb), updates);
  return { updatedBookingIds };
};

/* ============================================================
   ADVANCE BOOKINGS
============================================================ */

export const fetchAdvanceBookings = async (): Promise<AdvanceBooking[]> => {
  const bookings = (await fetchActiveBookings()).filter(b => isOpen(b) && Number(b.tokenAmount) > 0);
  const missingNames = bookings.filter(b => !b.guestName || b.guestName === 'Guest').map(b => b.customerId);
  const customers = missingNames.length ? await customersByIds(missingNames) : {};

  const grouped = new Map<string, AdvanceBooking>();
  for (const b of bookings) {
    const key = stayIdOf(b);
    const roomNo = normalizeRoomId(b.roomNo);
    const existing = grouped.get(key);
    if (existing) {
      if (roomNo && !existing.roomNumbers.includes(roomNo)) existing.roomNumbers.push(roomNo);
      continue;
    }
    const cust = customers[b.customerId] || {};
    const tokenAmount = Number(b.tokenAmount) || 0;
    grouped.set(key, {
      id: b.id,
      guestName: b.guestName && b.guestName !== 'Guest' ? b.guestName : cust.name || cust.guestName || 'Guest',
      membersCount: Number(b.membersCount) || 1,
      arrivalDate: checkInDayOf(b),
      roomNumbers: roomNo ? [roomNo] : [],
      tokenAmount,
      totalAmount: bookingAmount(b).total,
      tokenPaid: tokenAmount > 0,
      paymentMode: b.paymentMode || 'CASH',
      mobile: b.mobile || cust.mobile || '',
    });
  }
  return Array.from(grouped.values()).sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
};

/* ============================================================
   MAINTENANCE
============================================================ */

/**
 * Makes room flags match open bookings: a room is occupied exactly when an open
 * booking for it has started. Never checks anyone out.
 */
export const repairRoomStatuses = async (): Promise<{ success: boolean; repaired: number }> => {
  const [openSnap, roomsSnap] = await Promise.all([
    get(query(ref(rtdb, 'bookings'), orderByChild('status'), equalTo('BOOKED'))),
    get(ref(rtdb, 'rooms')),
  ]);
  const today = localDay();
  const occupiedBy = new Map<string, string>();
  for (const b of snapToRecords(openSnap.val())) {
    const roomNo = normalizeRoomId(b.roomNo);
    if (roomNo && checkInDayOf(b) <= today) occupiedBy.set(roomNo, b.id);
  }

  const now = Date.now();
  const updates: Updates = {};
  let repaired = 0;
  for (const room of mapRooms(roomsSnap.val())) {
    const roomNo = normalizeRoomId(room.key);
    const bookingId = occupiedBy.get(normalizeRoomId(room.room_no)) ?? occupiedBy.get(roomNo);
    const flaggedOccupied = !room.is_available || !!room.current_booking_id;
    if (bookingId && room.current_booking_id !== bookingId) {
      occupyRoom(updates, roomNo, bookingId, now);
      repaired++;
    } else if (!bookingId && flaggedOccupied) {
      freeRoom(updates, roomNo, now);
      repaired++;
    }
  }
  if (repaired > 0) await update(ref(rtdb), updates);
  return { success: true, repaired };
};

/**
 * Recomputes all revenue stats from bookings. Reads the full booking history, so it
 * is an admin-only repair tool; normal operation keeps stats current at checkout.
 */
export const rebuildMonthlyStats = async () => {
  const bookings = snapToRecords((await get(ref(rtdb, 'bookings'))).val());
  const daily: Record<string, RevenueDelta> = {};
  const counted: Updates = {};
  let count = 0;

  for (const stay of groupByStay(bookings).values()) {
    const done = stay.filter(b => normalizeBookingStatus(b.status) === 'CHECKED_OUT');
    stay.forEach(b => b.revenueCounted && (counted[`bookings/${b.id}/revenueCounted`] = null));
    if (done.length === 0 || done.length < stay.filter(b => normalizeBookingStatus(b.status) !== 'CANCELLED').length) continue;

    const source = done.find(b => bookingAmount(b).total > 0) ?? done[0];
    const day = source.checkedOutDay || localDay(source.check_out_actual || source.checkOutDate);
    if (!day) continue;

    const delta = stayDelta(bookingAmount(source), 1);
    const acc = (daily[day] ??= { revenue: 0, cash: 0, upi: 0, count: 0, cashCount: 0, upiCount: 0 });
    for (const key of Object.keys(delta) as (keyof RevenueDelta)[]) acc[key] += delta[key];
    counted[`bookings/${source.id}/revenueCounted`] = true;
    counted[`bookings/${source.id}/checkedOutDay`] = day;
    count++;
  }

  const monthly: Record<string, RevenueDelta & { updatedAt?: number }> = {};
  const now = Date.now();
  for (const [day, d] of Object.entries(daily)) {
    const acc = (monthly[day.slice(0, 7)] ??= { revenue: 0, cash: 0, upi: 0, count: 0, cashCount: 0, upiCount: 0 });
    for (const key of Object.keys(d) as (keyof RevenueDelta)[]) acc[key] += d[key];
    acc.updatedAt = now;
  }
  const dailyWithTime = Object.fromEntries(Object.entries(daily).map(([k, v]) => [k, { ...v, updatedAt: now }]));

  await set(ref(rtdb, 'stats'), { daily: dailyWithTime, monthly });
  if (Object.keys(counted).length) await update(ref(rtdb), counted);
  return { success: true, count };
};

/* ============================================================
   REPORTS
============================================================ */

/**
 * Bookings for a report range, via two indexed range queries:
 * those checked out in the range (revenue) and those checked in during it (occupancy).
 */
export const fetchReportData = async (startDate: Date, endDate: Date) => {
  const start = localDay(startDate);
  const end = localDay(endDate);
  const [checkedOutSnap, checkedInSnap] = await Promise.all([
    get(query(ref(rtdb, 'bookings'), orderByChild('checkedOutDay'), startAt(start), endAt(end))),
    get(query(ref(rtdb, 'bookings'), orderByChild('checkInDay'), startAt(start), endAt(end))),
  ]);
  return {
    checkedOut: snapToRecords(checkedOutSnap.val()),
    checkedIn: snapToRecords(checkedInSnap.val()),
  };
};
