// On-disk guest archive, readable without any app:
//
// data/
//   photos/{customerId}/{index}.jpg               photos as uploaded (served to the app)
//   guests/{YYYY}/{YYYY-MM}/{YYYY-MM-DD} {Name} {Mobile} [{customerId}]/
//       details.txt     everything about the guest, human readable
//       details.json    the same, machine readable
//       id-photo-1.jpg  hard links to the photos (no extra disk space)
//   guests.csv          one row per guest, opens in Excel / Google Sheets
//   state.json          sync progress + folder index
//
// Guests deleted in the app are kept here and marked as deleted.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const dir = (...parts) => path.join(config.dataDir, ...parts);
export const PHOTOS_DIR = dir('photos');
export const GUESTS_DIR = dir('guests');
const STATE_FILE = dir('state.json');
const CSV_FILE = dir('guests.csv');

fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(GUESTS_DIR, { recursive: true });

const writeAtomic = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
};

/* ---------------- state ---------------- */

export const state = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : { customersSyncedTo: 0, bookingsSyncedTo: 0, indexSyncedTo: 0, folders: {} };

export const saveState = () => writeAtomic(STATE_FILE, JSON.stringify(state, null, 2));

// In-memory view of every archived guest: customerId → { customer, bookings: {id: booking}, deletedAt }
export const guests = new Map();
for (const [id, rel] of Object.entries(state.folders)) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(GUESTS_DIR, rel, 'details.json'), 'utf8'));
    guests.set(id, { customer: saved.customer || {}, bookings: saved.bookingsById || {}, deletedAt: saved.deletedInAppAt || null });
  } catch {
    delete state.folders[id];
  }
}

/* ---------------- helpers ---------------- */

const localDay = value => {
  const d = new Date(typeof value === 'number' ? value : value || NaN);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDay = day => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtDateTime = value => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const safeName = s => String(s || '').replace(/[^\p{L}\p{N} .-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

const stays = g => {
  const byStay = new Map();
  for (const b of Object.values(g.bookings).filter(b => g.deletedAt || !b.removedAt)) {
    const key = b.stayId || `${b.customerId}_${b.checkInDay}`;
    if (!byStay.has(key)) byStay.set(key, []);
    byStay.get(key).push(b);
  }
  return Array.from(byStay.values())
    .map(list => {
      const first = list[0];
      const withAmount = list.find(b => b.revenueCounted) || list.find(b => b.totalAmount > 0) || first;
      const status = list.some(b => b.status === 'BOOKED' || b.status === 'CONFIRMED') ? 'Staying / booked' : list.every(b => b.status === 'CANCELLED') ? 'Cancelled' : 'Checked out';
      return {
        rooms: Array.from(new Set(list.map(b => b.roomNo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
        checkInDay: first.checkInDay || localDay(first.checkInDate),
        checkOutDay: first.checkOutDay || localDay(first.checkOutDate),
        checkedOutAt: list.find(b => b.check_out_actual)?.check_out_actual || '',
        status,
        amountRaw: withAmount.amountRaw ?? '',
        total: Number(withAmount.totalAmount) || 0,
        cash: Number(withAmount.payments?.cash) || 0,
        upi: Number(withAmount.payments?.upi) || 0,
        tokenAmount: Number(first.tokenAmount) || 0,
      };
    })
    .sort((a, b) => b.checkInDay.localeCompare(a.checkInDay));
};

export const photoFiles = id => {
  const p = path.join(PHOTOS_DIR, id);
  return fs.existsSync(p) ? fs.readdirSync(p).filter(f => /^\d+\.jpg$/.test(f)).sort() : [];
};

export const guestSummary = (id, g = guests.get(id)) => {
  const c = g?.customer || {};
  const [latest] = stays(g || { bookings: {} });
  return {
    id,
    name: c.name || 'Guest',
    mobile: c.mobile || '',
    checkInDay: latest?.checkInDay || localDay(c.checkInDate || c.createdAt),
    rooms: latest?.rooms || [],
    total: latest?.total || 0,
    status: latest?.status || '',
    photos: photoFiles(id).length,
    deleted: !!g?.deletedAt,
    folder: state.folders[id] || '',
  };
};

/* ---------------- writing a guest folder ---------------- */

const folderFor = (id, g) => {
  const c = g.customer;
  const day = stays(g)[0]?.checkInDay || localDay(c.checkInDate || c.createdAt) || 'undated';
  const label = [day, safeName(c.name) || 'Guest', safeName(c.mobile)].filter(Boolean).join(' ');
  return path.join(day.slice(0, 4), day.slice(0, 7), `${label} [${id}]`);
};

const detailsText = (id, g) => {
  const c = g.customer;
  const lines = [
    `Guest:           ${c.name || 'Guest'}`,
    `Father's name:   ${c.father_name || '-'}`,
    `Mobile:          ${c.mobile || '-'}`,
    `Address:         ${[c.address, c.city].filter(Boolean).join(', ') || '-'}`,
    `Members:         ${c.membersCount || '-'}`,
    `Vehicle:         ${c.vehicleNumber || '-'}`,
    `ID proof:        ${c.id_type || 'Aadhaar'} ${c.id_number || ''}`.trimEnd(),
    `Purpose:         ${c.purpose || '-'}`,
    '',
    'Stays:',
  ];
  const list = stays(g);
  if (list.length === 0) lines.push('  (no booking recorded)');
  for (const s of list) {
    lines.push(
      `  Room${s.rooms.length > 1 ? 's' : ''} ${s.rooms.join(', ') || '-'}  ·  ${fmtDay(s.checkInDay)} → ${fmtDay(s.checkOutDay)}  ·  ${s.status}`,
      `    Amount entered: ${s.amountRaw || '-'}  =  ${rupees(s.total)} (Cash ${rupees(s.cash)}, UPI ${rupees(s.upi)})${s.tokenAmount ? `  ·  Token ${rupees(s.tokenAmount)}` : ''}`
    );
    if (s.checkedOutAt) lines.push(`    Checked out: ${fmtDateTime(s.checkedOutAt)}`);
  }
  lines.push('', `ID photos:       ${photoFiles(id).length}`, `Record created:  ${fmtDateTime(c.createdAt)}`, `Last updated:    ${fmtDateTime(c.updatedAt)}`, `Guest ID:        ${id}`);
  if (g.deletedAt) lines.push('', `*** Deleted in the app on ${fmtDateTime(g.deletedAt)} (kept here as an archive) ***`);
  return lines.join('\n') + '\n';
};

const linkPhotosInto = (id, folder) => {
  const target = path.join(GUESTS_DIR, folder);
  for (const f of fs.readdirSync(target).filter(f => f.startsWith('id-photo-'))) fs.rmSync(path.join(target, f));
  photoFiles(id).forEach((file, i) => {
    const src = path.join(PHOTOS_DIR, id, file);
    const dest = path.join(target, `id-photo-${i + 1}.jpg`);
    try {
      fs.linkSync(src, dest);
    } catch {
      fs.copyFileSync(src, dest);
    }
  });
};

/** (Re)writes one guest's folder, renaming it if the name/mobile/date changed. */
export const writeGuest = id => {
  const g = guests.get(id);
  if (!g) return;
  const desired = folderFor(id, g);
  const current = state.folders[id];
  if (current && current !== desired && fs.existsSync(path.join(GUESTS_DIR, current))) {
    fs.mkdirSync(path.dirname(path.join(GUESTS_DIR, desired)), { recursive: true });
    fs.renameSync(path.join(GUESTS_DIR, current), path.join(GUESTS_DIR, desired));
  }
  state.folders[id] = desired;
  const folder = path.join(GUESTS_DIR, desired);
  fs.mkdirSync(folder, { recursive: true });
  writeAtomic(path.join(folder, 'details.txt'), detailsText(id, g));
  writeAtomic(
    path.join(folder, 'details.json'),
    JSON.stringify({ customer: g.customer, stays: stays(g), bookingsById: g.bookings, deletedInAppAt: g.deletedAt, photos: photoFiles(id) }, null, 2)
  );
  linkPhotosInto(id, desired);
};

/** Called after a photo upload so the guest folder shows it immediately. */
export const refreshPhotos = id => {
  if (state.folders[id] && fs.existsSync(path.join(GUESTS_DIR, state.folders[id]))) linkPhotosInto(id, state.folders[id]);
};

/* ---------------- CSV of all guests ---------------- */

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const writeCsv = () => {
  const header = ['Check-in', 'Guest', 'Mobile', "Father's name", 'Address', 'Members', 'Vehicle', 'ID type', 'ID number', 'Rooms', 'Check-out', 'Status', 'Amount entered', 'Total', 'Cash', 'UPI', 'Photos', 'Deleted in app', 'Folder', 'Guest ID'];
  const rows = Array.from(guests.entries())
    .map(([id, g]) => {
      const c = g.customer;
      const [s] = stays(g);
      return {
        sort: s?.checkInDay || localDay(c.createdAt),
        cells: [s?.checkInDay || localDay(c.checkInDate || c.createdAt), c.name, c.mobile, c.father_name, [c.address, c.city].filter(Boolean).join(', '), c.membersCount, c.vehicleNumber, c.id_type, c.id_number, s?.rooms.join(' ') || '', s?.checkOutDay || '', s?.status || '', s?.amountRaw || c.amount || '', s?.total ?? '', s?.cash ?? '', s?.upi ?? '', photoFiles(id).length, g.deletedAt ? 'yes' : '', state.folders[id] || '', id],
      };
    })
    .sort((a, b) => b.sort.localeCompare(a.sort));
  // BOM so Excel opens the ₹ sign and Hindi names correctly.
  writeAtomic(CSV_FILE, '﻿' + [header, ...rows.map(r => r.cells)].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
};

export const CSV_PATH = CSV_FILE;
