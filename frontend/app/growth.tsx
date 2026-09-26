import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../src/utils/dateHelper';

const GrowthScreen = () => {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        mrr: 0,
        mom: 0,
        yoy: 0,
        history: [] as { month: string, revenue: number }[],
    });

    useEffect(() => {
        loadGrowthMetrics();
    }, []);

    const loadGrowthMetrics = async () => {
        setLoading(true);
        try {
            // Simulation of revenue grouping by month
            const dummyHistory = [
                { month: 'Jan 2025', revenue: 120000 },
                { month: 'Feb 2025', revenue: 135000 },
                { month: 'Mar 2025', revenue: 150000 },
                { month: 'Apr 2025', revenue: 145000 },
                { month: 'May 2025', revenue: 160000 },
                { month: 'Jun 2025', revenue: 175000 },
                { month: 'Jul 2025', revenue: 190000 },
                { month: 'Aug 2025', revenue: 185000 },
                { month: 'Sep 2025', revenue: 200000 },
                { month: 'Oct 2025', revenue: 215000 },
                { month: 'Nov 2025', revenue: 230000 },
                { month: 'Dec 2025', revenue: 250000 },
                { month: 'Jan 2026', revenue: 280000 },
            ];

            const currentRev = dummyHistory[dummyHistory.length - 1].revenue;
            const lastMonthRev = dummyHistory[dummyHistory.length - 2].revenue;
            const lastYearRev = dummyHistory[0].revenue;

            const mom = lastMonthRev > 0 ? ((currentRev - lastMonthRev) / lastMonthRev) * 100 : 0;
            const yoy = lastYearRev > 0 ? ((currentRev - lastYearRev) / lastYearRev) * 100 : 0;

            setMetrics({
                mrr: currentRev,
                mom,
                yoy,
                history: dummyHistory.slice(-12),
            });
        } catch (error) {
            console.error('Error loading growth metrics:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderMetricCard = (label: string, value: string, subValue: string, isPositive: boolean) => (
        <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            <View style={styles.subValueContainer}>
                <Ionicons
                    name={isPositive ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color={isPositive ? '#10b981' : '#ef4444'}
                />
                <Text style={[styles.subValue, { color: isPositive ? '#10b981' : '#ef4444' }]}>
                    {subValue}
                </Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.navTitle}>Growth Analytics</Text>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#dc2626" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.kpiRow}>
                        {renderMetricCard(
                            'Monthly Revenue',
                            `₹${(metrics.mrr / 1000).toFixed(1)}k`,
                            `${metrics.mom.toFixed(1)}% vs last month`,
                            metrics.mom >= 0
                        )}
                        {renderMetricCard(
                            'Yearly Growth',
                            `${metrics.yoy.toFixed(1)}%`,
                            'vs same month last year',
                            metrics.yoy >= 0
                        )}
                    </View>

                    <View style={styles.chartCard}>
                        <Text style={styles.chartTitle}>Revenue Trend (12 Months)</Text>
                        <View style={styles.lineChart}>
                            {metrics.history.map((item, index) => (
                                <View key={index} style={styles.linePointContainer}>
                                    <View
                                        style={[
                                            styles.lineBar,
                                            { height: (item.revenue / 300000) * 150 }
                                        ]}
                                    />
                                    <Text style={styles.monthLabel}>{item.month.split(' ')[0]}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View style={styles.tableCard}>
                        <Text style={styles.tableTitle}>Monthly Breakdown</Text>
                        {metrics.history.slice().reverse().map((item, index) => (
                            <View key={index} style={styles.tableRow}>
                                <Text style={styles.monthName}>{item.month}</Text>
                                <Text style={styles.monthRevenue}>₹{item.revenue.toLocaleString()}</Text>
                            </View>
                        ))}
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
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    content: {
        padding: 16,
    },
    kpiRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    metricLabel: {
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 8,
    },
    metricValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 4,
    },
    subValueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    subValue: {
        fontSize: 11,
        fontWeight: '600',
        marginLeft: 2,
    },
    chartCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
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
        marginBottom: 24,
    },
    lineChart: {
        flexDirection: 'row',
        height: 180,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    linePointContainer: {
        alignItems: 'center',
        width: '7.5%',
    },
    lineBar: {
        width: 6,
        backgroundColor: '#dc2626',
        borderRadius: 3,
    },
    monthLabel: {
        fontSize: 9,
        color: '#9ca3af',
        marginTop: 8,
        transform: [{ rotate: '-45deg' }],
    },
    tableCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
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
    tableRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    monthName: {
        fontSize: 14,
        color: '#4b5563',
    },
    monthRevenue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1f2937',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default GrowthScreen;
