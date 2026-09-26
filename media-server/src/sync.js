// Mirrors guests and their bookings from Firebase into the on-disk archive.
// Listens only to records updated since the last sync (indexed on updatedAt), so after
// the first run it downloads just the changes.

import { db } from './firebase.js';
import { guests, state, saveState, writeGuest, writeCsv } from './archive.js';

const pending = new Set();
let flushTimer = null;

const scheduleFlush = id => {
  if (id) pending.add(id);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = Array.from(pending);
    pending.clear();
    for (const guestId of ids) {
      try {
        writeGuest(guestId);
      } catch (e) {
        console.error(`[sync] Could not write guest ${guestId}:`, e.message);
      }
    }
    try {
      writeCsv();
      saveState();
    } catch (e) {
      console.error('[sync] Could not write CSV/state:', e.message);
    }
    console.log(`[sync] Archived ${ids.length} guest(s)`);
  }, 2000);
};

const entry = id => {
  if (!guests.has(id)) guests.set(id, { customer: {}, bookings: {}, deletedAt: null });
  return guests.get(id);
};

// Rewind a little so writes that landed while we were offline are never missed.
const since = ts => Math.max(0, (ts || 0) - 60_000);

export const startSync = () => {
  const customers = db.ref('customers').orderByChild('updatedAt').startAt(since(state.customersSyncedTo));
  const onCustomer = snap => {
    const c = snap.val();
    if (!c) return;
    entry(snap.key).customer = { ...c, id: snap.key };
    state.customersSyncedTo = Math.max(state.customersSyncedTo, Number(c.updatedAt) || 0);
    scheduleFlush(snap.key);
  };
  customers.on('child_added', onCustomer);
  customers.on('child_changed', onCustomer);

  const bookings = db.ref('bookings').orderByChild('updatedAt').startAt(since(state.bookingsSyncedTo));
  const onBooking = snap => {
    const b = snap.val();
    if (!b?.customerId) return;
    entry(b.customerId).bookings[snap.key] = { ...b, id: snap.key };
    state.bookingsSyncedTo = Math.max(state.bookingsSyncedTo, Number(b.updatedAt) || 0);
    scheduleFlush(b.customerId);
  };
  bookings.on('child_added', onBooking);
  bookings.on('child_changed', onBooking);
  // Removed bookings are marked, not erased: if the whole guest was deleted they stay
  // in the archive; otherwise (e.g. a room removed from a stay) they are hidden.
  bookings.on('child_removed', snap => {
    const b = snap.val();
    const g = b?.customerId && guests.get(b.customerId);
    if (!g?.bookings[snap.key]) return;
    g.bookings[snap.key].removedAt = Date.now();
    scheduleFlush(b.customerId);
  });

  // Deletions show up as tombstones in customerIndex.
  const index = db.ref('customerIndex').orderByChild('u').startAt(since(state.indexSyncedTo));
  const onIndex = snap => {
    const e = snap.val();
    state.indexSyncedTo = Math.max(state.indexSyncedTo, Number(e?.u) || 0);
    if (!e?.deleted || !guests.has(snap.key)) return;
    const g = guests.get(snap.key);
    if (!g.deletedAt) {
      g.deletedAt = e.u;
      scheduleFlush(snap.key);
    }
  };
  index.on('child_added', onIndex);
  index.on('child_changed', onIndex);

  console.log('[sync] Listening for guest and booking changes');
};
