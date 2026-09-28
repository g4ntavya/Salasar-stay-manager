import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/context/AuthContext';
import LoadingSpinner from '../../src/components/LoadingSpinner';
import { rebuildMonthlyStats, repairRoomStatuses } from '../../src/utils/rtdbService';
import { AppText, Avatar, Button, Card, Divider, IconBadge, ListItem, NavBar, Screen, StatusPill, colors, haptic, space } from '../../src/ui';

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrator', STAFF: 'Front desk', GROWTH: 'Insights' };

const ProfileScreen = () => {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const [busy, setBusy] = useState<'sync' | 'repair' | null>(null);
  const isAdmin = profile?.role === 'ADMIN';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (!profile) return <LoadingSpinner message="Loading profile…" />;

  const handleSignOut = () =>
    Alert.alert('Sign out', 'Guest data cached on this phone will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/login');
          } catch {
            Alert.alert('Could not sign out', 'Please try again.');
          }
        },
      },
    ]);

  const runSync = () =>
    Alert.alert('Sync analytics', 'Recalculates all revenue totals from every booking. This can take a moment.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sync now',
        onPress: async () => {
          setBusy('sync');
          try {
            const result = await rebuildMonthlyStats();
            haptic.success();
            Alert.alert('Analytics synced', `Recalculated from ${result?.count || 0} completed stays.`);
          } catch {
            Alert.alert('Sync failed', 'Check your connection and try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const runRepair = () =>
    Alert.alert('Repair room status', "Matches every room's occupied/free status to the open bookings. No guest is checked out.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Repair',
        onPress: async () => {
          setBusy('repair');
          try {
            const res = await repairRoomStatuses();
            haptic.success();
            Alert.alert('Done', res.repaired > 0 ? `Corrected ${res.repaired} room(s).` : 'All room statuses were already correct.');
          } catch {
            Alert.alert('Repair failed', 'Check your connection and try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      <View style={{ marginHorizontal: -20 }}>
        <NavBar title="Profile" />
      </View>

      <Card style={styles.hero}>
        <Avatar name={profile.full_name} size={72} />
        <View style={{ flex: 1 }}>
          <AppText variant="title2" numberOfLines={2}>
            {profile.full_name}
          </AppText>
          <AppText variant="footnote" tone="muted" numberOfLines={1} style={{ marginVertical: 2 }}>
            {profile.email}
          </AppText>
          <StatusPill tone={isAdmin ? 'reserved' : 'available'} label={ROLE_LABEL[profile.role] || profile.role} size="sm" />
        </View>
      </Card>

      <AppText variant="overline" tone="muted" style={styles.groupLabel}>
        Insights
      </AppText>
      <Card padded={false} style={styles.group}>
        <ListItem
          title="Revenue analytics"
          subtitle="Monthly revenue, growth and Cash/UPI split"
          leading={<IconBadge icon="trending-up-outline" />}
          onPress={() => router.push('/analytics')}
          style={styles.item}
        />
        <Divider inset={68} />
        <ListItem
          title="Reports"
          subtitle="Revenue and occupancy by date range, CSV export"
          leading={<IconBadge icon="document-text-outline" bg={colors.goldSoft} fg={colors.gold} />}
          onPress={() => router.push('/reports')}
          style={styles.item}
        />
      </Card>

      {isAdmin ? (
        <>
          <AppText variant="overline" tone="muted" style={styles.groupLabel}>
            Admin tools
          </AppText>
          <Card padded={false} style={styles.group}>
            <ListItem
              title={busy === 'sync' ? 'Syncing…' : 'Sync analytics'}
              subtitle="Rebuild revenue totals from all bookings"
              leading={<IconBadge icon="sync-outline" bg={colors.successSoft} fg={colors.success} />}
              onPress={busy ? undefined : runSync}
              style={styles.item}
            />
            <Divider inset={68} />
            <ListItem
              title={busy === 'repair' ? 'Repairing…' : 'Repair room status'}
              subtitle="Fix rooms stuck as occupied or free"
              leading={<IconBadge icon="construct-outline" bg={colors.warningSoft} fg={colors.warning} />}
              onPress={busy ? undefined : runRepair}
              style={styles.item}
            />
            <Divider inset={68} />
            <ListItem
              title="Sync & storage"
              subtitle="Pending photo uploads, photo server, cache"
              leading={<IconBadge icon="cloud-done-outline" bg={colors.infoSoft} fg={colors.info} />}
              onPress={() => router.push('/app-health')}
              style={styles.item}
            />
          </Card>
        </>
      ) : null}

      <AppText variant="overline" tone="muted" style={styles.groupLabel}>
        App
      </AppText>
      <Card padded={false} style={styles.group}>
        <ListItem
          title="What's new"
          subtitle="Recent updates to the app"
          leading={<IconBadge icon="sparkles-outline" bg={colors.goldSoft} fg={colors.gold} />}
          onPress={() => router.push('/changelog')}
          style={styles.item}
        />
        <Divider inset={68} />
        <ListItem
          title="Version"
          leading={<IconBadge icon="information-circle-outline" bg={colors.surfaceAlt} fg={colors.inkSoft} />}
          trailing={
            <AppText variant="callout" tone="muted">
              {version}
            </AppText>
          }
          chevron={false}
          style={styles.item}
        />
      </Card>

      <Button title="Sign out" icon="log-out-outline" variant="danger" onPress={handleSignOut} fullWidth style={{ marginTop: space.lg }} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.sm },
  groupLabel: { marginTop: space.xxl, marginBottom: space.sm, marginLeft: space.xs },
  group: { paddingHorizontal: space.lg },
  item: { paddingVertical: space.md + 2 },
});

export default ProfileScreen;
