import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import {
  fetchBookingById,
  handleCheckout as rtdbHandleCheckout,
  BookingDetail,
  RtdbRoom,
  reassignBookingRooms,
  subscribeToRooms,
  confirmCheckIn,
  extendStay,
} from '../../src/utils/rtdbService';
import { defaultRoomSeeds } from '../../src/utils/defaultRooms';
import { TOTAL_ROOMS } from '../../src/utils/roomConstants';
import { compareRoomIds } from '../../src/utils/rtdbService';
import { getCached, setCached, getCachedItemSync } from '../../src/utils/cache';
import { mediaImageSource } from '../../src/utils/imageStorage';
import { localDay } from '../../src/utils/date';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { validateExtendStay } from '../../src/utils/bookingUtils';

// Helper to convert cached booking format to BookingDetail
const cachedToBookingDetail = (cached: any): BookingDetail | null => {
  if (!cached) return null;
  return {
    id: cached.id,
    customerId: cached.customer_id || cached.customerId,
    roomNo: cached.room?.room_number || cached.room_id,
    roomNumbers: cached.room_numbers || [cached.room?.room_number || cached.room_id],
    checkInDate: cached.check_in,
    checkOutDate: cached.check_out_expected || cached.check_out_actual,
    status: cached.status,
    createdAt: cached.created_at ? new Date(cached.created_at).getTime() : Date.now(),
    customer: cached.customer ? {
      name: cached.customer.name,
      mobile: cached.customer.mobile,
      father_name: cached.customer.father_name,
      address: cached.customer.address,
      city: cached.customer.city,
      amount: cached.customer.amount || cached.total_amount || '',
      idImageUrl: cached.customer.idImageUrl || cached.customer.id_image_url,
      idImageUrls: cached.customer.idImageUrls || [],
    } : undefined,
  };
};

const BookingDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // INSTANT: Try to get booking from memory cache synchronously (before first render)
  const initialBooking = useMemo(() => {
    if (!id) return null;
    const cached = getCachedItemSync<any>('bookings:list', id);
    return cachedToBookingDetail(cached);
  }, [id]);

  const [booking, setBooking] = useState<BookingDetail | null>(initialBooking);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [rooms, setRooms] = useState<RtdbRoom[]>([]);
  const [editRoomsVisible, setEditRoomsVisible] = useState(false);
  const [roomSelection, setRoomSelection] = useState<Set<string>>(new Set());
  const [savingRooms, setSavingRooms] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Extend Stay State
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newCheckoutDate, setNewCheckoutDate] = useState(new Date());
  const [extending, setExtending] = useState(false);

  const handleExtendStay = async () => {
    if (!id || !booking) return;
    setExtending(true);
    try {
      const newOut = localDay(newCheckoutDate);

      // Validation (simplified for now, ideally fetch all future bookings)
      const validation = validateExtendStay(booking as any, newOut, []);
      if (!validation.valid) {
        Alert.alert('Validation Error', validation.error);
        return;
      }

      await extendStay(id, newOut);

      Alert.alert('Success', 'Stay extended successfully');
      setShowExtendModal(false);
      load();
    } catch (error: any) {
      console.error('Extend stay error', error);
      Alert.alert('Error', error?.message || 'Failed to extend stay');
    } finally {
      setExtending(false);
    }
  };

  const [confirmingCheckIn, setConfirmingCheckIn] = useState(false);

  const handleConfirmCheckIn = async () => {
    if (!id || !booking) return;

    Alert.alert(
      'Confirm Check-in',
      `Are you sure you want to mark Room ${booking.roomNo} as occupied and start the stay for ${booking.customer?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setConfirmingCheckIn(true);
            try {
              await confirmCheckIn(id, booking.roomNo);
              Alert.alert('Success', 'Check-in confirmed successfully');
              load();
            } catch (error: any) {
              console.error('Confirm check-in error', error);
              Alert.alert('Error', error?.message || 'Failed to confirm check-in');
            } finally {
              setConfirmingCheckIn(false);
            }
          }
        }
      ]
    );
  };

  // If no initial booking from memory cache, try async cache or fetch
  useEffect(() => {
    if (!id || booking) return; // Already have data from sync cache

    const loadFromCacheOrFetch = async () => {
      // Try async cache (in case memory cache wasn't populated yet)
      const cachedList = await getCached<any[]>('bookings:list');
      if (cachedList && cachedList.length) {
        const cachedBooking = cachedList.find((b: any) => b.id === id);
        if (cachedBooking) {
          setBooking(cachedToBookingDetail(cachedBooking));
          return;
        }
      }
      // Only fetch from database if NOT in cache
      load();
    };

    loadFromCacheOrFetch();
  }, [id, booking]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchBookingById(id);
      setBooking(data);
    } catch (error) {
      console.error('Error loading booking', error);
      Alert.alert('Error', 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Merge live rooms with seeded defaults so the modal always shows the full list.
    const mergeWithSeeds = (live: RtdbRoom[]) => {
      const seedMap = new Map<string, RtdbRoom>();
      defaultRoomSeeds.slice(0, TOTAL_ROOMS).forEach((seed) => {
        seedMap.set(seed.room_number, {
          key: seed.room_number,
          room_no: seed.room_number,
          beds: seed.capacity ?? 1,
          type: seed.type,
          ac_make: seed.ac_make,
          remarks: seed.remarks,
          is_available: seed.status ? seed.status === 'AVAILABLE' : true,
          current_booking_id: seed.current_booking_id ?? null,
        });
      });
      live.forEach((room) => {
        seedMap.set(room.room_no, {
          ...room,
          is_available: room.is_available !== false,
        });
      });
      return Array.from(seedMap.values()).sort((a, b) => compareRoomIds(a.room_no, b.room_no));
    };

    const unsubscribe = subscribeToRooms(
      (data) => setRooms(mergeWithSeeds(data)),
      (err) => console.error('Rooms subscription error', err)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!booking) return;
    const initial = booking.roomNumbers && booking.roomNumbers.length > 0
      ? booking.roomNumbers
      : [booking.roomNo];
    setRoomSelection(new Set(initial.map((n) => n?.toString()).filter((n) => n)));
  }, [booking]);

  const handleCheckout = async () => {
    if (!id) return;
    setCheckingOut(true);
    try {
      await rtdbHandleCheckout(id);

      // Update local state immediately for instant UI feedback
      setBooking((prev) => prev ? { ...prev, status: 'CHECKED_OUT' } : prev);

      // Update the booking in cache (don't invalidate - update the status)
      const cachedBookings = await getCached<any[]>('bookings:list');
      if (cachedBookings) {
        const updatedBookings = cachedBookings.map(b =>
          b.id === id ? { ...b, status: 'CHECKED_OUT' } : b
        );
        await setCached('bookings:list', updatedBookings);
      }

      // Dashboard and room grid update themselves from their live listeners.

      Alert.alert('Checked out', 'Booking checked out and room is now available.');
      // Navigate back to dashboard
      router.push('/(tabs)/dashboard' as any);
    } catch (error: any) {
      console.error('Checkout error', error);
      Alert.alert('Error', error?.message || 'Failed to check out');
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading || !booking) {
    return <LoadingSpinner message="Loading booking..." />;
  }

  const isBooked = booking.status === 'BOOKED';
  const isConfirmed = booking.status === 'CONFIRMED';
  const isActive = isBooked || isConfirmed;

  const roomsLabel =
    booking.roomNumbers && booking.roomNumbers.length > 0
      ? booking.roomNumbers.join(', ')
      : booking.roomNo;
  const relatedBookingIds = booking.relatedBookingIds || [booking.id];

  const isRoomUnavailable = (room: RtdbRoom) => {
    const heldByOther =
      room.current_booking_id && !relatedBookingIds.includes(room.current_booking_id);
    const heldByUs =
      room.current_booking_id && relatedBookingIds.includes(room.current_booking_id);
    // Only block selection if another booking holds it. If it's ours, allow toggling even if RTDB marks unavailable.
    if (heldByOther) return true;
    if (room.is_available === false && !heldByUs) return true;
    return false;
  };

  const toggleRoomSelection = (roomNo: string) => {
    setRoomSelection((prev) => {
      const next = new Set(prev);
      if (next.has(roomNo)) {
        next.delete(roomNo);
      } else {
        next.add(roomNo);
      }
      return next;
    });
  };

  const handleSaveRooms = async () => {
    if (!id) return;
    if (roomSelection.size === 0) {
      Alert.alert('Missing selection', 'Please select at least one room.');
      return;
    }
    setSavingRooms(true);
    try {
      await reassignBookingRooms(id, Array.from(roomSelection.values()));
      Alert.alert('Updated', 'Room allocation updated successfully.');
      setEditRoomsVisible(false);
      load();
    } catch (error: any) {
      console.error('Reassign rooms error', error);
      Alert.alert('Room update failed', error?.message || 'Could not update room allocation.');
    } finally {
      setSavingRooms(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Booking Detail</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Guest</Text>
        <TouchableOpacity
          onPress={() => booking.customerId && router.push(`/customer-detail/${booking.customerId}` as any)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <InfoRow label="Name" value={booking.customer?.name || 'Guest'} />
            <InfoRow label="Mobile" value={booking.customer?.mobile || '-'} />
            <InfoRow label="Amount" value={booking.customer?.amount || '-'} />
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        {/* ID Proof Thumbnails */}
        {(() => {
          const urls = (booking.customer?.idImageUrls || []).filter(u =>
            typeof u === 'string' && u.length > 0 &&
            (u.startsWith('http') || u.startsWith('file://'))
          );
          if (urls.length === 0) return null;
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {urls.map((url, idx) => (
                <TouchableOpacity
                  key={`${url}-${idx}`}
                  onPress={() => setSelectedImage(url)}
                  style={{ marginRight: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}
                >
                  <Image
                    source={mediaImageSource(url)}
                    style={{ width: 80, height: 80 }}
                    contentFit="cover"
                    placeholder={require('../../assets/images/icon.png')} // Fallback placeholder
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          );
        })()}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Room</Text>
        <InfoRow label="Room No" value={roomsLabel} />
        <InfoRow label="Type" value={booking.room?.type || '-'} />
        <InfoRow
          label="Status"
          value={isBooked ? 'Booked / Occupied' : isConfirmed ? 'Confirmed (Future)' : 'Checked Out'}
          valueStyle={{ color: isBooked ? '#dc2626' : isConfirmed ? '#f59e0b' : '#10b981' }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Stay</Text>
        <InfoRow label="Check-in" value={formatDate(booking.checkInDate)} />
        <InfoRow label="Check-out expected" value={formatDate(booking.checkOutDate)} />
        <InfoRow label="Check-out actual" value={formatDate(booking.checkOutActual)} />
      </View>

      {isBooked && (
        <TouchableOpacity
          style={[styles.button, checkingOut && styles.buttonDisabled]}
          onPress={handleCheckout}
          disabled={checkingOut}
        >
          <Text style={styles.buttonText}>{checkingOut ? 'Checking out...' : 'Check Out'}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditRoomsVisible(true)}>
        <Text style={styles.secondaryButtonText}>Edit Room Allocation</Text>
      </TouchableOpacity>

      {isActive && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { flex: 1 }]}
            onPress={() => setShowExtendModal(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#111827" />
            <Text style={styles.secondaryButtonText}>Extend Stay</Text>
          </TouchableOpacity>
        </View>
      )}

      {isConfirmed && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#f59e0b' }, confirmingCheckIn && styles.buttonDisabled]}
          onPress={handleConfirmCheckIn}
          disabled={confirmingCheckIn}
        >
          <Text style={styles.buttonText}>{confirmingCheckIn ? 'Processing...' : 'Confirm Check-in'}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showExtendModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Extend Stay</Text>
            <Text style={styles.modalSubtitle}>Select new checkout date</Text>

            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateValue}>{formatDate(newCheckoutDate.toISOString())}</Text>
              <Ionicons name="calendar" size={20} color="#dc2626" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={newCheckoutDate}
                mode="date"
                minimumDate={new Date(booking.checkOutDate)}
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) setNewCheckoutDate(date);
                }}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => setShowExtendModal(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, marginTop: 12 }, extending && styles.buttonDisabled]}
                onPress={handleExtendStay}
                disabled={extending}
              >
                <Text style={styles.buttonText}>{extending ? 'Extending...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      <Modal visible={editRoomsVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Room Allocation</Text>
            <Text style={styles.modalSubtitle}>
              Select one or more rooms. Rooms already booked for this date range are disabled.
            </Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {rooms.length === 0 ? (
                <Text style={styles.emptyRoomText}>No rooms available to display.</Text>
              ) : (
                rooms.map((room) => {
                  const unavailable = isRoomUnavailable(room);
                  const selected = roomSelection.has(room.room_no);
                  const heldByUs =
                    room.current_booking_id &&
                    relatedBookingIds.includes(room.current_booking_id);
                  return (
                    <TouchableOpacity
                      key={room.key}
                      style={[
                        styles.roomRow,
                        selected && styles.roomRowSelected,
                        unavailable && styles.roomRowDisabled,
                      ]}
                      onPress={() => !unavailable && toggleRoomSelection(room.room_no)}
                      disabled={unavailable}
                    >
                      <Text
                        style={[
                          styles.roomRowText,
                          unavailable && styles.roomRowTextDisabled,
                          selected && styles.roomRowTextSelected,
                        ]}
                      >
                        {(() => {
                          const isBasementOrCommon =
                            room.type.toLowerCase().includes('basement') ||
                            room.type.toLowerCase().includes('common') ||
                            room.room_no.toLowerCase().includes('basement') ||
                            room.room_no.toLowerCase().startsWith('cb');

                          const isSpecialHall = room.room_no === '302' || room.room_no === '304';

                          if (isBasementOrCommon) {
                            // Just show room number (e.g., "Basement 1" or "CB1")
                            return room.room_no;
                          }

                          // Regular rooms: "Room {number} · {type} · {beds} bed(s)"
                          let display = `Room ${room.room_no}`;
                          if (room.type) {
                            display += ` · ${room.type}`;
                          }
                          if (!isSpecialHall) {
                            display += ` · ${room.beds} bed${room.beds === 1 ? '' : 's'}`;
                          }
                          return display;
                        })()}
                      </Text>
                      {unavailable ? (
                        <Text style={styles.unavailableBadge}>Unavailable</Text>
                      ) : selected ? (
                        <Text style={styles.selectedBadge}>{heldByUs ? 'Currently allocated' : 'Selected'}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => setEditRoomsVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.modalSaveButton, savingRooms && styles.buttonDisabled]}
                onPress={handleSaveRooms}
                disabled={savingRooms}
              >
                <Text style={styles.buttonText}>{savingRooms ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full Image Viewer */}
      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }}
            onPress={() => setSelectedImage(null)}
          >
            <Ionicons name="close-circle" size={40} color="#fff" />
          </TouchableOpacity>
          {selectedImage && (
            <Image
              source={mediaImageSource(selectedImage)}
              style={{ width: '95%', height: '80%' }}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
};

const InfoRow = ({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value?: string | number | null;
  valueStyle?: any;
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, valueStyle]}>{value || '-'}</Text>
  </View>
);

const formatDate = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
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
  button: {
    marginTop: 12,
    backgroundColor: '#dc2626',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#6b7280',
    marginBottom: 12,
  },
  modalList: {
    maxHeight: 340,
  },
  modalListContent: {
    gap: 8,
  },
  roomRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
  },
  roomRowSelected: {
    borderColor: '#f59e0b',
    backgroundColor: '#fef3c7',
  },
  roomRowDisabled: {
    backgroundColor: '#f3f4f6',
  },
  roomRowText: {
    color: '#111827',
    fontWeight: '600',
  },
  roomRowTextSelected: {
    color: '#92400e',
  },
  roomRowTextDisabled: {
    color: '#9ca3af',
  },
  unavailableBadge: {
    color: '#b91c1c',
    fontWeight: '700',
    marginTop: 4,
  },
  selectedBadge: {
    color: '#065f46',
    fontWeight: '700',
    marginTop: 4,
  },
  emptyRoomText: {
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalSaveButton: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  dateValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
});

export default BookingDetailScreen;
