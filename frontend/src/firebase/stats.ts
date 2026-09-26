// Revenue statistics, maintained incrementally.
//
// Revenue is recognised once per stay, on the day the stay checks out:
//   stats/daily/{YYYY-MM-DD}   { revenue, cash, upi, count, cashCount, upiCount }
//   stats/monthly/{YYYY-MM}    same shape
// Checkout, amount edits and deletions apply deltas with increment(), so reading
// a whole year of analytics is one tiny query instead of scanning every booking.

import { ref, get, query, orderByKey, startAt, endAt, increment } from 'firebase/database';
import { rtdb } from './firebase';

export interface MonthlyStats {
  revenue: number;
  bookingsCount: number;
  updatedAt: number;
}

export interface RevenueDelta {
  revenue: number;
  cash: number;
  upi: number;
  count: number;
  cashCount: number;
  upiCount: number;
}

type AnalyticsPaymentFilter = 'ALL' | 'CASH' | 'UPI';

/** The delta a single checked-out stay contributes to the stats (negate to remove it). */
export const stayDelta = (payments: { cash?: number; upi?: number }, sign: 1 | -1 = 1): RevenueDelta => {
  const cash = Number(payments.cash) || 0;
  const upi = Number(payments.upi) || 0;
  return {
    revenue: sign * (cash + upi),
    cash: sign * cash,
    upi: sign * upi,
    count: sign,
    cashCount: cash > 0 ? sign : 0,
    upiCount: upi > 0 ? sign : 0,
  };
};

/** Multi-path update entries that apply `delta` to the day and month of `day` (YYYY-MM-DD). */
export const statsUpdates = (day: string, delta: RevenueDelta): Record<string, unknown> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return {};
  const updates: Record<string, unknown> = {};
  const now = Date.now();
  for (const path of [`stats/daily/${day}`, `stats/monthly/${day.slice(0, 7)}`]) {
    for (const [field, value] of Object.entries(delta)) {
      if (value !== 0) updates[`${path}/${field}`] = increment(value);
    }
    updates[`${path}/updatedAt`] = now;
  }
  return updates;
};

/** Monthly revenue and stay counts for the given YYYY-MM keys, filtered by payment mode. */
export const fetchAnalyticsData = async (
  months: string[],
  paymentMode: AnalyticsPaymentFilter = 'ALL'
): Promise<Record<string, MonthlyStats>> => {
  const results: Record<string, MonthlyStats> = {};
  if (months.length === 0) return results;

  const sorted = [...months].sort();
  const snap = await get(
    query(ref(rtdb, 'stats/monthly'), orderByKey(), startAt(sorted[0]), endAt(sorted[sorted.length - 1]))
  );
  const monthly: Record<string, any> = snap.val() || {};

  for (const key of months) {
    const m = monthly[key] || {};
    const revenue = paymentMode === 'CASH' ? m.cash : paymentMode === 'UPI' ? m.upi : m.revenue;
    const count = paymentMode === 'CASH' ? m.cashCount : paymentMode === 'UPI' ? m.upiCount : m.count;
    results[key] = {
      revenue: Number(revenue) || 0,
      bookingsCount: Number(count) || 0,
      updatedAt: Number(m.updatedAt) || 0,
    };
  }
  return results;
};
