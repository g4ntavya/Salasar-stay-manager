export type UserRole = 'ADMIN' | 'STAFF' | 'GROWTH';

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  email: string;
}

export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
export type CleanedStatus = 'CLEAN' | 'UNCLEAN' | 'IN_PROGRESS';

export interface Room {
  id: string;
  room_number: string;
  type: string;
  capacity: number;
  base_rate: number; // Renamed from price_per_night for clarity with overrides
  status: RoomStatus;
  cleaned_status: CleanedStatus;
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
  idImageUrl?: string;
  idImageUrls?: string[];
  created_at: string;
}

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'BOOKED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'checked_out'
  | 'checkedout'
  | 'booked';

export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'OTHER';

export interface DailyCharge {
  date: string;
  rate: number;
}

export interface Booking {
  id: string;
  customer_id: string;
  room_id: string;
  room_numbers?: string[];
  check_in: string;
  check_out_expected: string;
  check_out_actual?: string;
  status: BookingStatus;
  payment_mode?: PaymentMode;
  daily_charges?: DailyCharge[];
  total_amount: number;
  token_amount?: number; // Token/advance payment for advance bookings
  created_by: string;
  created_at: string;
  audit_log?: string[];
  // Populated fields (not in Firestore)
  customer?: Customer;
  room?: Room;
}

export interface RatePlan {
  id: string;
  name: string;
  default_weekday_rate: number;
  default_weekend_rate: number;
}

export interface RateOverride {
  id: string;
  room_id?: string;
  room_type?: string;
  date: string; // YYYY-MM-DD
  rate: number;
}

export interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  created_at: string;
  created_by?: string;
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

