import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { subscribeToRooms, updateRoomCleanedStatus, RtdbRoom } from '../src/utils/rtdbService';
import LoadingSpinner from '../src/components/LoadingSpinner';

const RoomGridScreen = () => {
    const router = useRouter();
    const [rooms, setRooms] = useState<RtdbRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeToRooms((data) => {
            setRooms(data);
            setLoading(false);
            setRefreshing(false);
        });
        return () => unsubscribe();
    }, []);

    const handleToggleStatus = async (room: RtdbRoom) => {
        const nextStatus = room.cleaned_status === 'CLEANED' ? 'DIRTY' :
            room.cleaned_status === 'DIRTY' ? 'CLEANING' : 'CLEANED';

        try {
            await updateRoomCleanedStatus(room.room_no, nextStatus);
        } catch (error) {
            Alert.alert('Error', 'Failed to update room status');
        }
    };

    const renderRoom = ({ item }: { item: RtdbRoom }) => {
        const isOccupied = !item.is_available;
        const statusColor = item.cleaned_status === 'CLEANED' ? '#059669' :
            item.cleaned_status === 'CLEANING' ? '#d97706' : '#dc2626';

        return (
            <TouchableOpacity
                style={[styles.roomCard, isOccupied && styles.roomOccupied]}
                onPress={() => handleToggleStatus(item)}
            >
                <View style={styles.roomHeader}>
                    <Text style={styles.roomNumber}>{item.room_no}</Text>
                    {isOccupied && <Ionicons name="bed" size={16} color="#dc2626" />}
                </View>

                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                        {item.cleaned_status || 'DIRTY'}
                    </Text>
                </View>

                <Text style={styles.roomType}>{item.type}</Text>
            </TouchableOpacity>
        );
    };

    if (loading) return <LoadingSpinner />;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.title}>Room Management</Text>
            </View>

            <FlatList
                data={rooms}
                renderItem={renderRoom}
                keyExtractor={(item) => item.key}
                numColumns={3}
                contentContainerStyle={styles.grid}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} />
                }
            />

            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.statusDot, { backgroundColor: '#059669' }]} />
                    <Text style={styles.legendText}>Cleaned</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.statusDot, { backgroundColor: '#d97706' }]} />
                    <Text style={styles.legendText}>Cleaning</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.statusDot, { backgroundColor: '#dc2626' }]} />
                    <Text style={styles.legendText}>Dirty</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    backButton: {
        marginRight: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    grid: {
        padding: 12,
    },
    roomCard: {
        flex: 1,
        aspectRatio: 1,
        margin: 6,
        padding: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        justifyContent: 'space-between',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    roomOccupied: {
        borderColor: '#fee2e2',
        backgroundColor: '#fef2f2',
    },
    roomHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    roomNumber: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
        gap: 4,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    roomType: {
        fontSize: 12,
        color: '#6b7280',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        gap: 20,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendText: {
        fontSize: 12,
        color: '#4b5563',
    },
});

export default RoomGridScreen;
