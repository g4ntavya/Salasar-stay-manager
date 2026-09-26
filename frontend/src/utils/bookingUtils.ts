import { Booking, Room, RatePlan, RateOverride, DailyCharge } from '../types';

const getLocalDateStr = (d: Date): string => {
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
};

export const getDaysBetween = (start: string, end: string): string[] => {
    const dates: string[] = [];
    let curr = new Date(start);
    const stop = new Date(end);

    // Normalize to date only for comparison
    const stopStr = getLocalDateStr(stop);

    while (getLocalDateStr(curr) < stopStr) {
        dates.push(getLocalDateStr(curr));
        curr.setDate(curr.getDate() + 1);
    }

    return dates;
};

export const calculateBookingCharges = (
    checkIn: string,
    checkOut: string,
    room: Room,
    ratePlans: RatePlan[],
    overrides: RateOverride[]
): { dailyCharges: DailyCharge[]; totalAmount: number } => {
    const dates = getDaysBetween(checkIn, checkOut);
    const dailyCharges: DailyCharge[] = [];
    let totalAmount = 0;

    // Assuming for now we use the first available rate plan or a default if none
    const defaultPlan = ratePlans[0];

    dates.forEach(date => {
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6; // 0=Sunday, 6=Saturday

        // 1. Check for Room specific override
        let rate = overrides.find(o => o.date === date && o.room_id === room.id)?.rate;

        // 2. Check for Room Type specific override
        if (rate === undefined) {
            rate = overrides.find(o => o.date === date && o.room_type === room.type)?.rate;
        }

        // 3. Check for Plan default
        if (rate === undefined && defaultPlan) {
            rate = isWeekend ? defaultPlan.default_weekend_rate : defaultPlan.default_weekday_rate;
        }

        // 4. Fallback to Room Base Rate
        if (rate === undefined) {
            rate = room.base_rate;
        }

        dailyCharges.push({ date, rate });
        totalAmount += rate;
    });

    return { dailyCharges, totalAmount };
};

export const validateExtendStay = (
    currentBooking: Booking,
    newCheckOut: string,
    futureBookings: Booking[]
): { valid: boolean; error?: string } => {
    const newOut = new Date(newCheckOut);
    const oldOut = new Date(currentBooking.check_out_expected);

    if (newOut <= oldOut) {
        return { valid: false, error: 'New checkout must be after current checkout' };
    }

    // Check if any future booking for the same room starts before new checkout
    const conflict = futureBookings.find(b => {
        if (b.id === currentBooking.id) return false;
        const bStart = new Date(b.check_in);
        return bStart < newOut && b.room_id === currentBooking.room_id && b.status !== 'CANCELLED';
    });

    if (conflict) {
        return {
            valid: false,
            error: `Room is already booked from ${new Date(conflict.check_in).toLocaleDateString()}`
        };
    }

    return { valid: true };
};
