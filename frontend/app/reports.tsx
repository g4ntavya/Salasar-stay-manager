import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { exportCsv } from '../src/utils/exportCsv';
import { fetchReportData, normalizeBookingStatus } from '../src/utils/rtdbService';
import { formatDate } from '../src/utils/dateHelper';
import { TOTAL_ROOMS } from '../src/utils/roomConstants';
import * as RevenueService from '../src/utils/RevenueService';

type ReportTab = 'Revenue' | 'Rooms' | 'Bookings';

const ReportsScreen = () => {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<ReportTab>('Revenue');
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [loading, setLoading] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalRevenue: 0,
        cashRevenue: 0,
        upiRevenue: 0,
        totalBookings: 0,
        cancelledBookings: 0,
        occupancyRate: 0,
        revenueByDay: [] as { date: string, amount: number, count?: number }[],
        bookings: [] as any[],
    });

    // Report data depends only on the date range; switching tabs reuses it.
    useEffect(() => {
        generateReport();
    }, [startDate, endDate]);

    const generateReport = async () => {
        setLoading(true);
        try {
            // Two indexed range queries: stays checked out in range (revenue) and checked in (occupancy).
            const { checkedOut, checkedIn } = await fetchReportData(startDate, endDate);

            const liveMetrics = RevenueService.getLiveRevenueReport(checkedOut, startDate, endDate);

            const validForOccupancy = RevenueService.filterBookingsByDateRange(checkedIn, startDate, endDate, null);
            const diffDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const totalAvailableRoomNights = TOTAL_ROOMS * diffDays;
            const occupancyVal = totalAvailableRoomNights > 0
                ? Math.min(100, Math.floor((validForOccupancy.length / totalAvailableRoomNights) * 100))
                : 0;

            const cancelledCount = checkedIn.filter(b => normalizeBookingStatus(b.status) === 'CANCELLED').length;

            setStats({
                totalRevenue: liveMetrics.totalRevenue,
                cashRevenue: liveMetrics.cashRevenue,
                upiRevenue: liveMetrics.upiRevenue,
                totalBookings: liveMetrics.totalBookings,
                cancelledBookings: cancelledCount,
                occupancyRate: occupancyVal,
                revenueByDay: [], // Simplified to follow the 'no analytics' rule
                bookings: liveMetrics.bookings, // This list matches the Bookings tab grouping
            });
        } catch (error) {
            console.error('Error generating report:', error);
            Alert.alert('Error', 'Failed to generate report data.');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        const isRevenue = activeTab === 'Revenue';
        const dataToExport = isRevenue ? stats.bookings : stats.revenueByDay;

        if (dataToExport.length === 0) {
            Alert.alert('No Data', 'There is no data to export for the selected period.');
            return;
        }

        // Build CSV content
        let csvContent = isRevenue
            ? "Checkout Date,Guest Name,Mobile,Room,Amount,Cash,UPI,Entered As\n"
            : "Date,Value\n";

        if (isRevenue) {
            const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            dataToExport.forEach(b => {
                csvContent += `${b.checkoutDate},${q(b.guestName)},${q(b.mobile)},${q(b.room)},${b.amount},${b.cash},${b.upi},${q(b.amountRaw)}\n`;
            });
        } else {
            dataToExport.forEach(day => {
                csvContent += `${day.date},${day.amount}\n`;
            });
        }

        // Generate filename
        const dateStr = formatDate(startDate.toISOString()).replace(/\//g, '-');
        const fileName = `Report_${activeTab}_${dateStr}`;

        // Use the cross-platform export utility
        await exportCsv(csvContent, fileName, {
            dialogTitle: 'Save Report',
            showSuccessAlert: true
        });
    };

    const renderKPI = (label: string, value: string | number, icon: any, color: string) => (
        <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={24} color={color} />
            </View>
            <View>
                <Text style={styles.kpiValue}>{value}</Text>
                <Text style={styles.kpiLabel}>{label}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.navTitle}>Reports</Text>
                <TouchableOpacity onPress={handleExportCSV} style={styles.exportButton}>
                    <Ionicons name="download-outline" size={24} color="#dc2626" />
                </TouchableOpacity>
            </View>

            <View style={styles.tabBar}>
                {(['Revenue', 'Rooms', 'Bookings'] as ReportTab[]).map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.filterContainer}>
                <TouchableOpacity style={styles.dateSelector} onPress={() => setShowStartPicker(true)}>
                    <Text style={styles.dateLabel}>From</Text>
                    <Text style={styles.dateValue}>{formatDate(startDate.toISOString())}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateSelector} onPress={() => setShowEndPicker(true)}>
                    <Text style={styles.dateLabel}>To</Text>
                    <Text style={styles.dateValue}>{formatDate(endDate.toISOString())}</Text>
                </TouchableOpacity>
            </View>

            {showStartPicker && (
                <DateTimePicker
                    value={startDate}
                    mode="date"
                    onChange={(event, date) => {
                        setShowStartPicker(false);
                        if (date) setStartDate(date);
                    }}
                />
            )}
            {showEndPicker && (
                <DateTimePicker
                    value={endDate}
                    mode="date"
                    onChange={(event, date) => {
                        setShowEndPicker(false);
                        if (date) setEndDate(date);
                    }}
                />
            )}

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#dc2626" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.kpiGrid}>
                        {activeTab === 'Revenue' && (
                            <>
                                {renderKPI('Total Revenue', `₹${stats.totalRevenue.toLocaleString('en-IN')}`, 'cash', '#10b981')}
                                <View style={{ width: '100%', alignItems: 'center', marginBottom: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#4b5563' }}>
                                        Cash ₹{stats.cashRevenue.toLocaleString('en-IN')}  ·  UPI ₹{stats.upiRevenue.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                                <View style={{ width: '100%', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>Found {stats.bookings.length} checked-out bookings for this period</Text>
                                </View>
                            </>
                        )}
                        {activeTab === 'Rooms' && (
                            <>
                                {renderKPI('Occupancy', `${stats.occupancyRate}%`, 'bed', '#f59e0b')}
                                {renderKPI('Total Rooms', TOTAL_ROOMS, 'home', '#6366f1')}
                                {renderKPI('Avg Stay', '2.4 days', 'time', '#ec4899')}
                            </>
                        )}
                        {activeTab === 'Bookings' && (
                            <>
                                {renderKPI('Total Bookings', stats.totalBookings, 'calendar', '#3b82f6')}
                                {renderKPI('Cancelled', stats.cancelledBookings, 'close-circle', '#ef4444')}
                                {renderKPI('Confirm Rate', '92%', 'checkmark-done', '#10b981')}
                            </>
                        )}
                    </View>


                    <View style={styles.tableCard}>
                        <Text style={styles.tableTitle}>{activeTab === 'Revenue' ? 'Individual Bookings' : 'Daily Summary'}</Text>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.th, { flex: 1.5 }]}>Date</Text>
                            <Text style={[styles.th, { flex: 2 }]}>{activeTab === 'Revenue' ? 'Guest / Room' : 'Detail'}</Text>
                            <Text style={[styles.th, { textAlign: 'right' }]}>Amount</Text>
                        </View>
                        {activeTab === 'Revenue' ? (
                            stats.bookings.map((b, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <View style={{ flex: 1.5 }}>
                                        <Text style={styles.td}>{formatDate(b.checkoutDate || b.date)}</Text>
                                    </View>
                                    <View style={{ flex: 2 }}>
                                        <Text style={[styles.td, { fontWeight: '600' }]}>{b.guestName || 'Guest'}</Text>
                                        <Text style={[styles.td, { fontSize: 11, color: '#6b7280' }]}>Room {b.room}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.td, { textAlign: 'right', fontWeight: 'bold', color: '#10b981' }]}>
                                            ₹{Number(b.amount || 0).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        ) : (
                            stats.revenueByDay.slice(-20).reverse().map((day, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <Text style={[styles.td, { flex: 1.5 }]}>{formatDate(day.date)}</Text>
                                    <Text style={[styles.td, { flex: 2 }]}>Daily Aggregate</Text>
                                    <Text style={[styles.td, { textAlign: 'right' }]}>
                                        {activeTab === 'Rooms' ? `${day.count || 0} Rooms` : `₹${day.amount.toLocaleString()}`}
                                    </Text>
                                </View>
                            ))
                        )}
                    </View>
                </ScrollView>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    navBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    backButton: {
        marginRight: 16,
    },
    navTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    exportButton: {
        padding: 4,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    tab: {
        paddingVertical: 12,
        marginRight: 24,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: '#dc2626',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#6b7280',
    },
    activeTabText: {
        color: '#dc2626',
    },
    filterContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 16,
        gap: 12,
    },
    dateSelector: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        padding: 10,
    },
    dateLabel: {
        fontSize: 10,
        color: '#9ca3af',
        textTransform: 'uppercase',
    },
    dateValue: {
        fontSize: 14,
        color: '#1f2937',
        fontWeight: '600',
        marginTop: 2,
    },
    content: {
        padding: 16,
    },
    kpiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    kpiCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    kpiIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    kpiValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    kpiLabel: {
        fontSize: 12,
        color: '#6b7280',
    },
    chartContainer: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 20,
    },
    barChart: {
        flexDirection: 'row',
        height: 150,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
    },
    barItem: {
        alignItems: 'center',
        width: '12%',
    },
    bar: {
        width: '100%',
        backgroundColor: '#dc262620',
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        borderWidth: 1,
        borderColor: '#dc2626',
        borderStyle: 'dashed',
    },
    barValue: {
        fontSize: 8,
        color: '#9ca3af',
        marginBottom: 4,
    },
    barLabel: {
        fontSize: 10,
        color: '#6b7280',
        marginTop: 8,
    },
    tableCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tableTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 16,
    },
    tableHeader: {
        flexDirection: 'row',
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        marginBottom: 8,
    },
    th: {
        flex: 1,
        fontSize: 12,
        fontWeight: 'bold',
        color: '#9ca3af',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f9fafb',
    },
    td: {
        flex: 1,
        fontSize: 14,
        color: '#4b5563',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default ReportsScreen;
