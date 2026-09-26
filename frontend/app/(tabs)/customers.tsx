import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Animated,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { deleteCustomer, fetchCustomers, searchCustomers, type CustomerSearchResult } from '../../src/utils/rtdbService';
import { Ionicons } from '@expo/vector-icons';
import { getCached, setCached } from '../../src/utils/cache';

const PAGE_SIZE = 50;
type CustomerListItem = {
  id: string;
  name: string;
  mobile: string;
  city?: string;
  father_name?: string;
  address?: string;
  id_number?: string;
  id_type?: string;
  membersCount?: number;
  vehicleNumber?: string;
  createdAt?: number;
  checkInDate?: string;
  idImageUrl?: string;
  idImageUrls?: string[];
};

type SortMode = 'recent' | 'month';
type MonthKey = string;

const CustomersScreen = () => {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true); // Start with loading = true
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedMonth, setSelectedMonth] = useState<MonthKey | 'all'>('all');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const mountedRef = useRef(true);
  const loadedOnce = useRef(false);
  const isFetching = useRef(false);
  const hasCachedDisplayRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load from cache FIRST, then fetch fresh data
  useEffect(() => {
    const initialize = async () => {
      // Step 1: Show cached data IMMEDIATELY
      try {
        const cached = await getCached<CustomerListItem[]>('customers:recent');
        if (cached && cached.length > 0 && mountedRef.current) {
          const seenMobiles = new Set<string>();
          const seenNameDate = new Set<string>();

          const deduplicated = cached.filter(c => {
            const mobile = (c.mobile || '').trim();
            const name = (c.name || '').toLowerCase().trim();
            const date = c.checkInDate || '';

            const mobileKey = mobile ? `m:${mobile}` : '';
            const nameDateKey = name && date ? `nd:${name}:${date}` : '';

            if (mobileKey && seenMobiles.has(mobileKey)) return false;
            if (nameDateKey && seenNameDate.has(nameDateKey)) return false;

            if (mobileKey) seenMobiles.add(mobileKey);
            if (nameDateKey) seenNameDate.add(nameDateKey);
            return true;
          });

          console.log('[Customers] Cache load:', deduplicated.length, 'unique');
          setCustomers(deduplicated);
          setLoading(false);
          loadedOnce.current = true;
          hasCachedDisplayRef.current = true;
        }
      } catch (e) {
        console.log('[Customers] No cache available');
      }

      loadData();
    };

    initialize();
  }, []);

  // Refresh on focus if data is stale
  useFocusEffect(
    useCallback(() => {
      if (!loadedOnce.current) return;

      // Check if we need to reload (e.g., after returning from another screen)
      // Using functional state update to avoid stale closure
      setCustomers(prev => {
        if (prev.length === 0 && loadedOnce.current) {
          // Trigger reload in next tick to avoid state update during render
          setTimeout(() => loadData(), 0);
        }
        return prev;
      });
    }, [])
  );

  const loadData = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;

    // Don't show loading when we already have cache on screen (avoids flash)
    if (!hasCachedDisplayRef.current) {
      setLoading(true);
    }

    try {
      const data = await fetchCustomers(PAGE_SIZE);
      const cached = await getCached<any[]>('customers:recent') || [];

      if (!mountedRef.current) return;

      // 🔥 SMART MERGE: Preserve local images (file://) if server hasn't updated yet
      const mergedData = data.map(fresh => {
        const local = cached.find((c: any) => c.id === fresh.id);
        const hasFreshImages = fresh.idImageUrls && fresh.idImageUrls.length > 0;
        const hasLocalImages = local && local.idImageUrls && local.idImageUrls.length > 0;

        if (!hasFreshImages && hasLocalImages) {
          const isOptimistic = local.idImageUrls.some((u: string) => u.startsWith('file://') || u.startsWith('pending:'));
          if (isOptimistic) {
            console.log(`[Customers] Merging optimistic images for ${fresh.name}`);
            return { ...fresh, idImageUrls: local.idImageUrls, idImageUrl: local.idImageUrl };
          }
        }
        return fresh;
      });

      // Sort by most recent first
      const sorted = [...mergedData].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Remove duplicates using multiple criteria
      const seenMobiles = new Set<string>();
      const seenNameDate = new Set<string>();

      const deduplicated = sorted.filter(customer => {
        const mobile = (customer.mobile || '').trim();
        const name = (customer.name || '').toLowerCase().trim();
        const date = customer.checkInDate || '';

        // Create multiple keys to catch duplicates
        const mobileKey = mobile ? `m:${mobile}` : '';
        const nameDateKey = name && date ? `nd:${name}:${date}` : '';
        const nameOnlyKey = name ? `n:${name}` : '';

        // Check if we've seen this mobile number before
        if (mobileKey && seenMobiles.has(mobileKey)) {
          return false;
        }

        // Check if we've seen this name + date combo before
        if (nameDateKey && seenNameDate.has(nameDateKey)) {
          return false;
        }

        // Also check if same name with same mobile (different formatting)
        if (nameOnlyKey && mobile && seenMobiles.has(nameOnlyKey + ':' + mobile.slice(-4))) {
          return false;
        }

        // Mark as seen
        if (mobileKey) seenMobiles.add(mobileKey);
        if (nameDateKey) seenNameDate.add(nameDateKey);
        if (nameOnlyKey && mobile) seenMobiles.add(nameOnlyKey + ':' + mobile.slice(-4));

        return true;
      });

      setCustomers(deduplicated);
      await setCached('customers:recent', deduplicated);
      loadedOnce.current = true;
      console.log('[Customers] Loaded:', deduplicated.length, 'unique (removed', sorted.length - deduplicated.length, 'duplicates)');
    } catch (err) {
      console.error('[Customers] Fetch error:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      isFetching.current = false;
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    hasCachedDisplayRef.current = false;
    await setCached('customers:recent', null);
    isFetching.current = false;
    loadData();
  }, [loadData]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Search every guest ever recorded (on-device index), not just the loaded page.
  const [allMatches, setAllMatches] = useState<CustomerSearchResult[]>([]);
  useEffect(() => {
    let cancelled = false;
    const q = debouncedSearch.trim();
    if (q.length < 2) {
      setAllMatches([]);
      return;
    }
    searchCustomers(q)
      .then(results => !cancelled && setAllMatches(results))
      .catch(err => console.warn('[Customers] Search failed:', err));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Date helpers
  const normalizeDate = (c: CustomerListItem) => {
    if (typeof c.createdAt === 'number') return new Date(c.createdAt);
    if (c.checkInDate) return new Date(c.checkInDate);
    return new Date(0);
  };

  const getMonthKey = (d: Date): MonthKey =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const monthLabel = (key: MonthKey) => {
    const [year, month] = key.split('-').map((v) => Number(v));
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Filter by search
  const searchFiltered = useMemo(() => {
    if (!debouncedSearch.trim()) return customers;
    const search = debouncedSearch.toLowerCase().trim();
    const loaded = customers.filter(c =>
      c.name?.toLowerCase().includes(search) ||
      c.mobile?.includes(search) ||
      c.vehicleNumber?.toLowerCase().includes(search)
    );
    const loadedIds = new Set(loaded.map(c => c.id));
    const older = allMatches.filter(m => !loadedIds.has(m.id));
    return [...loaded, ...older];
  }, [customers, debouncedSearch, allMatches]);

  // Group by month
  const monthGroups = useMemo(() => {
    const groups = new Map<MonthKey, CustomerListItem[]>();
    searchFiltered.forEach((c) => {
      const d = normalizeDate(c);
      const key = getMonthKey(d);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(c);
    });
    const entries = Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return entries.map(([key, items]) => ({
      key,
      title: `${monthLabel(key)} · ${items.length} visits`,
      data: items,
    }));
  }, [searchFiltered]);

  // Available months for picker
  const availableMonths = useMemo(() => {
    const months = new Set<MonthKey>();
    customers.forEach(c => {
      const d = normalizeDate(c);
      months.add(getMonthKey(d));
    });
    return Array.from(months).sort((a, b) => (a < b ? 1 : -1));
  }, [customers]);

  // Filter by selected month
  const filteredByMonth = useMemo(() => {
    if (selectedMonth === 'all') return searchFiltered;
    return searchFiltered.filter(c => {
      const d = normalizeDate(c);
      return getMonthKey(d) === selectedMonth;
    });
  }, [searchFiltered, selectedMonth]);

  // Final sections for display
  const filteredSections = useMemo(() => {
    if (sortMode === 'recent') {
      return [{ key: 'recent', title: '', data: filteredByMonth }];
    }
    if (selectedMonth === 'all') {
      return monthGroups;
    }
    return [{
      key: selectedMonth,
      title: `${monthLabel(selectedMonth)} · ${filteredByMonth.length} visits`,
      data: filteredByMonth,
    }];
  }, [sortMode, filteredByMonth, monthGroups, selectedMonth]);

  const handleDeleteCustomer = useCallback((customer: CustomerListItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Customer',
      `Are you sure you want to delete ${customer.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomer(customer.id);
              setCustomers(prev => prev.filter(c => c.id !== customer.id));
              const cached = await getCached<CustomerListItem[]>('customers:recent');
              if (cached) {
                await setCached('customers:recent', cached.filter(c => c.id !== customer.id));
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete customer');
            }
          }
        }
      ]
    );
  }, []);

  const renderCustomer = useCallback(({ item }: { item: CustomerListItem }) => {
    const date = normalizeDate(item);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();

    const renderRightActions = (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      const trans = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });

      return (
        <View style={styles.rightActionContainer}>
          <TouchableOpacity
            onPress={() => handleDeleteCustomer(item)}
            style={styles.deleteAction}
            activeOpacity={0.8}
          >
            <Animated.View style={{ transform: [{ scale: trans }], alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={24} color="#fff" />
              <Text style={styles.deleteText}>Delete</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      );
    };

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.customerCard}
          onPress={() => router.push(`/customer-detail/${item.id}` as any)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="#fff" />
          </View>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>{item.name}</Text>
            <Text style={styles.customerMobile}>{item.mobile}</Text>
            {item.vehicleNumber && (
              <Text style={styles.customerVehicle}>🚗 {item.vehicleNumber}</Text>
            )}
          </View>
          <View style={styles.dateContainer}>
            <Text style={styles.dateDay}>{day}</Text>
            <Text style={styles.dateMonth}>{month}</Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  }, [handleDeleteCustomer, router]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string } }) => {
    if (!section.title) return null;
    return <Text style={styles.sectionTitle}>{section.title}</Text>;
  }, []);

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading customers...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyText}>No customers found</Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Month Picker Modal
  const renderMonthPicker = () => (
    <Modal
      visible={monthPickerOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setMonthPickerOpen(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setMonthPickerOpen(false)}
      >
        <View style={styles.monthPickerContainer}>
          <Text style={styles.monthPickerTitle}>Select Month</Text>
          <TouchableOpacity
            style={[styles.monthOption, selectedMonth === 'all' && styles.monthOptionActive]}
            onPress={() => { setSelectedMonth('all'); setMonthPickerOpen(false); }}
          >
            <Ionicons name="calendar" size={20} color={selectedMonth === 'all' ? '#dc2626' : '#6b7280'} />
            <Text style={[styles.monthOptionText, selectedMonth === 'all' && styles.monthOptionTextActive]}>
              All months
            </Text>
          </TouchableOpacity>
          <FlatList
            data={availableMonths}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.monthOption, selectedMonth === item && styles.monthOptionActive]}
                onPress={() => { setSelectedMonth(item); setMonthPickerOpen(false); }}
              >
                <Text style={[styles.monthOptionText, selectedMonth === item && styles.monthOptionTextActive]}>
                  {monthLabel(item)}
                </Text>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 300 }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or vehicle number"
        placeholderTextColor="#9ca3af"
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      <View style={styles.controlsRow}>
        <View style={styles.sortToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, sortMode === 'recent' && styles.toggleBtnActive]}
            onPress={() => setSortMode('recent')}
          >
            <Text style={[styles.toggleText, sortMode === 'recent' && styles.toggleTextActive]}>
              Recently added
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, sortMode === 'month' && styles.toggleBtnActive]}
            onPress={() => setSortMode('month')}
          >
            <Text style={[styles.toggleText, sortMode === 'month' && styles.toggleTextActive]}>
              By month
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.monthDropdown}
          onPress={() => setMonthPickerOpen(true)}
        >
          <Ionicons name="calendar-outline" size={18} color="#6b7280" />
          <Text style={styles.monthDropdownText}>
            {selectedMonth === 'all' ? 'All months' : monthLabel(selectedMonth)}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <SectionList
        sections={filteredSections}
        renderItem={renderCustomer}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />
        }
        initialNumToRender={20}
        windowSize={10}
        maxToRenderPerBatch={15}
        removeClippedSubviews={true}
        stickySectionHeadersEnabled={true}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />

      {renderMonthPicker()}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/new-booking' as any)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  searchInput: {
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    margin: 16,
    marginBottom: 8,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sortToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  toggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toggleBtnActive: {
    backgroundColor: '#fee2e2',
  },
  toggleText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 13,
  },
  toggleTextActive: {
    color: '#dc2626',
  },
  monthDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  monthDropdownText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
  },
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  customerMobile: {
    fontSize: 14,
    color: '#6b7280',
  },
  customerVehicle: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  dateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  dateDay: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    lineHeight: 28,
  },
  dateMonth: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  retryText: {
    color: '#dc2626',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    backgroundColor: '#f9fafb',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  rightActionContainer: {
    width: 80,
    marginBottom: 12,
  },
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    borderRadius: 12,
  },
  deleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  monthPickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 320,
  },
  monthPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  monthOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 10,
  },
  monthOptionActive: {
    backgroundColor: '#fee2e2',
  },
  monthOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  monthOptionTextActive: {
    color: '#dc2626',
    fontWeight: '600',
  },
});

export default CustomersScreen;
