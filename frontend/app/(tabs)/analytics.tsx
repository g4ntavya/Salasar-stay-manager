import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter } from 'expo-router';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import KpiCard from '../../src/components/KpiCard';
import RevenueLineChart from '../../src/components/RevenueLineChart';
import { fetchAnalyticsData, MonthlyStats } from '../../src/firebase/stats';
import { buildMonthSeries, formatMonthLabel, monthKey } from '../../src/utils/date';
import { computeGrowth } from '../../src/utils/growth';
import { getCached, setCached } from '../../src/utils/cache';
import { rebuildMonthlyStats } from '../../src/utils/rtdbService';

const AnalyticsScreen = () => {
    const { profile, signOut } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Tab visibility is handled by (tabs)/_layout.tsx - no redirect needed here
    const [refreshing, setRefreshing] = useState(false);
    const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'UPI'>('ALL');
    const [analyticsData, setAnalyticsData] = useState<Record<string, MonthlyStats>>({});

    const isGrowthUser = profile?.role === 'GROWTH';

    const monthSeries = useMemo(() => buildMonthSeries(12), []);
    const currentMonthKey = useMemo(() => monthKey(new Date()), []);
    const prevMonthKey = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return monthKey(d);
    }, []);
    const lastYearMonthKey = useMemo(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return monthKey(d);
    }, []);

    const loadData = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);

        try {
            // Revenue is recognised at checkout; stats are kept current by each checkout.
            const monthsToFetch = [...monthSeries];
            if (!monthsToFetch.includes(lastYearMonthKey)) {
                monthsToFetch.push(lastYearMonthKey);
            }

            const data = await fetchAnalyticsData(monthsToFetch, paymentFilter);
            setAnalyticsData(data);
            await setCached(`analytics:CHECKOUT:${paymentFilter}`, data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [monthSeries, lastYearMonthKey, paymentFilter]);

    useEffect(() => {
        const tryCache = async () => {
            const cached = await getCached<Record<string, MonthlyStats>>(`analytics:CHECKOUT:${paymentFilter}`);
            if (cached) {
                setAnalyticsData(cached);
                setLoading(false);
                loadData(true); // Silent refresh
            } else {
                loadData();
            }
        };
        tryCache();
    }, [paymentFilter, loadData]);

    const onRefresh = () => {
        setRefreshing(true);
        loadData(true);
    };

    const handleRebuild = async () => {
        setLoading(true);
        try {
            await rebuildMonthlyStats();
            await loadData();
        } catch (error) {
            console.error('Rebuild failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const currentStats = analyticsData[currentMonthKey] || { revenue: 0, bookingsCount: 0 };
    const prevStats = analyticsData[prevMonthKey] || { revenue: 0, bookingsCount: 0 };
    const lastYearStats = analyticsData[lastYearMonthKey] || { revenue: 0, bookingsCount: 0 };

    const momGrowth = computeGrowth(currentStats.revenue, prevStats.revenue);
    const yoyGrowth = computeGrowth(currentStats.revenue, lastYearStats.revenue);

    const chartLabels = monthSeries.slice(-6).map(formatMonthLabel);
    const chartData = monthSeries.slice(-6).map(m => analyticsData[m]?.revenue || 0);

    if (loading && Object.keys(analyticsData).length === 0) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#dc2626" />
                <Text style={styles.loadingText}>Analyzing your growth...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Growth & Analytics</Text>
                {isGrowthUser && (
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <Ionicons name="log-out-outline" size={24} color="#dc2626" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />}
            >
                {/* Filters */}
                <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Payment Method</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
                        {['ALL', 'CASH', 'UPI'].map((mode) => (
                            <TouchableOpacity
                                key={mode}
                                style={[styles.filterChip, paymentFilter === mode && styles.filterChipActive]}
                                onPress={() => setPaymentFilter(mode as any)}
                            >
                                <Text style={[styles.filterText, paymentFilter === mode && styles.filterTextActive]}>{mode}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* KPI Cards */}
                <View style={styles.kpiGrid}>
                    <View style={styles.kpiRow}>
                        <KpiCard
                            title="Monthly Revenue"
                            value={`₹${currentStats.revenue.toLocaleString('en-IN')}`}
                            subtitle="Realized Profit"
                            icon="wallet-outline"
                            color="#10b981"
                        />
                        <KpiCard
                            title="Total Bookings"
                            value={currentStats.bookingsCount}
                            subtitle="This Month"
                            icon="calendar-outline"
                            color="#3b82f6"
                        />
                    </View>
                    <View style={styles.kpiRow}>
                        <KpiCard
                            title="MoM Growth"
                            value={momGrowth.label}
                            icon="trending-up-outline"
                            color="#8b5cf6"
                            trend={{ value: momGrowth.label, isNegative: momGrowth.isNegative }}
                        />
                        <KpiCard
                            title="YoY Growth"
                            value={yoyGrowth.label}
                            icon="bar-chart-outline"
                            color="#f59e0b"
                            trend={{ value: yoyGrowth.label, isNegative: yoyGrowth.isNegative }}
                        />
                    </View>
                </View>

                {/* Chart Section */}
                <View style={styles.chartSection}>
                    <View style={styles.chartTitleContainer}>
                        <View style={styles.titleWithIcon}>
                            <Ionicons name="analytics" size={20} color="#dc2626" />
                            <Text style={styles.chartHeader}>Revenue Performance</Text>
                        </View>
                        <Text style={styles.chartSubheader}>Historical trend for the last 6 months</Text>
                    </View>
                    <View style={styles.chartContainer}>
                        <RevenueLineChart labels={chartLabels} data={chartData} />
                    </View>
                </View>

                {/* Stats Info */}
                <View style={styles.infoCard}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#059669" />
                    <Text style={styles.infoText}>
                        Analytics are based strictly on realized revenue from checked-out bookings.
                    </Text>
                </View>

                {currentStats.revenue === 0 && !loading && (
                    <View style={styles.emptyWarning}>
                        <View style={styles.warningContent}>
                            <Ionicons name="alert-circle-outline" size={24} color="#f59e0b" />
                            <Text style={styles.emptyWarningText}>
                                No revenue data found for this period. Ensure bookings are checked out to see growth metrics.
                            </Text>
                        </View>
                        {profile?.role === 'ADMIN' && (
                            <TouchableOpacity style={styles.rebuildBtn} onPress={handleRebuild}>
                                <Text style={styles.rebuildBtnText}>Sync Analytics</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
    },
    loadingText: {
        marginTop: 12,
        color: '#6b7280',
        fontSize: 14,
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    scrollContent: {
        padding: 16,
    },
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    modeBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    modeBtnActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    modeBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    modeBtnTextActive: {
        color: '#3b82f6',
    },
    filterBar: {
        marginBottom: 20,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fff',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    filterChipActive: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4b5563',
    },
    filterTextActive: {
        color: '#fff',
    },
    kpiGrid: {
        marginBottom: 8,
    },
    kpiRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    chartSection: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        marginTop: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    titleWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    chartTitleContainer: {
        marginBottom: 20,
    },
    chartHeader: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
    },
    chartSubheader: {
        fontSize: 12,
        color: '#6b7280',
        marginLeft: 28,
    },
    chartContainer: {
        marginLeft: -10,
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        padding: 12,
        borderRadius: 12,
        gap: 8,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: '#6b7280',
        lineHeight: 18,
    },
    logoutBtn: {
        padding: 4,
    },
    filterSection: {
        marginBottom: 16,
    },
    filterLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 8,
    },
    emptyWarning: {
        marginTop: 20,
        backgroundColor: '#fffbeb',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fef3c7',
    },
    warningContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    emptyWarningText: {
        flex: 1,
        fontSize: 13,
        color: '#92400e',
        lineHeight: 18,
    },
    rebuildBtn: {
        backgroundColor: '#f59e0b',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    rebuildBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
});

export default AnalyticsScreen;
