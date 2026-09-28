import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { AppTabBar, type TabSpec } from '../../src/ui/TabBar';
import { colors } from '../../src/theme';

const STAFF_TABS: TabSpec[] = [
  { name: 'dashboard', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'bookings', label: 'Bookings', icon: 'calendar-clear-outline', iconActive: 'calendar-clear' },
  { name: 'rooms', label: 'Rooms', icon: 'bed-outline', iconActive: 'bed' },
  { name: 'customers', label: 'Guests', icon: 'people-outline', iconActive: 'people' },
];

const GROWTH_TABS: TabSpec[] = [{ name: 'analytics', label: 'Insights', icon: 'trending-up-outline', iconActive: 'trending-up' }];

export default function TabLayout() {
  const { profile } = useAuth();
  const router = useRouter();
  const isGrowthUser = profile?.role === 'GROWTH';

  return (
    <Tabs
      screenOptions={{ headerShown: false, lazy: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={props =>
        isGrowthUser ? (
          <AppTabBar {...props} tabs={GROWTH_TABS} />
        ) : (
          <AppTabBar
            {...props}
            tabs={STAFF_TABS}
            centerAction={{ icon: 'add', label: 'New booking', after: 2, onPress: () => router.push('/new-booking') }}
          />
        )
      }
    >
      {/* Profile and Analytics stay routable for staff (opened from Home), just not in the bar. */}
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="rooms" />
      <Tabs.Screen name="customers" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
