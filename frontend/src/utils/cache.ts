import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// 3 weeks in milliseconds
const CACHE_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

// ========== IN-MEMORY CACHE LAYER ==========
// Provides SYNCHRONOUS access for instant screen loads
const memoryCache = new Map<string, any>();

/**
 * Get data synchronously from memory cache (instant, no await needed)
 * Use this for UI that needs immediate data (like detail screens)
 */
export const getCachedSync = <T>(key: string): T | null => {
  return memoryCache.get(key) ?? null;
};

/**
 * Get a single item from a cached list by ID (synchronous)
 * Perfect for detail screens - instant lookup from bookings:list or customers:list
 */
export const getCachedItemSync = <T>(listKey: string, id: string): T | null => {
  const list = memoryCache.get(listKey);
  if (!Array.isArray(list)) return null;
  return list.find((item: any) => item.id === id) ?? null;
};

/**
 * Async function that populates memory cache from AsyncStorage
 * Should be called on component mount if memory cache is empty
 */
export const hydrateMemoryCache = async (key: string): Promise<void> => {
  if (memoryCache.has(key)) return; // Already hydrated
  const data = await getCached(key);
  if (data !== null) {
    memoryCache.set(key, data);
  }
};

// ========== ASYNC STORAGE CACHE ==========

export const getCached = async <T>(key: string): Promise<T | null> => {
  // Check memory cache first (instant)
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }

  try {
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return null;
    }

    let entry: any;
    try {
      entry = JSON.parse(raw);
    } catch (parseErr) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    // Handle old format (no timestamp) - treat as valid but will be updated on next set
    if (!entry.timestamp && !entry.data) {
      memoryCache.set(key, entry); // Cache in memory for instant access
      return entry as T;
    }

    // New format with timestamp
    if (entry.timestamp) {
      const age = Date.now() - entry.timestamp;

      if (age > CACHE_EXPIRY_MS) {
        await AsyncStorage.removeItem(key);
        return null;
      }
      memoryCache.set(key, entry.data); // Cache in memory for instant access
      return entry.data as T;
    }

    // Fallback: treat entry as the data itself
    memoryCache.set(key, entry); // Cache in memory for instant access
    return entry as T;
  } catch (err) {
    console.error(`[Cache] Error reading cache for ${key}:`, err);
    return null;
  }
};

export const setCached = async (key: string, value: any): Promise<boolean> => {
  try {
    if (value === null || value === undefined) {
      memoryCache.delete(key);
      await AsyncStorage.removeItem(key);
      return true;
    }

    // Update memory cache FIRST for instant access
    memoryCache.set(key, value);

    // CRITICAL: Aggressively strip images before saving to AsyncStorage
    let valueToPersist = value;
    const stripImages = (obj: any, depth = 0): any => {
      if (depth > 5) return obj; // Prevent deep recursion
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => stripImages(item, depth + 1));

      const cleaned = { ...obj };
      const imageFields = [
        'idImageUrl', 'id_image_url', 'aadhaar_front', 'aadhaar_back',
        'pan_front', 'pan_back', 'photo', 'imageUrl', 'profileImage'
      ];

      // 1. Explicit field cleanup
      imageFields.forEach(k => {
        const val = cleaned[k];
        if (typeof val === 'string') {
          if (val.startsWith('data:') || (val.length > 3000 && !val.startsWith('http') && !val.startsWith('file:'))) {
            cleaned[k] = '';
          }
        }
      });

      // 2. 🔥 ULTRA-AGGRESSIVE: Scan ALL fields for ghost Base64 strings
      Object.keys(cleaned).forEach(k => {
        const val = cleaned[k];
        if (typeof val === 'string' && val.length > 5000 && !val.startsWith('http') && !val.startsWith('file:')) {
          console.log(`[Cache] Stripping massive ghost field: ${k} (${val.length} chars)`);
          cleaned[k] = '';
        }
      });

      if (Array.isArray(cleaned.idImageUrls)) {
        cleaned.idImageUrls = cleaned.idImageUrls.map((url: any) => {
          if (typeof url === 'string') {
            if (url.startsWith('data:') || (url.length > 3000 && !url.startsWith('http') && !url.startsWith('file:'))) {
              return '';
            }
          }
          return url;
        }).filter(Boolean);
      }
      return cleaned;
    };

    valueToPersist = stripImages(value);

    const entry: CacheEntry<any> = {
      data: valueToPersist,
      timestamp: Date.now(),
    };

    const serialized = JSON.stringify(entry);

    // Limit persistent entry size to 250KB
    if (serialized.length > 250_000) {
      console.warn(`[Cache] Entry "${key}" too heavy (${Math.round(serialized.length / 1024)}KB), using memory-only caching`);
      return true;
    }

    try {
      await AsyncStorage.setItem(key, serialized);
    } catch (setErr: any) {
      if (setErr.message?.includes('full') || setErr.message?.includes('SQLITE_FULL') || setErr.message?.includes('quota')) {
        console.warn(`[Cache] AsyncStorage FULL. Performing emergency purge...`);
        const keys = await AsyncStorage.getAllKeys();
        // Delete all list caches which are easily refetchable
        const lowPriority = keys.filter(k => k.includes(':list') || k.includes(':recent'));
        for (const k of lowPriority) {
          await AsyncStorage.removeItem(k).catch(() => { });
          memoryCache.delete(k);
        }
        // Retry
        await AsyncStorage.setItem(key, serialized).catch(() => {
          console.error(`[Cache] Still full after purge. Persistent storage failed for: ${key}`);
        });
      } else {
        throw setErr;
      }
    }

    return true;
  } catch (err: any) {
    console.warn(`[Cache] Persist error for ${key}:`, err.message);
    return false;
  }
};

export const clearCache = async (key: string): Promise<boolean> => {
  try {
    memoryCache.delete(key); // Also clear from memory
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error(`[Cache] Error clearing cache for ${key}:`, err);
    return false;
  }
};

/**
 * Removes all locally stored app data (memory and disk) except the keys given,
 * e.g. on sign-out so guest data does not stay on the device.
 */
export const clearAllCache = async (keep: string[] = []): Promise<void> => {
  memoryCache.clear();
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k: string) => !keep.includes(k)));
};

// Clear all expired cache entries (can be called on app start)
export const clearExpiredCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k: string) =>
      k.startsWith('bookings:') ||
      k.startsWith('customers:') ||
      k.startsWith('rooms:') ||
      k.startsWith('dashboard:')
    );

    for (const key of cacheKeys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      try {
        const entry = JSON.parse(raw);
        if (entry.timestamp) {
          const age = Date.now() - entry.timestamp;
          if (age > CACHE_EXPIRY_MS) {
            await AsyncStorage.removeItem(key);
          }
        }
      } catch {
        await AsyncStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.error('[Cache] Error clearing expired cache:', err);
  }
};

// Diagnostic function to test if AsyncStorage is working
export const testCacheStorage = async (): Promise<boolean> => {
  const testKey = '__cache_test__';
  const testValue = { test: true, timestamp: Date.now() };

  try {
    console.log('[Cache] === STORAGE DIAGNOSTIC TEST ===');

    // Test write
    console.log('[Cache] Testing write...');
    await AsyncStorage.setItem(testKey, JSON.stringify(testValue));

    // Test read
    console.log('[Cache] Testing read...');
    const result = await AsyncStorage.getItem(testKey);

    if (!result) {
      console.error('[Cache] ❌ FAILED: Could not read back written data!');
      return false;
    }

    // Test parse
    const parsed = JSON.parse(result);
    if (parsed.test !== true) {
      console.error('[Cache] ❌ FAILED: Data corruption detected!');
      return false;
    }

    // Test delete
    console.log('[Cache] Testing delete...');
    await AsyncStorage.removeItem(testKey);
    const deleted = await AsyncStorage.getItem(testKey);

    if (deleted !== null) {
      console.error('[Cache] ❌ FAILED: Could not delete data!');
      return false;
    }

    console.log('[Cache] ✅ SUCCESS: AsyncStorage is working correctly!');

    // List all cache keys
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(k =>
      k.startsWith('bookings:') ||
      k.startsWith('customers:') ||
      k.startsWith('rooms:') ||
      k.startsWith('dashboard:')
    );
    console.log(`[Cache] Found ${cacheKeys.length} existing cache entries:`, cacheKeys);

    return true;
  } catch (err) {
    console.error('[Cache] ❌ CRITICAL ERROR during storage test:', err);
    return false;
  }
};

// On sign-in: drop any oversized cache entries and warm the guest search index.
// Bookings, guests and rooms stream in through their live listeners, so they need no prefetch.
export const preBuildCache = async (): Promise<void> => {
  try {
    const startTime = Date.now();
    const keys = await AsyncStorage.getAllKeys();
    for (const k of keys) {
      const size = (await AsyncStorage.getItem(k))?.length || 0;
      if (size > 5_000_000) {
        console.warn(`[Cache] Purging oversized entry: ${k} (${Math.round(size / 1024)}KB)`);
        await AsyncStorage.removeItem(k);
        memoryCache.delete(k);
      }
    }

    const { syncCustomerIndex } = await import('./rtdbService');
    // Only downloads guests changed since the last sync.
    await syncCustomerIndex().catch(() => {});

    console.log(`[Cache] Light pre-build complete in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.warn('[Cache] Pre-build skipped or failed (offline?):', err);
  }
};