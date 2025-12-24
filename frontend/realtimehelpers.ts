import { rtdb } from './lib/firebase'; // use the project's re-export for firebase
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

export function useBookings(callback: (val: Record<string, any>) => void) {
  const bookingsRef = ref(rtdb, 'bookings');
  const start = () => onValue(bookingsRef, (snap) => callback(snap.val() || {}));
  const stop = () => off(bookingsRef);
  return { start, stop };
}