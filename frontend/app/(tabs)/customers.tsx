import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchCustomers as fetchRtdbCustomers } from '../../src/utils/rtdbService';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { Ionicons } from '@expo/vector-icons';
import { getCached, setCached } from '../../src/utils/cache';

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
type MonthKey = string; // e.g. "2025-12"

const CustomersScreen = () => {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedMonth, setSelectedMonth] = useState<MonthKey | 'all'>('all');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadedOnce = useRef(false);
  const lastCacheCheck = useRef<number>(0);

  // Load data once on mount - Instagram-style (never refetch on focus)
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      console.log('[Customers] Loading data...');
      // Try cache first for instant display
      const cached = await getCached<CustomerListItem[]>('customers:list');
      console.log('[Customers] Cache result:', cached ? `${cached.length} items` : 'null');
      
      if (cached && cached.length && mounted) {
        setCustomers(cached);
        setLoading(false);
        loadedOnce.current = true;
        
        // Fetch fresh data in background
        console.log('[Customers] Fetching fresh data in background...');
        fetchCustomersInBackground();
        return; // Cache hit - done!
      }
      
      // No cache - fetch from database
      console.log('[Customers] No cache, fetching from database...');
      setLoading(false); // Don't show full-screen spinner
      setRefreshing(true); // Show pull-to-refresh indicator instead
      try {
        const data = await fetchRtdbCustomers(300);
        if (!mounted) return;
        console.log('[Customers] Fetched:', data.length, 'customers');
        setCustomers(data);
        await setCached('customers:list', data);
        loadedOnce.current = true;
      } catch (err) {
        console.error('[Customers] Fetch error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    
    loadData();
    return () => { mounted = false; };
  }, []);

  // Refetch if cache was invalidated (e.g., after new booking)
  useFocusEffect(
    useCallback(() => {
      const checkCache = async () => {
        // Throttle checks to once per second max
        const now = Date.now();
        if (now - lastCacheCheck.current < 1000) return;
        lastCacheCheck.current = now;
        
        const cached = await getCached<CustomerListItem[]>('customers:list');
        // If cache is empty but we have stale local data, refetch
        if (!cached && customers.length > 0) {
          console.log('[Customers] Cache invalidated, refetching...');
          loadedOnce.current = false;
          await fetchCustomers();
        } else if (cached && cached.length > 0) {
          // Check if cache is different from current state (after deletion)
          const currentIds = customers.map(c => c.id).sort().join(',');
          const cachedIds = cached.map(c => c.id).sort().join(',');
          
          if (currentIds !== cachedIds) {
            console.log('[Customers] Applying background-updated cache');
            setCustomers(cached);
          }
        }
      };
      checkCache();
    }, [customers.length])
  );

  // Debounce search to avoid repeated filters/fetches
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText), 350);
    return () => clearTimeout(handle);
  }, [searchText]);

  const fetchCustomers = async () => {
    try {
      const customersData = await fetchRtdbCustomers();
      setCustomers(customersData);
      await setCached('customers:list', customersData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      alert('Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Background fetch without showing loading indicators
  const fetchCustomersInBackground = async () => {
    try {
      const customersData = await fetchRtdbCustomers();
      setCustomers(customersData);
      await setCached('customers:list', customersData);
      console.log('[Customers] Background refresh complete');
    } catch (error) {
      console.error('[Customers] Background refresh failed:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCustomers();
  }, []);

  const renderCustomer = ({ item }: { item: CustomerListItem }) => (
    <TouchableOpacity
      style={styles.customerCard}
      onPress={() => router.push(`/customer-detail/${item.id}` as any)}
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
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  const normalizeDate = (c: CustomerListItem) => {
    if (typeof c.createdAt === 'number') return new Date(c.createdAt);
    if (c.checkInDate) return new Date(c.checkInDate);
    return new Date(0);
  };

  const monthKey = (d: Date): MonthKey =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const monthLabel = (key: MonthKey) => {
    const [year, month] = key.split('-').map((v) => Number(v));
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const filteredCustomers = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const vehicle = (c.vehicleNumber || '').toLowerCase();
      return name.includes(needle) || vehicle.includes(needle);
    });
  }, [customers, debouncedSearch]);

  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => normalizeDate(b).getTime() - normalizeDate(a).getTime());
  }, [filteredCustomers]);

  const monthGroups = useMemo(() => {
    const groups = new Map<MonthKey, CustomerListItem[]>();
    sortedCustomers.forEach((c) => {
      const d = normalizeDate(c);
      const key = monthKey(d);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(c);
    });
    const entries = Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return entries.map(([key, items]) => ({
      key,
      title: `${monthLabel(key)} · ${items.length} bookings`,
      data: items,
    }));
  }, [sortedCustomers]);

  const monthOptions = useMemo(() => {
    return ['all', ...monthGroups.map((g) => g.key)];
  }, [monthGroups]);

  const filteredSections = useMemo(() => {
    if (sortMode === 'recent') {
      const data =
        selectedMonth === 'all'
          ? sortedCustomers
          : sortedCustomers.filter((c) => monthKey(normalizeDate(c)) === selectedMonth);
      return [{ key: 'recent', title: null, data }];
    }
    const sections =
      selectedMonth === 'all'
        ? monthGroups
        : monthGroups.filter((g) => g.key === selectedMonth);
    return sections;
  }, [sortMode, selectedMonth, sortedCustomers, monthGroups]);

  const renderSectionHeader = ({ section }: { section: any }) =>
    section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null;

  const currentMonthLabel =
    selectedMonth === 'all'
      ? 'All months'
      : monthLabel(selectedMonth);

  const sortLabel = sortMode === 'recent' ? 'Recently added' : 'By month';

  // Don't show full-screen loading spinner - show content with pull-to-refresh instead
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

        <View style={styles.filterWrapper}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setMonthPickerOpen((v) => !v)}
          >
            <Ionicons name="calendar" size={16} color="#dc2626" />
            <Text style={styles.filterText}>{currentMonthLabel}</Text>
            <Ionicons
              name={monthPickerOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#6b7280"
            />
          </TouchableOpacity>
          {monthPickerOpen && (
            <View style={styles.dropdown}>
              {monthOptions.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedMonth(key as MonthKey | 'all');
                    setMonthPickerOpen(false);
                  }}
                >
                  <Text style={styles.dropdownText}>
                    {key === 'all' ? 'All months' : monthLabel(key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No customers found</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/' as any)}
        accessibilityLabel="Go to dashboard"
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
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  sortToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  filterWrapper: {
    position: 'relative',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  filterText: {
    color: '#111827',
    fontWeight: '600',
  },
  dropdown: {
    position: 'absolute',
    top: 46,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownText: {
    color: '#111827',
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
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
});

export default CustomersScreen;
