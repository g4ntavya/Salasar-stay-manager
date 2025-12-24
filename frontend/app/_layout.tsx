import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { clearExpiredCache, testCacheStorage, preBuildCache } from '../src/utils/cache';

export default function RootLayout() {
  // Clear expired cache entries on app start (3 week expiry)
  useEffect(() => {
    const initializeCache = async () => {
      // Run diagnostic test first to verify storage is working
      const success = await testCacheStorage();
      
      if (success) {
        console.log('[App] Storage test passed! Initializing cache...');
        // Clear expired cache
        await clearExpiredCache();
        // Pre-build cache with fresh data
        await preBuildCache();
        console.log('[App] ✅ App is ready! Cache has been pre-built.');
      } else {
        console.error('[App] ❌ AsyncStorage is NOT working! Cache will not function.');
      }
    };
    
    initializeCache();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
