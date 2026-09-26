// Initialized Firebase services: Auth + Realtime Database only.
// Config comes from EXPO_PUBLIC_FIREBASE_* (frontend/.env locally, EAS env vars in builds).
// There are deliberately no hard-coded fallbacks: a build without config must fail loudly
// rather than silently talk to some other Firebase project.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// getReactNativePersistence exists at runtime in firebase/auth's React Native build,
// but is missing from the TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('firebase/auth');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) {
  throw new Error(
    `Firebase config missing: ${missing.join(', ')}. ` +
      'Set EXPO_PUBLIC_FIREBASE_* in frontend/.env (local) or as EAS environment variables (builds).'
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth =
    Platform.OS === 'web'
      ? getAuth(app)
      : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  // initializeAuth throws if already initialized (fast refresh).
  auth = getAuth(app);
}

const rtdb = getDatabase(app);

export { app, auth, rtdb };
