import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface KpiCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    trend?: {
        value: string;
        isNegative: boolean;
    };
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, color, trend }) => {
    return (
        <View style={styles.card}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
                <Ionicons name={icon} size={24} color={color} />
            </View>
            <View style={styles.content}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.value}>{value}</Text>
                <View style={styles.footer}>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    {trend && (
                        <View style={styles.trendContainer}>
                            <Ionicons
                                name={trend.isNegative ? 'arrow-down' : 'arrow-up'}
                                size={12}
                                color={trend.isNegative ? '#ef4444' : '#10b981'}
                            />
                            <Text style={[
                                styles.trendText,
                                { color: trend.isNegative ? '#ef4444' : '#10b981' }
                            ]}>
                                {trend.value}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        width: (Dimensions.get('window').width - 48) / 2,
        minHeight: 110,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        position: 'absolute',
        top: 12,
        right: 12,
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 13,
        color: '#6b7280',
        fontWeight: '600',
        marginBottom: 4,
    },
    value: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
        marginBottom: 4,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    subtitle: {
        fontSize: 11,
        color: '#9ca3af',
    },
    trendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 0,
    },
    trendText: {
        fontSize: 11,
        fontWeight: '700',
        marginLeft: 2,
    },
});

export default KpiCard;
