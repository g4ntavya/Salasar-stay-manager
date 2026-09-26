import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { clearExpiredCache, testCacheStorage, preBuildCache } from '../src/utils/cache';

import WhatIsNewModal from '../src/components/WhatIsNewModal';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import ErrorBoundary from '../src/components/ErrorBoundary';

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
        console.log('[App] ✅ App is ready!');
      } else {
        console.error('[App] ❌ AsyncStorage is NOT working! Cache will not function.');
      }
    };

    initializeCache();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
            </Stack>
            <WhatIsNewModal />
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

