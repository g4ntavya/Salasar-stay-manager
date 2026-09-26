import { normalizeBookingStatus, normalizeRoomId, compareRoomIds, bookingAmount } from './rtdbService';

/** Converts any stored date representation into epoch milliseconds (0 if invalid). */
export const parseToTimestamp = (dateValue: any): number => {
    if (!dateValue) return 0;
    if (typeof dateValue === 'number') {
        // Seconds vs milliseconds
        return dateValue > 0 && dateValue < 10000000000 ? dateValue * 1000 : dateValue;
    }
    if (dateValue instanceof Date) return dateValue.getTime();
    if (typeof dateValue === 'string') {
        const d = new Date(dateValue);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    return 0;
};

/** YYYY-MM-DD in local time. */
export const toLocalDateStr = (date: Date | number): string => {
    const d = typeof date === 'number' ? new Date(date) : date;
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const stayKeyOf = (b: any, fallbackId: string) =>
    b.stayId || (b.customerId && b.checkInDate ? `${b.customerId}__${b.checkInDate}` : fallbackId);

/**
 * Bookings whose check-in (or, with statusToInclude = CHECKED_OUT, checkout) falls in the
 * range. Cancelled bookings are excluded unless explicitly requested.
 */
export const filterBookingsByDateRange = (
    bookings: any[],
    startDate: Date,
    endDate: Date,
    statusToInclude: string | null = null
) => {
    const start = toLocalDateStr(startDate);
    const end = toLocalDateStr(endDate);
    const target = statusToInclude ? normalizeBookingStatus(statusToInclude) : null;

    return bookings.filter(booking => {
        const status = normalizeBookingStatus(booking.status);
        if (target ? status !== target : status === 'CANCELLED') return false;

        const day =
            target === 'CHECKED_OUT'
                ? booking.checkedOutDay || toLocalDateStr(parseToTimestamp(booking.check_out_actual || booking.checkOutDate))
                : booking.checkInDay || toLocalDateStr(parseToTimestamp(booking.checkInDate));
        return !!day && day >= start && day <= end;
    });
};

/**
 * Revenue for stays checked out within the range. A stay with several rooms is one
 * line and its amount is counted once. Amounts like "1000p, 500c" are summed.
 */
export const getLiveRevenueReport = (
    bookings: any[],
    startDate: Date,
    endDate: Date
) => {
    const start = toLocalDateStr(startDate);
    const end = toLocalDateStr(endDate);
    const stays = new Map<string, any>();

    for (const b of bookings) {
        if (!b || normalizeBookingStatus(b.status) !== 'CHECKED_OUT') continue;
        const day = b.checkedOutDay || toLocalDateStr(parseToTimestamp(b.check_out_actual || b.checkOutDate));
        if (!day || day < start || day > end) continue;

        const key = stayKeyOf(b, b.id);
        const roomNo = normalizeRoomId(b.roomNo ?? b.room_no);
        const amount = bookingAmount(b);
        const existing = stays.get(key);

        if (!existing) {
            stays.set(key, {
                id: b.id,
                checkoutDate: day,
                guestName: b.guestName || 'Guest',
                mobile: b.mobile || '',
                roomNumbers: roomNo ? [roomNo] : [],
                amount: amount.total,
                cash: amount.cash,
                upi: amount.upi,
                amountRaw: b.amountRaw ?? '',
                status: 'CHECKED_OUT',
            });
            continue;
        }
        if (roomNo && !existing.roomNumbers.includes(roomNo)) existing.roomNumbers.push(roomNo);
        // Rooms of a stay carry the same stay amount; take the one that has it.
        if (b.revenueCounted || existing.amount === 0) {
            existing.amount = amount.total;
            existing.cash = amount.cash;
            existing.upi = amount.upi;
        }
    }

    const finalBookings = Array.from(stays.values())
        .map(stay => ({ ...stay, room: stay.roomNumbers.sort(compareRoomIds).join(', ') }))
        .sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));

    const sum = (field: 'amount' | 'cash' | 'upi') => finalBookings.reduce((total, s) => total + s[field], 0);

    return {
        totalBookings: finalBookings.length,
        totalRevenue: sum('amount'),
        cashRevenue: sum('cash'),
        upiRevenue: sum('upi'),
        bookings: finalBookings,
    };
};
