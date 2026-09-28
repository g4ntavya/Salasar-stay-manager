import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchChangelog } from '../src/firebase/changelogService';
import { ChangelogEntry } from '../src/types';
import { AppText, Card, EmptyState, NavBar, Screen, SkeletonList, colors, radius, space } from '../src/ui';

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** Release notes, newest first, on a simple timeline. */
const ChangelogScreen = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChangelog()
      .then(setEntries)
      .catch(err => console.error('Error fetching changelog:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavBar title="What's new" />
      <Screen edges={[]} contentStyle={{ paddingTop: space.sm, paddingBottom: space.huge }}>
        {loading ? (
          <SkeletonList count={3} height={110} />
        ) : entries.length === 0 ? (
          <EmptyState icon="sparkles-outline" title="Nothing yet" message="Release notes will appear here after the next update." />
        ) : (
          entries.map((e, i) => (
            <View key={e.id} style={styles.entry}>
              <View style={styles.rail}>
                <View style={[styles.dot, i === 0 && styles.dotLatest]} />
                {i < entries.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <Card style={styles.card}>
                <View style={styles.head}>
                  {e.version ? (
                    <View style={styles.version}>
                      <AppText variant="caption" tone="gold">
                        v{e.version}
                      </AppText>
                    </View>
                  ) : null}
                  <AppText variant="caption" tone="muted">
                    {fmt(e.created_at)}
                  </AppText>
                </View>
                <AppText variant="title3" style={{ marginTop: space.sm }}>
                  {e.title}
                </AppText>
                {e.description ? (
                  <AppText variant="body" tone="soft" style={{ marginTop: space.xs }}>
                    {e.description}
                  </AppText>
                ) : null}
              </Card>
            </View>
          ))
        )}
      </Screen>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: space.md },
  rail: { width: 14, alignItems: 'center', paddingTop: space.xl },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.lineStrong },
  dotLatest: { backgroundColor: colors.brand },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 4 },
  card: { flex: 1, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  version: { backgroundColor: colors.goldSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
});

export default ChangelogScreen;
