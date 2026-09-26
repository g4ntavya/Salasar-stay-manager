/**
 * Amount parsing for the free-text "Amount" field on bookings.
 *
 * Staff type amounts like "1500", "1000p, 500c" or "₹1,200 upi + 300 cash".
 * Each number is one payment; an optional suffix says how it was paid:
 *   p / u / upi / g / gpay / phonepe / paytm / online  → UPI
 *   c / cash                                           → CASH
 * Numbers without a suffix use the booking's selected payment mode.
 *
 * "1,500" and "12,000" are read as thousands separators; "100,100" (3+ digits
 * before the comma) is read as two payments, because staff separate payments
 * with commas.
 */

export type PaymentMode = 'CASH' | 'UPI';

export interface AmountPart {
  amount: number;
  mode: PaymentMode;
}

export interface ParsedAmount {
  total: number;
  cash: number;
  upi: number;
  parts: AmountPart[];
  /** CASH / UPI when every part used the same mode, MIXED otherwise, NONE when empty. */
  mode: PaymentMode | 'MIXED' | 'NONE';
}

const UPI_SUFFIXES = new Set(['p', 'u', 'upi', 'g', 'gpay', 'phonepe', 'paytm', 'online']);
const CASH_SUFFIXES = new Set(['c', 'cash']);

// A number, optional whitespace, then an optional payment suffix that must end the word.
const TOKEN_RE = /(\d+(?:\.\d+)?)\s*(upi|gpay|phonepe|paytm|online|cash|p|u|g|c)?(?![a-z])/gi;

// Anything this long is a phone number typed into the wrong field, not money.
const MAX_AMOUNT_DIGITS = 9;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const normalizePaymentMode = (mode: unknown): PaymentMode => {
  const m = String(mode ?? '').trim().toUpperCase();
  return m === 'UPI' || m === 'ONLINE' ? 'UPI' : 'CASH';
};

const stripGrouping = (input: string): string =>
  input
    // Indian grouping: 1,00,000 / 12,50,000
    .replace(/(^|[^\d,])(\d{1,2}),(\d{2}),(\d{3})(?![\d])/g, '$1$2$3$4')
    // Western grouping for amounts under 1 lakh: 1,500 / 12,000
    .replace(/(^|[^\d,])(\d{1,2}),(\d{3})(?![\d])/g, '$1$2$3');

export const parseAmount = (raw: unknown, defaultMode: unknown = 'CASH'): ParsedAmount => {
  const fallbackMode = normalizePaymentMode(defaultMode);
  const parts: AmountPart[] = [];

  if (typeof raw === 'number') {
    if (Number.isFinite(raw) && raw > 0) parts.push({ amount: round2(raw), mode: fallbackMode });
  } else if (typeof raw === 'string' && raw.trim()) {
    const text = stripGrouping(raw.toLowerCase().replace(/₹|\brs\.?|\binr\b/g, ' '));
    for (const match of text.matchAll(TOKEN_RE)) {
      const digits = match[1].split('.')[0];
      if (digits.length > MAX_AMOUNT_DIGITS) continue;
      const amount = Number(match[1]);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const suffix = (match[2] || '').toLowerCase();
      const mode: PaymentMode = UPI_SUFFIXES.has(suffix)
        ? 'UPI'
        : CASH_SUFFIXES.has(suffix)
          ? 'CASH'
          : fallbackMode;
      parts.push({ amount: round2(amount), mode });
    }
  }

  const cash = round2(parts.filter(p => p.mode === 'CASH').reduce((s, p) => s + p.amount, 0));
  const upi = round2(parts.filter(p => p.mode === 'UPI').reduce((s, p) => s + p.amount, 0));
  const mode =
    parts.length === 0 ? 'NONE' : cash > 0 && upi > 0 ? 'MIXED' : upi > 0 ? 'UPI' : 'CASH';

  return { total: round2(cash + upi), cash, upi, parts, mode };
};

/** Human-readable breakdown, e.g. "₹200 (UPI ₹100 + Cash ₹100)". */
export const describeAmount = (parsed: ParsedAmount): string => {
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (parsed.mode !== 'MIXED') return fmt(parsed.total);
  return `${fmt(parsed.total)} (UPI ${fmt(parsed.upi)} + Cash ${fmt(parsed.cash)})`;
};

/**
 * Amount fields to store on a booking. `amountRaw` keeps exactly what staff
 * typed; the numeric fields are what revenue is computed from.
 */
export const amountFields = (raw: unknown, defaultMode: unknown) => {
  const parsed = parseAmount(raw, defaultMode);
  return {
    amountRaw: typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw),
    totalAmount: parsed.total,
    payments: { cash: parsed.cash, upi: parsed.upi },
    paymentMode: parsed.mode === 'NONE' ? normalizePaymentMode(defaultMode) : parsed.mode,
  };
};
