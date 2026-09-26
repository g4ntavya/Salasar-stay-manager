// Publishes database.rules.json (security rules + indexes) to the Realtime Database.
//
//   npm run firebase:rules

import fs from 'node:fs';
import path from 'node:path';
import { app, databaseURL, usingEmulator, FRONTEND_DIR, fail, done } from './admin.mjs';

const rules = fs.readFileSync(path.join(FRONTEND_DIR, 'database.rules.json'), 'utf8');
JSON.parse(rules); // fail fast on invalid JSON

let url;
let headers = { 'Content-Type': 'application/json' };
if (usingEmulator) {
  const ns = new URL(databaseURL).hostname.split('.')[0];
  url = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${ns}`;
  headers.Authorization = 'Bearer owner';
} else {
  const { access_token } = await app.options.credential.getAccessToken();
  url = `${databaseURL.replace(/\/+$/, '')}/.settings/rules.json`;
  headers.Authorization = `Bearer ${access_token}`;
}

const res = await fetch(url, { method: 'PUT', headers, body: rules });
if (!res.ok) fail(`Rules deploy failed (${res.status}): ${await res.text()}`);
console.log(`✔ Security rules and indexes published to ${usingEmulator ? 'the emulator' : databaseURL}`);
await done();
