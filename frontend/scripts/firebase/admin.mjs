// Shared setup for admin scripts: loads frontend/.env, initialises firebase-admin with
// frontend/serviceAccountKey.json, and refuses to run against a project other than the
// one the app is configured for.
//
// Set FIREBASE_DATABASE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST to target local emulators.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';

// All dates in the data are Indian local days.
process.env.TZ = 'Asia/Kolkata';

export const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const loadEnvFile = file => {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
};
loadEnvFile(path.join(FRONTEND_DIR, '.env'));

const fail = message => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

export const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
export const databaseURL = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL;
if (!projectId || !databaseURL) {
  fail('EXPO_PUBLIC_FIREBASE_PROJECT_ID and EXPO_PUBLIC_FIREBASE_DATABASE_URL must be set in frontend/.env');
}

export const usingEmulator = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;

let credential;
if (usingEmulator) {
  credential = undefined;
} else {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(FRONTEND_DIR, 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    fail(
      `Service account key not found at ${keyPath}.\n` +
        '  Firebase console → Project settings → Service accounts → Generate new private key,\n' +
        '  and save it as frontend/serviceAccountKey.json (it is git-ignored).'
    );
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (key.project_id !== projectId) {
    fail(
      `serviceAccountKey.json belongs to project "${key.project_id}" but frontend/.env points to "${projectId}".\n` +
        '  Refusing to run so nothing is written to the wrong project.'
    );
  }
  credential = process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : cert(key);
}

export const app = initializeApp({ projectId, databaseURL, ...(credential ? { credential } : {}) });
export const db = getDatabase(app);
export const auth = getAuth(app);

/** Parses --flag value / --flag=value / --switch arguments. */
export const parseArgs = (argv = process.argv.slice(2)) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) args[m[1]] = m[2];
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[m[1]] = argv[++i];
    else args[m[1]] = true;
  }
  return args;
};

export const done = async code => {
  await app.delete().catch(() => {});
  process.exit(code ?? 0);
};

export { fail };
