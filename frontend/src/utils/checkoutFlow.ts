import { Alert } from 'react-native';
import { handleCheckout } from './rtdbService';
import { getCached, setCached } from './cache';
import { haptic } from '../ui/Pressable';

const ask = (title: string, message: string, confirm: string) =>
  new Promise<boolean>(resolve =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirm, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  );

/** Marks a stay as checked out in the cached bookings list so every screen agrees at once. */
export const markCheckedOutInCache = async (bookingId: string) => {
  const list = await getCached<any[]>('bookings:list');
  if (!Array.isArray(list)) return;
  const now = new Date().toISOString();
  await setCached(
    'bookings:list',
    list.map(b => (b.id === bookingId ? { ...b, status: 'CHECKED_OUT', check_out_actual: b.check_out_actual || now } : b))
  );
};

/**
 * Checks out a stay: every room is freed and the revenue is recorded.
 * Pass `confirm: false` when the gesture itself was the confirmation (slide to check out).
 * Resolves true when the guest was checked out.
 */
export const checkOutStay = async (
  bookingId: string,
  guest: { name?: string; rooms?: string[] },
  { confirm = true }: { confirm?: boolean } = {}
): Promise<boolean> => {
  const rooms = (guest.rooms || []).filter(Boolean);
  if (confirm) {
    const roomText = rooms.length ? ` from room${rooms.length > 1 ? 's' : ''} ${rooms.join(', ')}` : '';
    const ok = await ask('Check out?', `${guest.name || 'This guest'} will be checked out${roomText}.`, 'Check out');
    if (!ok) return false;
  }
  try {
    await handleCheckout(bookingId);
    haptic.success();
    await markCheckedOutInCache(bookingId).catch(() => {});
    return true;
  } catch (error: any) {
    haptic.warning();
    Alert.alert('Could not check out', error?.message || 'Check your connection and try again.');
    return false;
  }
};
