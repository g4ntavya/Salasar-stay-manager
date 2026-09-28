import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteCustomer,
  searchCustomers,
  subscribeToRecentGuests,
  type CustomerSearchResult,
  type GuestListItem,
} from '../../src/utils/rtdbService';
import { getCached, setCached } from '../../src/utils/cache';
import {
  AppText,
  Avatar,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Field,
  PressableScale,
  ScreenHeader,
  Segmented,
  SkeletonList,
  SwipeRow,
  colors,
  haptic,
  radius,
  space,
  useTabBarSpace,
  GUTTER,
} from '../../src/ui';

type SortMode = 'recent' | 'month';

const monthKeyOf = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/** One row per guest: repeat visits with the same mobile number show once (the latest). */
const uniqueGuests = (list: GuestListItem[]) => {
  const seen = new Set<string>();
  return list.filter(g => {
    const key = g.mobile.trim() ? `m:${g.mobile.trim()}` : `id:${g.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const CustomersScreen = () => {
  const router = useRouter();
  const bottomSpace = useTabBarSpace();
  const [guests, setGuests] = useState<GuestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [allMatches, setAllMatches] = useState<CustomerSearchResult[]>([]);

  // Last known list instantly, then live: new guests and edits appear without refreshing.
  useEffect(() => {
    let live = false;
    getCached<GuestListItem[]>('guests:recent').then(cached => {
      if (!live && Array.isArray(cached) && cached.length) {
        setGuests(cached);
        setLoading(false);
      }
    });
    return subscribeToRecentGuests(
      list => {
        live = true;
        const unique = uniqueGuests(list);
        setGuests(unique);
        setLoading(false);
        setCached('guests:recent', unique);
      },
      error => {
        console.warn('[Guests] Live list failed:', error);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Search covers every guest ever recorded (on-device index), not just the recent ones.
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 2) return;
    let cancelled = false;
    searchCustomers(q)
      .then(results => !cancelled && setAllMatches(results))
      .catch(err => console.warn('[Guests] Search failed:', err));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const query = debouncedSearch.trim().toLowerCase();
  const matches = useMemo(() => {
    if (query.length < 2) return guests;
    const recent = guests.filter(
      g => g.name.toLowerCase().includes(query) || g.mobile.includes(query) || g.vehicleNumber.toLowerCase().includes(query)
    );
    const ids = new Set(recent.map(g => g.id));
    const older = allMatches.filter(m => !ids.has(m.id)).map(m => ({ ...m, createdAt: m.createdAt || 0 }));
    return uniqueGuests([...recent, ...older]);
  }, [guests, allMatches, query]);

  const months = useMemo(
    () => Array.from(new Set(guests.filter(g => g.createdAt).map(g => monthKeyOf(g.createdAt)))).sort((a, b) => (a < b ? 1 : -1)),
    [guests]
  );

  const sections = useMemo(() => {
    const inMonth = selectedMonth === 'all' ? matches : matches.filter(g => g.createdAt && monthKeyOf(g.createdAt) === selectedMonth);
    if (sortMode === 'recent') return [{ key: 'recent', title: '', data: inMonth }];
    const groups = new Map<string, GuestListItem[]>();
    inMonth.forEach(g => {
      const key = g.createdAt ? monthKeyOf(g.createdAt) : 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(g);
    });
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, data]) => ({ key, title: `${key === 'unknown' ? 'Earlier' : monthLabel(key)} · ${data.length}`, data }));
  }, [matches, selectedMonth, sortMode]);

  const confirmDelete = useCallback(
    (guest: GuestListItem) =>
      new Promise<boolean>(resolve => {
        haptic.warning();
        Alert.alert('Delete guest?', `${guest.name} and all their stays will be removed from the app. The VM archive keeps a copy.`, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteCustomer(guest.id);
                resolve(true);
              } catch {
                Alert.alert('Could not delete', 'Check your connection and try again.');
                resolve(false);
              }
            },
          },
        ]);
      }),
    []
  );

  const renderGuest = useCallback(
    ({ item }: { item: GuestListItem }) => {
      const date = item.createdAt ? new Date(item.createdAt) : null;
      return (
        <SwipeRow
          style={styles.rowWrap}
          primary={{ label: 'Delete', icon: 'trash-outline', color: colors.danger, onAction: () => confirmDelete(item) }}
        >
          <Card onPress={() => router.push(`/customer-detail/${item.id}`)} style={styles.row} accessibilityLabel={item.name}>
            <Avatar name={item.name} size={44} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {item.name || 'Guest'}
              </AppText>
              <AppText variant="footnote" tone="muted" numberOfLines={1}>
                {[item.mobile, item.vehicleNumber].filter(Boolean).join('  ·  ') || 'No contact saved'}
              </AppText>
            </View>
            {date ? (
              <View style={styles.dateBadge}>
                <AppText variant="numberSm" style={{ fontSize: 19, lineHeight: 23 }}>
                  {date.getDate()}
                </AppText>
                <AppText variant="caption" tone="muted" style={{ fontSize: 10, lineHeight: 12 }}>
                  {date.toLocaleString('en-IN', { month: 'short' })}
                </AppText>
              </View>
            ) : null}
          </Card>
        </SwipeRow>
      );
    },
    [confirmDelete, router]
  );

  const searching = query.length >= 2;
  const header = (
    <View>
      <ScreenHeader
        title="Guests"
        subtitle={loading ? 'Loading…' : searching ? `${matches.length} match${matches.length === 1 ? '' : 'es'} across all guests` : `${guests.length} recent guests`}
      />
      <Field
        icon="search-outline"
        placeholder="Search name, mobile or vehicle"
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
        returnKeyType="search"
        style={{ marginBottom: space.md }}
        right={
          searchText ? (
            <PressableScale onPress={() => setSearchText('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
            </PressableScale>
          ) : null
        }
      />
      <Segmented
        value={sortMode}
        onChange={setSortMode}
        options={[
          { value: 'recent', label: 'Recent' },
          { value: 'month', label: 'By month' },
        ]}
        style={{ marginBottom: space.md }}
      />
      {months.length > 1 ? (
        <ChipRow style={{ marginBottom: space.lg }}>
          <Chip label="All months" selected={selectedMonth === 'all'} onPress={() => setSelectedMonth('all')} />
          {months.map(m => (
            <Chip key={m} label={monthLabel(m)} selected={selectedMonth === m} onPress={() => setSelectedMonth(m)} />
          ))}
        </ChipRow>
      ) : (
        <View style={{ height: space.sm }} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SectionList
        // Android's offscreen-row clipping can re-add a view that still has a parent and crash
        // the app (seen right after sign-in, when the list fills for the first time).
        removeClippedSubviews={false}
        sections={loading && guests.length === 0 ? [] : sections}
        renderItem={renderGuest}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={styles.sectionHeader}>
              <AppText variant="caption" tone="soft">
                {section.title}
              </AppText>
            </View>
          ) : null
        }
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomSpace }]}
        initialNumToRender={16}
        windowSize={10}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <SkeletonList count={6} height={76} />
          ) : (
            <EmptyState
              icon="people-outline"
              title={searching ? 'No guest found' : 'No guests yet'}
              message={searching ? `Nobody matches “${debouncedSearch.trim()}”. Try a mobile number or vehicle.` : 'Guests appear here after their first booking.'}
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: GUTTER },
  rowWrap: { marginBottom: space.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  dateBadge: { alignItems: 'center', minWidth: 44, paddingVertical: 4, paddingHorizontal: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  sectionHeader: { backgroundColor: colors.bg, paddingVertical: space.sm, marginBottom: space.xs },
});

export default CustomersScreen;
