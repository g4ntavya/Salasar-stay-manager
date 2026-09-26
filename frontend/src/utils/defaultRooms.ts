import type { RoomStatus } from '../types';
import { DEFAULT_ROOM_STATUS } from './roomConstants';

type SeedRoom = {
  room_no: string;
  beds: number;
  type: string;
  ac_make: string;
  remarks: string;
  is_available: boolean;
  current_booking_id: string | null;
};

// Rooms removed: 1 (Staff/Disabled Rooms)

const rawRooms: SeedRoom[] = [
  // { room_no: '1', beds: 2, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '2', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '3', beds: 3, type: 'AC', ac_make: 'LLOYD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '4', beds: 2, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '5', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '6', beds: 4, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '7', beds: 4, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '8', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '9', beds: 2, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '10', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '11', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },

  { room_no: '101', beds: 4, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '102', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '103', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '104', beds: 2, type: 'Non AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '105', beds: 2, type: 'AC', ac_make: 'LLOYD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '106', beds: 3, type: 'AC', ac_make: 'LLOYD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '107', beds: 2, type: 'AC', ac_make: '', remarks: 'Re-added', is_available: true, current_booking_id: null },
  { room_no: '108', beds: 3, type: 'AC', ac_make: '', remarks: 'Re-added', is_available: true, current_booking_id: null },
  { room_no: '109', beds: 3, type: 'AC', ac_make: '', remarks: 'Re-added', is_available: true, current_booking_id: null },
  { room_no: '110', beds: 2, type: 'AC', ac_make: '', remarks: 'Re-added', is_available: true, current_booking_id: null },

  { room_no: '111', beds: 2, type: 'Non AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '112', beds: 2, type: 'AC', ac_make: 'IFB', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '113', beds: 3, type: 'Non AC', ac_make: 'OLD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '114', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '115', beds: 3, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '116', beds: 4, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },

  { room_no: 'Basement 1', beds: 1, type: 'Basement', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: 'Basement 2', beds: 1, type: 'Basement', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: 'CB1', beds: 0, type: 'Common Bathroom', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: 'CB2', beds: 0, type: 'Common Bathroom', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: 'CB3', beds: 0, type: 'Common Bathroom', ac_make: '', remarks: '', is_available: true, current_booking_id: null },

  { room_no: '201', beds: 4, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '202', beds: 6, type: 'AC', ac_make: 'IFB', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '203', beds: 4, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '204', beds: 6, type: 'AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '205', beds: 4, type: 'AC', ac_make: 'WHIRLPOOL', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '206', beds: 2, type: 'AC', ac_make: 'LLOYD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '207', beds: 4, type: 'AC', ac_make: 'LLOYD (NEW)', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '208', beds: 4, type: 'AC', ac_make: 'IFB', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '209', beds: 2, type: 'AC', ac_make: 'LLOYD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '210', beds: 4, type: 'AC', ac_make: 'DOLLER', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '211', beds: 4, type: 'Non AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },

  { room_no: '301', beds: 4, type: 'Non AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '302', beds: 0, type: 'Small Hall Non AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '303', beds: 4, type: 'AC', ac_make: 'LLOYD (NEW)', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '304', beds: 0, type: 'Hall AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '305', beds: 4, type: 'Non AC', ac_make: '', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '306', beds: 6, type: 'AC', ac_make: 'LLOYD', remarks: '', is_available: true, current_booking_id: null },
  { room_no: '307', beds: 4, type: 'AC', ac_make: 'LLOYD (NEW)', remarks: '', is_available: true, current_booking_id: null },
];

export const defaultRoomSeeds = rawRooms
  .map((room) => {
    const status: RoomStatus = room.is_available ? DEFAULT_ROOM_STATUS : 'OCCUPIED';
    const capacity = Number.isFinite(room.beds) ? room.beds : 1;

    return {
      room_number: room.room_no.toString(),
      type: room.type,
      capacity,
      price_per_night: 0,
      status,
      ac_make: room.ac_make,
      remarks: '',
      current_booking_id: room.current_booking_id ?? undefined,
    };
  });
