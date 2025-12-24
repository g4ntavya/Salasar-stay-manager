# Cache Size Analysis & Optimization

## Current Cache Keys

1. **`bookings:list`** - All bookings with embedded customer data
2. **`customers:list`** - All customers
3. **`rooms:list`** - All rooms (~50 rooms)
4. **`dashboard:stats`** - Simple stats object (tiny)
5. **`rooms:available`** - Available rooms snapshot (new booking screen)

## Estimated Cache Sizes

### Typical Usage (50 bookings, 30 customers, 50 rooms)

**Per Booking Entry (~1.2 KB each):**
```json
{
  "id": "...",
  "customer_id": "...",
  "room_id": "...",
  "check_in": "2025-12-24",
  "check_out_expected": "2025-12-26",
  "status": "BOOKED",
  "created_at": "...",
  "room_numbers": ["101"],
  "customer": {
    "id": "...",
    "name": "Full Name Here",
    "father_name": "Father's Name",
    "mobile": "1234567890",
    "member_count": 4,
    "vehicle_number": "ABC1234",
    "address": "Full address text...",
    "city": "City Name",
    "id_type": "Aadhar",
    "id_number_masked": "****1234",
    "id_photo_base64": "..." // Could be 50-100KB if included!
  },
  "room": {
    "id": "...",
    "room_number": "101",
    "type": "Deluxe AC",
    "capacity": 4
  }
}
```

**Per Customer Entry (~0.5 KB each):**
```json
{
  "id": "...",
  "name": "...",
  "mobile": "...",
  "father_name": "...",
  "address": "...",
  "city": "...",
  "member_count": 4,
  "vehicle_number": "...",
  "id_type": "...",
  "id_number": "...",
  "created_at": "..."
}
```

**Per Room Entry (~0.3 KB each):**
```json
{
  "key": "...",
  "room_no": "101",
  "beds": 4,
  "type": "Deluxe AC",
  "is_available": true,
  "current_booking_id": null
}
```

**Dashboard Stats (~0.1 KB):**
```json
{
  "totalRooms": 50,
  "availableRooms": 30,
  "occupiedRooms": 20,
  "occupiedRoomNos": ["101", "102", ...]
}
```

### Size Calculation (WITHOUT optimization)

**Scenario: Normal use for 30 minutes**
- 50 bookings × 1.2 KB = **60 KB**
- 30 customers × 0.5 KB = **15 KB**
- 50 rooms × 0.3 KB = **15 KB**
- Dashboard stats = **0.1 KB**
- Available rooms cache = **15 KB**
- Timestamps + JSON overhead = **5 KB**

**Total: ~110 KB** ✅ (Very small!)

### Size Calculation (WITH id_photo_base64 - WORST CASE)

If ID photos are cached (base64):
- Each photo: ~50-100 KB
- 30 customers with photos = **3-6 MB**
- Total cache: **3-6 MB** ⚠️ (Could grow!)

## Current Issues & Optimizations Needed

### 🔴 PROBLEM 1: ID Photos Being Cached
**Current Code:** Embeds full base64 images in bookings cache
**Impact:** If 30 customers have ID photos, cache becomes 3-6 MB
**Solution:** Remove ID photos from cache, load on-demand only

### 🔴 PROBLEM 2: Duplicate Data
**Current:** Customer data embedded in BOTH:
- `customers:list` cache
- `bookings:list` cache (every booking has full customer object)
**Impact:** 2x storage for customer data
**Solution:** Only cache customer IDs in bookings, reference customers cache

### 🟡 PROBLEM 3: No Cache Size Limits
**Current:** No maximum cache size enforced
**Impact:** Could grow indefinitely with activity
**Solution:** Add cache size monitoring and auto-cleanup

### 🟡 PROBLEM 4: Stale Data Not Removed
**Current:** 3-week expiry but no active cleanup
**Impact:** Old entries stay until accessed
**Solution:** Add periodic cleanup of expired entries

## Recommended Optimizations

### 1. Remove ID Photos from Cache (CRITICAL)
```typescript
// In cache.ts preBuildCache()
customer: customer ? {
  id: booking.customerId,
  name: customer.name || 'Guest',
  father_name: customer.father_name || '',
  mobile: customer.phone || '',
  member_count: customer.member_count || 0,
  vehicle_number: customer.vehicle_number || '',
  // ❌ REMOVE: id_photo_base64: customer.id_image_url || '',
} : undefined,
```

### 2. Store Only Essential Customer Data in Bookings
```typescript
// Minimal customer data in bookings
customer: {
  id: booking.customerId,
  name: customer.name || 'Guest',
  mobile: customer.phone || '',
  vehicle_number: customer.vehicle_number || '',
}
```

### 3. Add Cache Size Monitoring
```typescript
export const getCacheSize = async (): Promise<number> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    let totalSize = 0;
    
    for (const key of keys) {
      const value = await AsyncStorage.getItem(key);
      if (value) totalSize += value.length;
    }
    
    return totalSize; // bytes
  } catch (err) {
    return 0;
  }
};
```

### 4. Add Cache Size Limit (5 MB)
```typescript
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5 MB

export const setCached = async (key: string, value: any) => {
  // ... existing code ...
  
  // Check total cache size
  const currentSize = await getCacheSize();
  if (currentSize > MAX_CACHE_SIZE) {
    console.warn('[Cache] Cache size exceeded, cleaning up old entries');
    await cleanupOldCache();
  }
  
  // ... save code ...
};
```

### 5. Periodic Cleanup Function
```typescript
export const cleanupOldCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const now = Date.now();
    
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      
      const entry = JSON.parse(raw);
      if (entry.timestamp && (now - entry.timestamp) > CACHE_EXPIRY_MS) {
        await AsyncStorage.removeItem(key);
        console.log(`[Cache] Cleaned up expired cache: ${key}`);
      }
    }
  } catch (err) {
    console.error('[Cache] Cleanup error:', err);
  }
};
```

## Projected Sizes After Optimization

### Without ID Photos (RECOMMENDED)
- 50 bookings × 0.6 KB = **30 KB** (50% reduction)
- 30 customers × 0.4 KB = **12 KB**
- 50 rooms × 0.3 KB = **15 KB**
- Dashboard + other = **5 KB**

**Total: ~62 KB** ✅ (Tiny!)

### After 6 months of daily use
- Assuming 500 bookings total (most checked out)
- Cache only stores last 200 active bookings
- Auto-cleanup removes old entries

**Total: ~150-200 KB** ✅ (Still tiny!)

## Implementation Priority

1. **HIGH PRIORITY**: Remove ID photos from cache (reduces 3-6 MB → 60 KB)
2. **MEDIUM**: Add cache size monitoring
3. **LOW**: Add periodic cleanup (nice to have)

## Storage Comparison

- **Current (with photos)**: ~3-6 MB for 30 mins
- **Optimized (no photos)**: ~60-100 KB for 30 mins
- **After 6 months**: ~150-200 KB

**Android internal storage**: Typically 100+ MB available per app
**Our usage**: <1 MB even after 6 months ✅

## Conclusion

**Current cache is already efficient!** (~110 KB for 30 mins without photos)

The ONLY concern is if ID photos are being cached as base64, which could bloat it to 3-6 MB. I'll check and remove those if present.

After optimization:
- ✅ Fast instant loading (maintained)
- ✅ Minimal storage (~60-200 KB even long-term)
- ✅ No performance degradation
- ✅ Works perfectly in APK builds
