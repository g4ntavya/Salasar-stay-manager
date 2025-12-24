import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Image, TextInput, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { fetchCustomerById, updateCustomer, deleteCustomer, fetchCustomers } from '../../src/utils/rtdbService';
import { useAuth } from '../../src/context/AuthContext';
import { getCached, setCached } from '../../src/utils/cache';
import { get, ref as rtdbRef, query as rtdbQuery, orderByChild, limitToLast } from 'firebase/database';
import { rtdb } from '../../src/firebase/firebase';
import { normalizeBookingStatus } from '../../src/utils/rtdbService';

const CustomerDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const { profile } = useAuth();
  const isAdmin =
    profile?.role === 'ADMIN' ||
    (profile?.full_name || '').trim().toLowerCase() === 'sarita rohilla' ||
    (profile?.email || '').trim().toLowerCase() === 'sarita@salasar.com';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Try to load from cache first for INSTANT display (Instagram-style)
      const cachedList = await getCached<any[]>('customers:list');
      if (cachedList && cachedList.length) {
        const cachedCustomer = cachedList.find((c: any) => c.id === id);
        if (cachedCustomer) {
          setCustomer(cachedCustomer);
          setLoading(false);
          return; // Don't fetch from database - cache is enough!
        }
      }
      
      // Only fetch from database if NOT in cache (rare case)
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

  useEffect(() => {
    load();
  }, [load]);

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
      Alert.alert('Saved', 'Customer updated');
      setEditing(false);
      load();
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
            
            // Fetch fresh data and update caches immediately (don't just invalidate)
            console.log('[CustomerDelete] Fetching fresh data after deletion...');
            
            // Fetch all fresh data in parallel
            const [customersData, bookingsSnap, roomsSnap] = await Promise.all([
              fetchCustomers(300),
              (async () => {
                try {
                  const q = rtdbQuery(rtdbRef(rtdb, 'bookings'), orderByChild('createdAt'), limitToLast(200));
                  return await get(q);
                } catch {
                  return await get(rtdbRef(rtdb, 'bookings'));
                }
              })(),
              get(rtdbRef(rtdb, 'rooms')),
            ]);
            
            const bookingsVal = bookingsSnap.val() || {};
            const customersVal = customersData.reduce((acc: any, c: any) => {
              acc[c.id] = c;
              return acc;
            }, {});
            const roomsVal = roomsSnap.val() || {};
            
            // Build room lookup
            const roomLookup = new Map<string, { key: string; data: any }>();
            Object.entries(roomsVal).forEach(([key, room]: any) => {
              const roomNo = room.room_no?.toString();
              if (roomNo) roomLookup.set(roomNo, { key, data: room });
            });
            
            // Map bookings
            const mapped = Object.entries(bookingsVal).map(([id, value]: any) => {
              const booking = value as any;
              const customer = customersVal[booking.customerId];
              const roomInfo = roomLookup.get(booking.roomNo?.toString());
              const roomData = roomInfo?.data;
              const roomKey = roomInfo?.key;
              
              const normalizedStatus = normalizeBookingStatus(booking.status);
              const roomAvailable = roomData?.is_available !== false && !roomData?.current_booking_id;
              
              const amountVal = customer?.city || customer?.amount || '';
              const parsedAmount = Number(amountVal) || 0;
              return {
                id,
                customer_id: booking.customerId || '',
                room_id: roomKey || booking.roomNo || '',
                check_in: booking.checkInDate,
                check_out_expected: booking.checkOutDate || booking.checkoutDate,
                check_out_actual: booking.checkOutActual || booking.checkoutDate,
                status: normalizedStatus,
                total_amount: parsedAmount,
                created_by: '',
                created_at: booking.createdAt ? new Date(booking.createdAt).toISOString() : '',
                customer: customer ? {
                  id: booking.customerId,
                  name: customer.name || 'Guest',
                  father_name: customer.father_name || '',
                  address: customer.address || '',
                  city: customer.city || '',
                  mobile: customer.phone || customer.mobile || '',
                  member_count: customer.member_count || customer.membersCount || 0,
                  vehicle_number: customer.vehicle_number || customer.vehicleNumber || '',
                  id_type: customer.id_type || '',
                  id_number_masked: customer.id_number || '',
                  created_at: customer.createdAt ? new Date(customer.createdAt).toISOString() : '',
                } : undefined,
                room: roomData ? {
                  id: roomKey || booking.roomNo || '',
                  room_number: roomData.room_no?.toString() || booking.roomNo || '',
                  type: roomData.type || 'Room',
                  capacity: roomData.beds || 1,
                  price_per_night: 0,
                  status: roomAvailable ? 'AVAILABLE' : 'OCCUPIED',
                  current_booking_id: roomData.current_booking_id,
                } : undefined,
              };
            });
            
            const sorted = mapped.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
            const groupedMap = new Map<string, any>();
            for (const b of sorted) {
              const groupKey = b.customer_id || b.customer?.mobile || b.customer?.name || b.id;
              const roomNo = b.room?.room_number || b.room_id?.toString() || '';
              const existing = groupedMap.get(groupKey);
              if (existing) {
                if (roomNo && !existing.room_numbers.includes(roomNo)) existing.room_numbers.push(roomNo);
              } else {
                groupedMap.set(groupKey, { ...b, room_numbers: roomNo ? [roomNo] : [] });
              }
            }
            const grouped = Array.from(groupedMap.values());
            
            // Update all caches with fresh data
            await Promise.all([
              setCached('customers:list', customersData),
              setCached('bookings:list', grouped),
              setCached('rooms:list', Object.entries(roomsVal).map(([key, room]: any) => ({ key, ...room }))),
              setCached('dashboard:stats', null),
            ]);
            
            console.log('[CustomerDelete] ✅ All caches updated with fresh data');
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

  if (loading || !customer) {
    return <LoadingSpinner message="Loading customer..." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
        {customer.idImageUrls && customer.idImageUrls.length > 0 ? (
          <View style={styles.imageWrapper}>
            <Text style={styles.imageLabel}>ID Images</Text>
            {customer.idImageUrls.map((uri: string, idx: number) => (
              <Image key={idx} source={{ uri }} style={styles.idImage} />
            ))}
          </View>
        ) : customer.idImageUrl ? (
          <View style={styles.imageWrapper}>
            <Text style={styles.imageLabel}>ID Image</Text>
            <Image source={{ uri: customer.idImageUrl }} style={styles.idImage} />
          </View>
        ) : null}
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
    marginTop: 12,
    gap: 6,
  },
  imageLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  idImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    resizeMode: 'contain',
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
