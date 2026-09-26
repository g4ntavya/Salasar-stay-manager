// firebase-admin: verifies app login tokens and reads guest data for the archive.
// Credentials: GOOGLE_APPLICATION_CREDENTIALS points at the project's service-account JSON.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { config } from './config.js';

const usingEmulator = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;

const app = initializeApp({
  projectId: config.firebase.projectId,
  databaseURL: config.firebase.databaseURL,
  ...(usingEmulator ? {} : { credential: applicationDefault() }),
});

export const auth = getAuth(app);
export const db = getDatabase(app);

// Role lookups are cached briefly so every photo request doesn't hit the database,
// while a revoked role still takes effect within a minute.
const ROLE_TTL_MS = 60_000;
const roleCache = new Map();

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Verifies `Authorization: Bearer <Firebase ID token>` and returns { uid, email, role }. */
export const authenticate = async (req, allowedRoles) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required');
  let decoded;
  try {
    decoded = await auth.verifyIdToken(header.slice(7));
  } catch {
    throw new HttpError(401, 'Login expired or invalid. Sign in again.');
  }

  let cached = roleCache.get(decoded.uid);
  if (!cached || cached.expires < Date.now()) {
    const role = (await db.ref(`users/${decoded.uid}/role`).get()).val();
    cached = { role, expires: Date.now() + ROLE_TTL_MS };
    roleCache.set(decoded.uid, cached);
  }
  if (!allowedRoles.includes(cached.role)) throw new HttpError(403, 'This account is not allowed to do that');
  return { uid: decoded.uid, email: decoded.email, role: cached.role };
};
