import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { ref, get, goOffline, goOnline } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, rtdb } from '../firebase/firebase';
import { UserProfile, UserRole } from '../types';
import { preBuildCache, clearAllCache } from '../utils/cache';
import { UPLOAD_QUEUE_STORAGE_KEY } from '../utils/uploadQueue';

// Access is granted by an entry at users/{uid} with a role, created by
// scripts/firebase/set-user.js. Signing in without one is rejected.
const PROFILE_KEY = 'userProfile';
const ROLES: UserRole[] = ['ADMIN', 'STAFF', 'GROWTH'];

export const homeRouteFor = (role?: string) => (role === 'GROWTH' ? '/analytics' : '/dashboard');

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  /** True until Firebase has restored (or ruled out) the saved session. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

class NotAuthorizedError extends Error {}

const signInErrorMessage = (error: any): string => {
  if (error instanceof NotAuthorizedError) return error.message;
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No internet connection. Please check your network and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the administrator.';
    default:
      return error?.message || 'Failed to sign in.';
  }
};

/** Loads users/{uid}. Returns null when the account has no role (not authorized). */
const loadProfile = async (user: User): Promise<UserProfile | null> => {
  const snap = await get(ref(rtdb, `users/${user.uid}`));
  const data = snap.val();
  if (!data || !ROLES.includes(data.role)) return null;
  return {
    id: user.uid,
    full_name: data.name || user.displayName || user.email || 'User',
    email: data.email || user.email || '',
    role: data.role,
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const signingIn = useRef(false);

  const clearSession = async () => {
    setUser(null);
    setProfile(null);
    // Guest data must not stay on a device after its user signs out. Photos still
    // waiting to upload are kept; they resume when an authorized user signs in.
    await clearAllCache([UPLOAD_QUEUE_STORAGE_KEY, 'lastSeenVersion']).catch(() => {});
  };

  useEffect(() => {
    // Firebase restores the persisted session from AsyncStorage locally, so this
    // fires quickly even offline.
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      if (signingIn.current) return; // signIn() handles the profile itself.

      setUser(firebaseUser);
      // Show the cached profile immediately; refresh it from the database in the background.
      const cached = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
      const cachedProfile: UserProfile | null = cached ? JSON.parse(cached) : null;
      if (cachedProfile?.id === firebaseUser.uid) {
        setProfile(cachedProfile);
        setLoading(false);
      }

      try {
        const fresh = await loadProfile(firebaseUser);
        if (!fresh) {
          // Role was removed: sign this device out.
          await firebaseSignOut(auth);
          await clearSession();
        } else {
          setProfile(fresh);
          await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(fresh));
          if (fresh.role !== 'GROWTH') preBuildCache().catch(() => {});
        }
      } catch (e) {
        // Offline: keep the cached profile if there is one.
        console.warn('[Auth] Could not refresh profile:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<UserProfile> => {
    signingIn.current = true;
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const fresh = await loadProfile(credential.user);
      if (!fresh) {
        await firebaseSignOut(auth);
        throw new NotAuthorizedError(
          'This account is not authorized to use the app. Ask the administrator to grant access.'
        );
      }
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(fresh));
      setUser(credential.user);
      setProfile(fresh);
      if (fresh.role !== 'GROWTH') preBuildCache().catch(() => {});
      return fresh;
    } catch (error: any) {
      throw new Error(signInErrorMessage(error));
    } finally {
      signingIn.current = false;
      setLoading(false);
    }
  };

  const signOut = async () => {
    // Drop live listeners cleanly before the auth token disappears.
    goOffline(rtdb);
    try {
      await firebaseSignOut(auth);
    } finally {
      goOnline(rtdb);
      await clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
