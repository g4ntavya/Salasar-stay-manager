import { useEffect, useMemo, useState } from 'react';
import {
  subscribeToRooms,
  subscribeToActiveBookings,
  compareRoomIds,
  normalizeBookingStatus,
  normalizeRoomId,
  type RtdbRoom,
} from './rtdbService';
import { defaultRoomSeeds } from './defaultRooms';
import { TOTAL_ROOMS } from './roomConstants';
import { localDay } from './date';

// Room 1 is not let out.
const EXCLUDED = new Set(['1']);

const SEED_ROOMS: RtdbRoom[] = defaultRoomSeeds
  .slice(0, TOTAL_ROOMS)
  .filter(seed => !EXCLUDED.has(seed.room_number))
  .map(seed => ({
    key: seed.room_number,
    room_no: seed.room_number,
    beds: seed.capacity ?? 1,
    type: seed.type,
    ac_make: seed.ac_make,
    remarks: seed.remarks,
    is_available: true,
    current_booking_id: null,
  }));

/**
 * Every room plus the ones that cannot take a stay from `inDay` to `outDay` (YYYY-MM-DD).
 * `ownBookingIds` are the bookings being edited, so their own rooms stay selectable.
 * Uses the app's shared live listeners, so it costs no extra downloads.
 */
export const useRoomAvailability = (inDay: string, outDay: string, ownBookingIds: string[] = []) => {
  const [live, setLive] = useState<RtdbRoom[] | null>(null);
  const [active, setActive] = useState<any[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(
    () =>
      subscribeToRooms(
        r => {
          setError(null);
          setLive(r);
        },
        setError
      ),
    []
  );
  useEffect(() => subscribeToActiveBookings(setActive), []);

  const rooms = useMemo(() => {
    const byNo = new Map(SEED_ROOMS.map(r => [r.room_no, r]));
    (live || []).forEach(r => {
      if (!EXCLUDED.has(r.room_no)) byNo.set(r.room_no, r);
    });
    return Array.from(byNo.values()).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
  }, [live]);

  const ownKey = ownBookingIds.join(',');
  const unavailable = useMemo(() => {
    const own = new Set(ownKey ? ownKey.split(',') : []);
    const set = new Set<string>();
    if (!inDay || !outDay) return set;

    const today = localDay();
    for (const b of active) {
      if (own.has(b.id)) continue;
      const s = normalizeBookingStatus(b.status);
      if (s === 'CHECKED_OUT' || s === 'CANCELLED') continue;
      const bIn = b.checkInDay || localDay(b.checkInDate);
      const planned = b.checkOutDay || localDay(b.checkOutDate);
      // A guest past their check-out date holds the room until they are checked out.
      const bOut = planned && planned < today ? today : planned;
      if (bIn && bOut && bIn <= outDay && bOut >= inDay) set.add(normalizeRoomId(b.roomNo));
    }

    // A stay that includes today also needs the room to be physically free now.
    if (inDay <= today) {
      for (const r of rooms) {
        const heldByOther = r.current_booking_id ? !own.has(r.current_booking_id) : r.is_available === false;
        if (heldByOther) set.add(r.room_no);
      }
    }
    return set;
  }, [active, rooms, inDay, outDay, ownKey]);

  return { rooms, unavailable, loading: live === null && !error, error };
};
