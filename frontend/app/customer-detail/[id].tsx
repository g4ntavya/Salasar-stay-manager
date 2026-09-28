import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, RefreshControl, Linking, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { fetchCustomerById, updateCustomer, deleteCustomer } from '../../src/utils/rtdbService';
import { useAuth } from '../../src/context/AuthContext';
import { getCached, setCached, getCachedItemSync } from '../../src/utils/cache';
import { mediaImageSource } from '../../src/utils/imageStorage';
import { Ionicons } from '@expo/vector-icons';
import { parseAmount, describeAmount } from '../../src/utils/amount';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Field,
  IconButton,
  InfoRow,
  NavBar,
  PressableScale,
  colors,
  radius,
  space,
  GUTTER,
} from '../../src/ui';

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
  const [viewerUri, setViewerUri] = useState<string | null>(null);
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


  const since = (() => {
    const ts = typeof customer.createdAt === 'number' ? customer.createdAt : Date.parse(customer.checkInDate || '');
    return ts ? new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  })();
  const amount = parseAmount(customer.amount, customer.paymentMode || 'CASH');
  const set = (key: string) => (v: string) => setCustomer({ ...customer, [key]: v });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavBar
        title="Guest profile"
        right={
          isAdmin ? (
            editing ? (
              <IconButton icon="close" onPress={() => { setEditing(false); fetchFreshData(); }} accessibilityLabel="Cancel editing" />
            ) : (
              <IconButton icon="create-outline" onPress={() => setEditing(true)} accessibilityLabel="Edit guest" />
            )
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
      >
        <Card style={styles.card}>
          <View style={styles.heroTop}>
            <Avatar name={customer.name} size={64} />
            <View style={{ flex: 1 }}>
              <AppText variant="title2" numberOfLines={2}>
                {customer.name || 'Guest'}
              </AppText>
              {since ? (
                <AppText variant="footnote" tone="muted" style={{ marginTop: 2 }}>
                  Guest since {since}
                </AppText>
              ) : null}
            </View>
            {customer.mobile ? (
              <IconButton icon="call" variant="tonal" accessibilityLabel={`Call ${customer.mobile}`} onPress={() => Linking.openURL(`tel:${customer.mobile}`)} />
            ) : null}
          </View>
        </Card>

        <Card style={styles.card}>
          <AppText variant="overline" tone="muted" style={{ marginBottom: editing ? space.md : space.xs }}>
            {editing ? 'Edit details' : 'Details'}
          </AppText>
          {editing ? (
            <>
              <Field label="Name" value={customer.name || ''} onChangeText={set('name')} autoCapitalize="words" />
              <Field label="Mobile" value={customer.mobile || ''} onChangeText={set('mobile')} keyboardType="phone-pad" />
              <Field label="Father's name" value={customer.father_name || ''} onChangeText={set('father_name')} autoCapitalize="words" />
              <Field label="Address" value={customer.address || ''} onChangeText={set('address')} />
              <View style={styles.pair}>
                <Field label="Members" value={String(customer.membersCount ?? '')} onChangeText={set('membersCount')} keyboardType="number-pad" style={{ flex: 1 }} />
                <Field label="Vehicle" value={customer.vehicleNumber || ''} onChangeText={set('vehicleNumber')} autoCapitalize="characters" style={{ flex: 1 }} />
              </View>
              <View style={styles.pair}>
                <Field label="ID type" value={customer.id_type || ''} onChangeText={set('id_type')} style={{ flex: 1 }} />
                <Field label="ID number" value={customer.id_number || ''} onChangeText={set('id_number')} style={{ flex: 1.4 }} />
              </View>
              <Field
                label="Amount"
                value={customer.amount || ''}
                onChangeText={set('amount')}
                hint={customer.amount ? (amount.total > 0 ? `Total ${describeAmount(amount)} · revenue updates on save` : 'Use numbers like 1500 or 1000p, 500c') : undefined}
                hintTone={customer.amount && amount.total <= 0 ? 'danger' : 'muted'}
                style={{ marginBottom: 0 }}
              />
            </>
          ) : (
            <>
              <InfoRow icon="call-outline" label="Mobile" value={customer.mobile} />
              <InfoRow icon="person-outline" label="Father's name" value={customer.father_name} />
              <InfoRow icon="location-outline" label="Address" value={customer.address} />
              <InfoRow icon="people-outline" label="Members" value={customer.membersCount ? String(customer.membersCount) : ''} />
              <InfoRow icon="car-outline" label="Vehicle" value={customer.vehicleNumber} />
              <InfoRow icon="card-outline" label={customer.id_type || 'ID'} value={customer.id_number} />
              <InfoRow icon="wallet-outline" label="Amount" value={amount.total > 0 ? describeAmount(amount) : customer.amount} last />
            </>
          )}
        </Card>

        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText variant="overline" tone="muted">
              ID photos {displayImageUrls.length ? `· ${displayImageUrls.length}` : ''}
            </AppText>
            <PressableScale onPress={() => fetchFreshData()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reload photos">
              <View style={styles.reload}>
                <Ionicons name="refresh" size={14} color={colors.brand} />
                <AppText variant="caption" tone="brand">
                  {imagesLoading ? 'Loading…' : 'Reload'}
                </AppText>
              </View>
            </PressableScale>
          </View>
          {displayImageUrls.length > 0 ? (
            <View style={styles.gallery}>
              {displayImageUrls.map((uri: string, idx: number) => (
                <PressableScale key={`${uri}-${idx}`} onPress={() => setViewerUri(uri)} scaleTo={0.97} style={styles.galleryItem} accessibilityLabel={`ID photo ${idx + 1}`}>
                  <Image source={mediaImageSource(uri)} style={styles.galleryImg} />
                </PressableScale>
              ))}
            </View>
          ) : (
            <View style={styles.noPhotos}>
              <Ionicons name="image-outline" size={28} color={colors.inkMuted} />
              <AppText variant="footnote" tone="muted">
                {imagesLoading ? 'Fetching photos…' : 'No ID photos available'}
              </AppText>
            </View>
          )}
        </Card>

        {isAdmin && !editing ? (
          <Button title="Delete guest" icon="trash-outline" variant="danger" onPress={handleDelete} fullWidth style={{ marginTop: space.sm }} />
        ) : null}
      </ScrollView>

      {editing ? (
        <View style={styles.footer}>
          <Button title="Cancel" variant="secondary" size="lg" onPress={() => { setEditing(false); fetchFreshData(); }} style={{ flex: 1 }} />
          <Button title="Save changes" icon="checkmark" size="lg" onPress={handleSave} style={{ flex: 1.6 }} />
        </View>
      ) : null}

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)} statusBarTranslucent>
        <Pressable style={styles.viewer} onPress={() => setViewerUri(null)} accessibilityLabel="Close photo">
          {viewerUri ? <Image source={mediaImageSource(viewerUri)} style={styles.viewerImg} resizeMode="contain" /> : null}
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={26} color={colors.inkInverse} />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: GUTTER, paddingBottom: space.huge },
  card: { marginBottom: space.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pair: { flexDirection: 'row', gap: space.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  reload: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  galleryItem: { width: '48.5%' },
  galleryImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  noPhotos: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  footer: { flexDirection: 'row', gap: space.md, paddingHorizontal: GUTTER, paddingVertical: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 56, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});

export default CustomerDetailScreen;
