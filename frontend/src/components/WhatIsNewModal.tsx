import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { fetchChangelog } from '../firebase/changelogService';
import { ChangelogEntry } from '../types';

const STORAGE_KEY = 'lastSeenVersion';
const CURRENT_APP_VERSION = '1.0.0'; // Should match app.json

const WhatIsNewModal = () => {
    const [visible, setVisible] = useState(false);
    const [latestEntry, setLatestEntry] = useState<ChangelogEntry | null>(null);

    useEffect(() => {
        checkVersion();
    }, []);

    const checkVersion = async () => {
        try {
            const lastSeen = await AsyncStorage.getItem(STORAGE_KEY);

            // If version changed, show what's new
            if (lastSeen !== CURRENT_APP_VERSION) {
                const entries = await fetchChangelog();
                if (entries.length > 0) {
                    // Check if the latest entry version is newer than last seen
                    // For simplicity, we show the modal if lastSeen is different
                    setLatestEntry(entries[0]);
                    setVisible(true);
                }
            }
        } catch (error) {
            console.error('Error checking version:', error);
        }
    };

    const handleClose = async () => {
        await AsyncStorage.setItem(STORAGE_KEY, CURRENT_APP_VERSION);
        setVisible(false);
    };

    if (!latestEntry) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Ionicons name="sparkles" size={32} color="#dc2626" />
                        <Text style={styles.title}>What's New!</Text>
                        <Text style={styles.version}>v{latestEntry.version}</Text>
                    </View>

                    <ScrollView style={styles.scroll}>
                        <Text style={styles.entryTitle}>{latestEntry.title}</Text>
                        <Text style={styles.description}>{latestEntry.description}</Text>
                    </ScrollView>

                    <TouchableOpacity style={styles.button} onPress={handleClose}>
                        <Text style={styles.buttonText}>Awesome!</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    content: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 8,
    },
    header: {
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
        marginTop: 8,
    },
    version: {
        fontSize: 14,
        color: '#dc2626',
        fontWeight: '600',
        marginTop: 2,
    },
    scroll: {
        marginBottom: 20,
    },
    entryTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 8,
    },
    description: {
        fontSize: 15,
        color: '#4b5563',
        lineHeight: 22,
    },
    button: {
        backgroundColor: '#dc2626',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default WhatIsNewModal;
