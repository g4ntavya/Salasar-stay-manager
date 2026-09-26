// Creates any missing rooms/{roomNo} entries from src/utils/defaultRooms.ts.
// Existing rooms (and their occupancy) are never changed.
//
//   npm run firebase:rooms

import fs from 'node:fs';
import path from 'node:path';
import { db, done, FRONTEND_DIR } from './admin.mjs';

// Read the app's room list (uncommented `{ room_no: ..., beds: ..., type: ..., ac_make: ... }` lines).
const source = fs.readFileSync(path.join(FRONTEND_DIR, 'src/utils/defaultRooms.ts'), 'utf8');
const defaultRoomSeeds = source
  .split('\n')
  .filter(line => !line.trim().startsWith('//'))
  .map(line => line.match(/room_no:\s*'([^']+)',\s*beds:\s*(\d+),\s*type:\s*'([^']*)',\s*ac_make:\s*'([^']*)'/))
  .filter(Boolean)
  .map(([, room_number, beds, type, ac_make]) => ({ room_number, capacity: Number(beds), type, ac_make }));

const existing = (await db.ref('rooms').get()).val() || {};
const updates = {};
for (const seed of defaultRoomSeeds) {
  const roomNo = seed.room_number.replace(/\./g, '_');
  if (existing[roomNo]) continue;
  updates[roomNo] = {
    room_no: roomNo,
    beds: seed.capacity,
    type: seed.type,
    ...(seed.ac_make ? { ac_make: seed.ac_make } : {}),
    cleaned_status: 'CLEANED',
    is_available: true,
    status: 'AVAILABLE',
    updatedAt: Date.now(),
  };
}

if (Object.keys(updates).length) await db.ref('rooms').update(updates);
console.log(`✔ ${Object.keys(updates).length} room(s) added, ${Object.keys(existing).length} already existed (${defaultRoomSeeds.length} in the room list).`);
await done();
