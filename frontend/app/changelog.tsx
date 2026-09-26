import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchChangelog } from '../src/firebase/changelogService';
import { ChangelogEntry } from '../src/types';
import { formatDate } from '../src/utils/dateHelper';

const ChangelogScreen = () => {
    const router = useRouter();
    const [entries, setEntries] = useState<ChangelogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadChangelog();
    }, []);

    const loadChangelog = async () => {
        try {
            const data = await fetchChangelog();
            setEntries(data);
        } catch (error) {
            console.error('Error fetching changelog:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: ChangelogEntry }) => (
        <View style={styles.entryCard}>
            <View style={styles.header}>
                <Text style={styles.title}>{item.title}</Text>
                <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>{item.version}</Text>
                </View>
            </View>
            <Text style={styles.date}>{item.created_at ? formatDate(item.created_at) : ''}</Text>
            <Text style={styles.description}>{item.description}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.navTitle}>Changelog</Text>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#dc2626" />
                </View>
            ) : (
                <FlatList
                    data={entries}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="list-outline" size={48} color="#9ca3af" />
                            <Text style={styles.emptyText}>No changelog entries found.</Text>
                        </View>
                    }
                />
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
    listContent: {
        padding: 16,
    },
    entryCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
        flex: 1,
        marginRight: 8,
    },
    versionBadge: {
        backgroundColor: '#dbeafe',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    versionText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1e40af',
    },
    date: {
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 12,
    },
    description: {
        fontSize: 14,
        color: '#4b5563',
        lineHeight: 20,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 100,
    },
    emptyText: {
        marginTop: 12,
        color: '#6b7280',
        fontSize: 16,
    },
});

export default ChangelogScreen;
