// Expo-friendly wrapper that exports initialized Firebase services from `config`.
// Use: import { auth, db, storage } from '@/lib/firebase';

import { app, auth, db, storage, analytics, rtdb } from './config';

export { app, auth, db, storage, analytics, rtdb };
