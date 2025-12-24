import AsyncStorage from '@react-native-async-storage/async-storage';

// 3 weeks in milliseconds
const CACHE_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

export const getCached = async <T>(key: string): Promise<T | null> => {
  try {
    console.log(`[Cache] Reading cache for key: ${key}`);
    const raw = await AsyncStorage.getItem(key);
    
    if (!raw) {
      console.log(`[Cache] No cached data found for ${key}`);
      return null;
    }
    
    console.log(`[Cache] Found cached data for ${key}, size: ${raw.length} bytes`);
    
    let entry: any;
    try {
      entry = JSON.parse(raw);
    } catch (parseErr) {
      console.warn(`[Cache] Failed to parse cache for ${key}, clearing it`, parseErr);
      await AsyncStorage.removeItem(key);
      return null;
    }
    
    // Handle old format (no timestamp) - treat as valid but will be updated on next set
    if (!entry.timestamp && !entry.data) {
      console.log(`[Cache] Using legacy format data for ${key}`);
      return entry as T;
    }
    
    // New format with timestamp
    if (entry.timestamp) {
      const age = Date.now() - entry.timestamp;
      const ageHours = Math.floor(age / (1000 * 60 * 60));
      console.log(`[Cache] Cache age for ${key}: ${ageHours} hours`);
      
      if (age > CACHE_EXPIRY_MS) {
        console.log(`[Cache] Cache expired for ${key}, removing`);
        await AsyncStorage.removeItem(key);
        return null;
      }
      console.log(`[Cache] Returning cached data for ${key}`);
      return entry.data as T;
    }
    
    // Fallback: treat entry as the data itself
    console.log(`[Cache] Using raw data format for ${key}`);
    return entry as T;
  } catch (err) {
    console.error(`[Cache] Error reading cache for ${key}:`, err);
    return null;
  }
};

export const setCached = async (key: string, value: any): Promise<boolean> => {
  try {
    if (value === null || value === undefined) {
      console.log(`[Cache] Removing cache for ${key}`);
      await AsyncStorage.removeItem(key);
      return true;
    }
    
    const entry: CacheEntry<any> = {
      data: value,
      timestamp: Date.now(),
    };
    
    const serialized = JSON.stringify(entry);
    console.log(`[Cache] Saving cache for ${key}, size: ${serialized.length} bytes`);
    
    await AsyncStorage.setItem(key, serialized);
    console.log(`[Cache] Successfully saved cache for ${key}`);
    
    // Verify the write was successful
    const verification = await AsyncStorage.getItem(key);
    if (!verification) {
      console.error(`[Cache] VERIFICATION FAILED! Data not persisted for ${key}`);
      return false;
    }
    console.log(`[Cache] Verification successful for ${key}`);
    return true;
  } catch (err) {
    console.error(`[Cache] Error saving cache for ${key}:`, err);
    console.error(`[Cache] Error details:`, JSON.stringify(err, null, 2));
    return false;
  }
};

export const clearCache = async (key: string): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error(`[Cache] Error clearing cache for ${key}:`, err);
    return false;
  }
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

// Pre-populate cache on app startup by fetching all data
export const preBuildCache = async (): Promise<void> => {
  console.log('[Cache] === STARTING CACHE PRE-BUILD ===');
  
  try {
    // Import Firebase modules dynamically to avoid circular dependencies
    const { rtdb } = await import('../firebase/firebase');
    const { ref, get } = await import('firebase/database');
    
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    
    // Fetch all data in parallel for speed
    const [bookingsSnap, customersSnap, roomsSnap] = await Promise.all([
      get(ref(rtdb, 'bookings')).catch(err => {
        console.error('[Cache] Failed to fetch bookings:', err);
        return null;
      }),
      get(ref(rtdb, 'customers')).catch(err => {
        console.error('[Cache] Failed to fetch customers:', err);
        return null;
      }),
      get(ref(rtdb, 'rooms')).catch(err => {
        console.error('[Cache] Failed to fetch rooms:', err);
        return null;
      }),
    ]);
    
    // Cache bookings with full customer data embedded
    if (bookingsSnap?.exists() && customersSnap?.exists()) {
      try {
        const bookingsData = bookingsSnap.val();
        const customersData = customersSnap.val();
        const roomsData = roomsSnap?.exists() ? roomsSnap.val() : {};
        
        // Build lookup maps for O(1) access
        const roomLookup = new Map<string, { key: string; data: any }>();
        Object.entries(roomsData).forEach(([key, room]: any) => {
          const roomNo = room.room_no?.toString();
          if (roomNo) roomLookup.set(roomNo, { key, data: room });
        });
        
        // Map bookings with embedded customer data
        const bookingsArray = Object.entries(bookingsData).map(([id, booking]: [string, any]) => {
          const customer = customersData[booking.customerId];
          const roomInfo = roomLookup.get(booking.roomNo?.toString());
          const roomData = roomInfo?.data;
          
          return {
            id,
            customer_id: booking.customerId || '',
            room_id: roomInfo?.key || booking.roomNo || '',
            check_in: booking.checkInDate,
            check_out_expected: booking.checkOutDate || booking.checkoutDate,
            status: booking.status || 'CONFIRMED',
            created_at: booking.createdAt ? new Date(booking.createdAt).toISOString() : '',
            customer: customer ? {
              id: booking.customerId,
              name: customer.name || customer.guestName || 'Guest',
              father_name: customer.father_name || customer.fatherName || '',
              mobile: customer.phone || customer.mobile || customer.mobileNumber || '',
              member_count: customer.member_count || customer.membersCount || 0,
              vehicle_number: customer.vehicle_number || customer.vehicleNumber || '',
            } : undefined,
            room: roomData ? {
              id: roomInfo?.key || '',
              room_number: roomData.room_no?.toString() || '',
              type: roomData.type || 'Room',
              capacity: roomData.beds || 1,
            } : undefined,
          };
        });
        
        // Group by customer
        const sorted = bookingsArray.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
        const groupedMap = new Map<string, any>();
        for (const b of sorted) {
          const groupKey = b.customer_id || b.customer?.mobile || b.customer?.name || b.id;
          const roomNo = b.room?.room_number || b.room_id?.toString() || '';
          const existing = groupedMap.get(groupKey);
          if (existing) {
            if (roomNo && !existing.room_numbers.includes(roomNo)) existing.room_numbers.push(roomNo);
          } else {
            groupedMap.set(groupKey, { ...b, room_numbers: roomNo ? [roomNo] : [] });
          }
        }
        const grouped = Array.from(groupedMap.values());
        
        await setCached('bookings:list', grouped);
        console.log(`[Cache] ✅ Cached ${grouped.length} bookings with customer data`);
        successCount++;
      } catch (err) {
        console.error('[Cache] ❌ Failed to cache bookings:', err);
        failCount++;
      }
    }
    
    // Cache customers
    if (customersSnap?.exists()) {
      try {
        const data = customersSnap.val();
        const customersArray = Object.entries(data).map(([id, customer]: [string, any]) => ({
          id,
          name: customer.name || customer.guestName || '',
          mobile: customer.phone || customer.mobile || customer.mobileNumber || '',
          ...customer,
        }));
        await setCached('customers:list', customersArray);
        console.log(`[Cache] ✅ Cached ${customersArray.length} customers`);
        successCount++;
      } catch (err) {
        console.error('[Cache] ❌ Failed to cache customers:', err);
        failCount++;
      }
    }
    
    // Cache rooms
    if (roomsSnap?.exists()) {
      try {
        const data = roomsSnap.val();
        const roomsArray = Object.entries(data).map(([key, room]: [string, any]) => ({
          key,
          ...room,
        }));
        await setCached('rooms:list', roomsArray);
        console.log(`[Cache] ✅ Cached ${roomsArray.length} rooms`);
        successCount++;
      } catch (err) {
        console.error('[Cache] ❌ Failed to cache rooms:', err);
        failCount++;
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[Cache] === CACHE PRE-BUILD COMPLETE ===`);
    console.log(`[Cache] Success: ${successCount}, Failed: ${failCount}, Time: ${elapsed}ms`);
    
    if (successCount > 0) {
      console.log('[Cache] 🎉 Cache is working! Data will load instantly.');
    }
  } catch (err) {
    console.error('[Cache] ❌ CRITICAL ERROR during cache pre-build:', err);
  }
};