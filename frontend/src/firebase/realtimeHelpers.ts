import { rtdb } from './config';
import { ref, push, set, onValue, off } from 'firebase/database';

export async function createBooking(data: {
  name: string;
  roomNumber: string;
  phone: string;
}) {
  const bookingsRef = ref(rtdb, 'bookings');
  const newBookingRef = push(bookingsRef);
  await set(newBookingRef, {
    ...data,
    createdAt: Date.now(),
  });
  return newBookingRef.key;
}

export function subscribeBookings(callback: (val: Record<string, any>) => void) {
  const bookingsRef = ref(rtdb, 'bookings');
  const listener = (snap: any) => callback(snap.val() || {});
  onValue(bookingsRef, listener);
  return () => off(bookingsRef, 'value', listener);
}
