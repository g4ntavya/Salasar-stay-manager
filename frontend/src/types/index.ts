export type UserRole = 'ADMIN' | 'STAFF';

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  email: string;
}

export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';

export interface Room {
  id: string;
  room_number: string;
  type: string;
  capacity: number;
  price_per_night: number;
  status: RoomStatus;
  current_booking_id?: string;
  ac_make?: string;
  remarks?: string;
}

export interface Customer {
  id: string;
  name: string;
  father_name: string;
  address: string;
  city: string;
  mobile: string;
  member_count: number;
  vehicle_number?: string;
  id_type: string;
  id_number_masked: string;
  id_photo_base64?: string;
  created_at: string;
}

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'BOOKED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  // tolerate legacy/lowercase values from RTDB
  | 'checked_out'
  | 'checkedout'
  | 'booked';

export interface Booking {
  id: string;
  customer_id: string;
  room_id: string;
  room_numbers?: string[];
  check_in: string;
  check_out_expected: string;
  check_out_actual?: string;
  status: BookingStatus;
  total_amount: number;
  created_by: string;
  created_at: string;
  // Populated fields (not in Firestore)
  customer?: Customer;
  room?: Room;
}

export type MessageChannel = 'WHATSAPP';
export type MessageStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface Message {
  id: string;
  booking_id: string;
  customer_id: string;
  channel: MessageChannel;
  template_name: string;
  status: MessageStatus;
  created_at: string;
}
