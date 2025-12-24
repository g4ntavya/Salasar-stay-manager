import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, getDocFromCache } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserProfile } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const elevateIfSarita = (user: User | null, profile: UserProfile | null): UserProfile | null => {
  const name = (profile?.full_name || user?.displayName || '').trim().toLowerCase();
  const email = (profile?.email || user?.email || '').trim().toLowerCase();
  const isSarita =
    name === 'sarita rohilla' ||
    email === 'sarita rohilla' ||
    email === 'sarita@salasar.com' ||
    email === 'sarita.rohilla@salasar.com';
  if (isSarita) {
    return {
      id: profile?.id || user?.uid || 'sarita-admin',
      full_name: 'Sarita Rohilla',
      role: 'ADMIN',
      email: profile?.email || user?.email || 'sarita@salasar.com',
    };
  }
  return profile;
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  // demoSignIn allows devs to use the app without Firebase credentials (dev only)
  demoSignIn?: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (uid: string) => {
    // First try cached profile to avoid blocking when offline
    try {
      const cached = await AsyncStorage.getItem('userProfile');
      if (cached) {
        setProfile(JSON.parse(cached));
      }
    } catch {
      // ignore cache errors
    }

    // Try cache from Firestore, then network; don't block forever
    try {
      const cachedDoc = await getDocFromCache(doc(db, 'profiles', uid));
      if (cachedDoc.exists()) {
        let profileData = cachedDoc.data() as UserProfile;
        profileData = elevateIfSarita(auth.currentUser, profileData) || profileData;
        setProfile(profileData);
        await AsyncStorage.setItem('userProfile', JSON.stringify(profileData));
        return;
      }
    } catch {
      // cache miss or offline; continue to network attempt
    }

    try {
      const profileDoc = await getDoc(doc(db, 'profiles', uid));
      if (profileDoc.exists()) {
        let profileData = profileDoc.data() as UserProfile;
        profileData = elevateIfSarita(auth.currentUser, profileData) || profileData;
        setProfile(profileData);
        await AsyncStorage.setItem('userProfile', JSON.stringify(profileData));
      } else {
        console.error('No profile found for user:', uid);
        setProfile(null);
      }
    } catch (error) {
      // Permission denied / offline: fall back to cached or minimal profile so app keeps working
      // This is expected if Firestore rules restrict profile access or if offline
      console.log('Using fallback profile (Firestore unavailable)');
      setProfile((prev) => {
        if (prev) return prev;
        const fallback: UserProfile = {
          id: uid,
          full_name: auth.currentUser?.displayName || auth.currentUser?.email || 'User',
          email: auth.currentUser?.email || 'N/A',
          role: 'STAFF',
        };
        return elevateIfSarita(auth.currentUser, fallback) || fallback;
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid);
        // fallback: if no profile or needs elevation
        setProfile((prev) => elevateIfSarita(firebaseUser, prev) || prev);
      } else {
        setProfile(null);
        await AsyncStorage.removeItem('userProfile');
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await fetchUserProfile(userCredential.user.uid);
    } catch (error: any) {
      // Improve diagnostics for common Firebase configuration errors
      if (error && error.code === 'auth/configuration-not-found') {
        console.error(
          'Sign in error: Firebase configuration not found. Please verify your Firebase Web API key and project configuration (EXPO_PUBLIC_FIREBASE_* in frontend/.env or src/firebase/config.ts).',
          error
        );
        throw new Error(
          'Firebase configuration not found (auth/configuration-not-found). Check your Web API key and Firebase project settings.'
        );
      }

      console.error('Sign in error:', error);
      throw new Error(error.message || 'Failed to sign in');
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
      await AsyncStorage.removeItem('userProfile');
    } catch (error: any) {
      console.error('Sign out error:', error);
      throw new Error(error.message || 'Failed to sign out');
    }
  };

  // Development helper: create a fake user/profile without contacting Firebase
  const demoSignIn = async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('demoSignIn is only available in development');
    }
    const fakeUser = {
      uid: 'demo-uid',
      email: 'admin@salasar.com',
      displayName: 'Demo Admin',
    } as unknown as User;

    const fakeProfile: UserProfile = {
      id: 'demo-uid',
      full_name: 'Demo Admin',
      role: 'ADMIN',
      email: 'admin@salasar.com',
    };

    setUser(fakeUser);
    setProfile(fakeProfile);
    await AsyncStorage.setItem('userProfile', JSON.stringify(fakeProfile));
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, demoSignIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
