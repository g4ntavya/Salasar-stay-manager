import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Image, TextInput, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { fetchCustomerById, updateCustomer, deleteCustomer } from '../../src/utils/rtdbService';
import { useAuth } from '../../src/context/AuthContext';
import { getCached, setCached, getCachedItemSync } from '../../src/utils/cache';
import { mediaImageSource } from '../../src/utils/imageStorage';
import { Ionicons } from '@expo/vector-icons';

const IMAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 3 months

const CustomerDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // INSTANT: Try to get customer from memory cache synchronously (before first render)
  const initialCustomer = useMemo(() => {
    if (!id) return null;
    return getCachedItemSync<any>('customers:list', id);
  }, [id]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customer, setCustomer] = useState<any>(initialCustomer);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const { profile } = useAuth();
  // Roles come only from the database (users/{uid}), enforced by security rules.
  const isAdmin = profile?.role === 'ADMIN';

  // 🔥 ENTERPRISE FIX: Staff must also be able to see their own uploaded images 
  // and images uploaded by others once they are synced. 
  // The 'isAdmin' check was previously used to restrict some UI elements.

  // Load customer: first from cache for instant display, then always fetch fresh from RTDB
  useEffect(() => {
    if (!id) return;

    // If no initial customer from sync cache, try async cache
    const loadFromCacheFirst = async () => {
      if (!customer) {
        const cachedList = await getCached<any[]>('customers:list');
        if (cachedList && cachedList.length) {
          const cachedCustomer = cachedList.find((c: any) => c.id === id);
          if (cachedCustomer) {
            setCustomer(cachedCustomer);
          }
        }
      }

      // ALWAYS fetch fresh from RTDB to get the latest data (especially uploaded images)
      fetchFreshData();
    };

    loadFromCacheFirst();
  }, [id]);

  // Fetch fresh data from RTDB (not cache)
  const fetchFreshData = useCallback(async () => {
    if (!id) return;

    try {
      setImagesLoading(true);
      const freshData = await fetchCustomerById(id);

      if (freshData) {
        // If RTDB lacks images, try to hydrate from cached lists (staff uploads)
        if (!freshData.idImageUrls || freshData.idImageUrls.length === 0) {
          try {
            const [cachedList, cachedRecent] = await Promise.all([
              getCached<any[]>('customers:list'),
              getCached<any[]>('customers:recent'),
            ]);
            const fallback =
              (cachedList || []).find(c => c.id === id) ||
              (cachedRecent || []).find(c => c.id === id);
            if (fallback && Array.isArray(fallback.idImageUrls) && fallback.idImageUrls.length > 0) {
              freshData.idImageUrls = fallback.idImageUrls;
              freshData.idImageUrl = fallback.idImageUrl || fallback.idImageUrls[0];
            }
          } catch (cacheErr) {
            console.warn('[CustomerDetail] Cache hydrate for images failed:', cacheErr);
          }
        }

        setCustomer((prev: any) => {
          if (!prev) return freshData;

          // 🔥 SMART MERGE: Don't let empty remote data kill valid optimistic images
          const mergedImages = [...(freshData.idImageUrls || [])];
          const prevImages = prev?.idImageUrls || [];

          // If remote is empty or has fewer images, but we have local images, preserve them
          if (mergedImages.length < prevImages.length && prevImages.length > 0) {
            const hasLocal = prevImages.some((u: string) => u.startsWith('file://') || u.startsWith('pending:'));
            if (hasLocal) {
              console.log(`[CustomerDetail] Preserving optimistic images (${prevImages.length}) vs server (${mergedImages.length})`);
              return {
                ...prev,
                ...freshData,
                idImageUrls: prevImages,
                idImageUrl: prev.idImageUrl || freshData.idImageUrl || prevImages[0]
              };
            }
          }

          return { ...prev, ...freshData };
        });

        // Also update the cache with fresh data
        const cachedList = await getCached<any[]>('customers:list');
        if (cachedList) {
          const updatedList = cachedList.map(c => c.id === id ? { ...c, ...freshData } : c);
          await setCached('customers:list', updatedList);
        }
      }
    } catch (error) {
      console.warn('[CustomerDetail] Background refresh failed:', error);
    } finally {
      setImagesLoading(false);
    }
  }, [id]);

  // Full reload (for error recovery)
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchCustomerById(id);
      setCustomer(data);
    } catch (error) {
      console.error('Error loading customer', error);
      Alert.alert('Error', 'Failed to load customer');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFreshData();
    setRefreshing(false);
  }, [fetchFreshData]);

  const handleSave = async () => {
    if (!id || !customer) return;
    try {
      await updateCustomer(id, {
        guestName: customer.name,
        fatherName: customer.father_name,
        mobileNumber: customer.mobile,
        address: customer.address,
        amount: customer.amount,
        membersCount: customer.membersCount ? Number(customer.membersCount) : undefined,
        vehicleNumber: customer.vehicleNumber,
        idNumber: customer.id_number,
        idImageUrl: customer.idImageUrl,
        idImageUrls: customer.idImageUrls,
      });

      // Refresh from RTDB after save
      const updatedCustomer = await fetchCustomerById(id);
      if (updatedCustomer) {
        setCustomer(updatedCustomer);
        const cachedList = await getCached<any[]>('customers:list');
        if (cachedList) {
          const updatedList = cachedList.map(c => c.id === id ? { ...c, ...updatedCustomer } : c);
          await setCached('customers:list', updatedList);
        }
      }

      Alert.alert('Saved', 'Customer updated');
      setEditing(false);
    } catch (err) {
      console.error('Update error', err);
      Alert.alert('Error', 'Failed to save customer');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    Alert.alert('Delete Customer', 'Are you sure you want to delete this customer? This will also delete all associated bookings.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer(id);

            // Drop cached lists that contained this guest; screens refetch on next view.
            const cachedRecent = await getCached<any[]>('customers:recent');
            await Promise.all([
              cachedRecent ? setCached('customers:recent', cachedRecent.filter(c => c.id !== id)) : null,
              setCached('customers:list', null),
              setCached('bookings:list', null),
            ]);
            Alert.alert('Deleted', 'Customer and all associated bookings removed');
            router.back();
          } catch (err) {
            console.error('Delete error', err);
            Alert.alert('Error', 'Failed to delete customer');
          }
        },
      },
    ]);
  };

  // Filter image URLs one more time to ensure only valid URLs are displayed
  const displayImageUrls = useMemo(() => {
    if (!customer) return [];

    const ref = customer.updatedAt ?? customer.createdAt ?? customer.checkInDate;
    if (ref) {
      const ts = typeof ref === 'string' ? Date.parse(ref) : Number(ref);
      if (!Number.isNaN(ts) && ts < Date.now() - IMAGE_RETENTION_MS) {
        return [];
      }
    }

    const rawUrls: string[] = [
      ...(Array.isArray(customer.idImageUrls) ? customer.idImageUrls : []),
      customer.idImageUrl,
    ].filter(Boolean) as string[];

    const urls = Array.from(new Set(rawUrls)).filter(
      (url: any) =>
        typeof url === 'string' &&
        url.length > 0 &&
        !url.startsWith('pending:')
    );

    console.log(`[CustomerDetail] Filtered displayImageUrls (${urls.length}):`, urls);
    return urls;
  }, [customer?.idImageUrls, customer?.idImageUrl]);

  const displayPrimaryImage = useMemo(() => {
    const first = displayImageUrls[0];
    if (first && typeof first === 'string' && !first.startsWith('pending:')) {
      return first;
    }
    return null;
  }, [displayImageUrls]);

  if (loading || !customer) {
    return <LoadingSpinner message="Loading customer..." />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Customer Detail</Text>
      <View style={styles.card}>
        <InfoInput label="Name" value={customer.name} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, name: v })} />
        <InfoInput label="Father's Name" value={customer.father_name} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, father_name: v })} />
        <InfoInput label="Mobile" value={customer.mobile} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, mobile: v })} />
        <InfoInput label="Amount" value={customer.amount} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, amount: v })} />
        <InfoInput label="Address" value={customer.address} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, address: v })} />
        <InfoInput label="Members" value={customer.membersCount} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, membersCount: v })} />
        <InfoInput label="Vehicle Number" value={customer.vehicleNumber} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, vehicleNumber: v })} />
        <InfoInput label="ID Type" value={customer.id_type} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, id_type: v })} />
        <InfoInput label="ID Number" value={customer.id_number} editable={isAdmin && editing} onChange={(v) => setCustomer({ ...customer, id_number: v })} keyboardType="default" />

        {/* ID Images Section */}
        {(() => {
          // 🔥 ENTERPRISE FIX: Display images for BOTH Admin and Staff
          const hasImages = displayImageUrls.length > 0 || displayPrimaryImage;

          if (hasImages) {
            const urls = displayImageUrls.length > 0 ? displayImageUrls : [displayPrimaryImage!];
            return (
              <View style={styles.imageWrapper}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.imageLabel}>ID Images ({urls.length})</Text>
                  {imagesLoading && <ActivityIndicator size="small" color="#dc2626" style={{ marginLeft: 8 }} />}
                </View>
                {urls.map((uri: string, idx: number) => (
                  <View key={idx} style={styles.imageContainer}>
                    <Image
                      source={mediaImageSource(uri)}
                      style={styles.idImage}
                    />
                    <TouchableOpacity
                      style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 20, padding: 8, zIndex: 10 }}
                      onPress={() => fetchFreshData()}
                    >
                      <Ionicons name="refresh" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          }

          if (imagesLoading) {
            return (
              <View style={styles.imageWrapper}>
                <Text style={styles.imageLabel}>ID Image</Text>
                <View style={styles.imagePlaceholder}>
                  <ActivityIndicator size="small" color="#6b7280" />
                  <Text style={styles.imagePlaceholderText}>Fetching images...</Text>
                </View>
              </View>
            );
          }

          return (
            <View style={styles.imageWrapper}>
              <View style={styles.imagePlaceholder}>
                <TouchableOpacity onPress={() => fetchFreshData()} style={{ alignItems: 'center' }}>
                  <Ionicons name="image-outline" size={32} color="#d1d5db" />
                  <Text style={styles.imagePlaceholderText}>No ID images available</Text>
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Tap to retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </View>

      {isAdmin ? (
        <View style={styles.actionsRow}>
          {!editing ? (
            <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => setEditing(true)}>
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={handleSave}>
              <Text style={styles.actionText}>Save</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
};

const InfoInput = ({
  label,
  value,
  editable,
  onChange,
  keyboardType,
}: {
  label: string;
  value?: string | number;
  editable: boolean;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    {editable ? (
      <TextInput
        style={styles.infoInput}
        value={value?.toString() || ''}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
      />
    ) : (
      <Text style={styles.infoValue}>{value || '-'}</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  infoValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  infoInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 180,
    color: '#111827',
  },
  imageWrapper: {
    marginTop: 16,
    gap: 8,
  },
  imageLabel: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  imageContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  idImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#e5e7eb',
    resizeMode: 'contain',
  },
  imagePlaceholder: {
    height: 120,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 4,
  },
  imageOverlayText: {
    color: '#fff',
    fontSize: 10,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
  },
  editBtn: {
    backgroundColor: '#f59e0b',
  },
  saveBtn: {
    backgroundColor: '#10b981',
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default CustomerDetailScreen;
