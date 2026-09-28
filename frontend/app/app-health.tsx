import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getUploadStats, uploadQueue, UPLOAD_QUEUE_STORAGE_KEY } from '../src/utils/uploadQueue';
import { isMediaServerConfigured } from '../src/utils/imageStorage';
import { clearAllCache } from '../src/utils/cache';
import { Button, Card, IconBadge, InfoRow, NavBar, Screen, AppText, StatusPill, colors, haptic, space } from '../src/ui';

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Admin diagnostics: pending photo uploads, photo server status and local cache. */
export default function AppHealthScreen() {
  const [uploads, setUploads] = useState(getUploadStats());
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setUploads(getUploadStats());
    try {
      const keys = await AsyncStorage.getAllKeys();
      const items = await AsyncStorage.multiGet(keys);
      setCacheBytes(items.reduce((sum, [k, v]) => sum + (k.length + (v?.length || 0)) * 2, 0));
    } catch {
      setCacheBytes(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );
  useEffect(() => {
    const t = setInterval(() => setUploads(getUploadStats()), 3000);
    return () => clearInterval(t);
  }, []);

  const clearCache = () =>
    Alert.alert('Clear cached data', 'Lists reload from the server on next open. Photos still waiting to upload are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAllCache([UPLOAD_QUEUE_STORAGE_KEY, 'userProfile', 'lastSeenVersion']).catch(() => {});
          haptic.success();
          refresh();
        },
      },
    ]);

  const mediaOk = isMediaServerConfigured();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavBar title="Sync & storage" />
      <Screen edges={[]} contentStyle={{ paddingTop: space.sm, paddingBottom: space.huge }}>
        <Card style={styles.card}>
          <View style={styles.head}>
            <IconBadge icon="cloud-upload-outline" bg={uploads.pending ? colors.warningSoft : colors.successSoft} fg={uploads.pending ? colors.warning : colors.success} />
            <View style={{ flex: 1 }}>
              <AppText variant="title3">ID photo uploads</AppText>
              <AppText variant="footnote" tone="muted">
                {uploads.pending ? `${uploads.pending} photo${uploads.pending === 1 ? '' : 's'} waiting on this phone` : 'Everything is uploaded'}
              </AppText>
            </View>
            <StatusPill tone={uploads.pending ? 'reserved' : 'available'} label={uploads.pending ? 'Pending' : 'Synced'} size="sm" />
          </View>
          {uploads.lastError ? (
            <AppText variant="caption" tone="danger" style={{ marginTop: space.md }}>
              Last error: {uploads.lastError}
            </AppText>
          ) : null}
          {uploads.pending ? (
            <Button
              title="Retry uploads now"
              icon="refresh"
              variant="tonal"
              onPress={() => {
                uploadQueue.kick(true);
                haptic.press();
                setTimeout(() => setUploads(getUploadStats()), 1500);
              }}
              style={{ marginTop: space.lg }}
              fullWidth
            />
          ) : null}
        </Card>

        <Card style={styles.card}>
          <InfoRow icon="server-outline" label="Photo server" value={<StatusPill tone={mediaOk ? 'available' : 'cancelled'} label={mediaOk ? 'Configured' : 'Not set'} size="sm" />} />
          <InfoRow icon="phone-portrait-outline" label="Cached on this phone" value={cacheBytes == null ? '—' : formatSize(cacheBytes)} />
          <InfoRow icon="information-circle-outline" label="App version" value={`${Constants.expoConfig?.version ?? ''} · ${Platform.OS === 'android' ? 'Android' : Platform.OS}`} last />
        </Card>

        <Button title="Clear cached data" icon="trash-outline" variant="secondary" onPress={clearCache} fullWidth />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
