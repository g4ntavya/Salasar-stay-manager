import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Custom React Native persistence for Firebase Auth
 * This implements the Firebase Persistence interface exactly as Firebase expects
 * Works in both Expo Go and production APK builds
 */
class ReactNativePersistenceImpl {
  static type = 'LOCAL';
  readonly type = 'LOCAL';

  async _isAvailable(): Promise<boolean> {
    try {
      const TEST_KEY = '@firebase_persistence_test';
      await AsyncStorage.setItem(TEST_KEY, 'test');
      await AsyncStorage.removeItem(TEST_KEY);
      return true;
    } catch {
      return false;
    }
  }

  async _set(key: string, value: any): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }

  async _get<T = any>(key: string): Promise<T | null> {
    const item = await AsyncStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  }

  async _remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}

/**
 * Factory function that mimics getReactNativePersistence from firebase/auth
 * Returns an instance of the persistence class
 */
export function getReactNativePersistence(storage: typeof AsyncStorage) {
  return ReactNativePersistenceImpl;
}
