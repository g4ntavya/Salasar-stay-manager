// Initialized Firebase services: Auth + Realtime Database only.
// Config comes from EXPO_PUBLIC_FIREBASE_* (frontend/.env locally, EAS env vars in builds).
// There are deliberately no hard-coded fallbacks: a build without config must fail loudly
// rather than silently talk to some other Firebase project.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
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

// Local development only: EXPO_PUBLIC_FIREBASE_EMULATOR_HOST points the app at the Firebase
// emulators (e.g. 10.0.2.2 from an Android emulator). It is never set for EAS builds.
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
if (__DEV__ && emulatorHost) {
  try {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(rtdb, emulatorHost, 9000);
  } catch {
    // Already connected (fast refresh).
  }
}

export { app, auth, rtdb };
