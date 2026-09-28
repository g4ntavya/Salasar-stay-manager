import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider } from '../src/context/AuthContext';
import { clearExpiredCache, testCacheStorage } from '../src/utils/cache';
import WhatIsNewModal from '../src/components/WhatIsNewModal';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Fonts ship inside the app, so this resolves in milliseconds; the splash covers it.
  // The icon font is loaded here too, so icons never pop in after the first frame.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Clear expired cache entries on app start (3 week expiry).
    testCacheStorage()
      .then(ok => (ok ? clearExpiredCache() : console.error('[App] AsyncStorage is not working; cache disabled.')))
      .catch(() => {});
  }, []);

  // If a font ever fails to load, fall back to system fonts rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The app draws edge-to-edge, so the keyboard layer must not add its own bar insets. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <ErrorBoundary>
          <SafeAreaProvider>
            <AuthProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right',
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="index" options={{ animation: 'fade' }} />
                <Stack.Screen name="login" options={{ animation: 'fade' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="new-booking" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
                <Stack.Screen name="edit-booking/[id]" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
              </Stack>
              <WhatIsNewModal />
            </AuthProvider>
          </SafeAreaProvider>
        </ErrorBoundary>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
