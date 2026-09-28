import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { fetchChangelog } from '../firebase/changelogService';
import { useAuth } from '../context/AuthContext';
import { ChangelogEntry } from '../types';
import { AppText, Button, IconBadge, Sheet, colors, space } from '../ui';

export const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** Shows the newest changelog entry once per app version, after sign-in. */
const WhatIsNewModal = () => {
  const { user, profile } = useAuth();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;
    (async () => {
      try {
        if ((await AsyncStorage.getItem(LAST_SEEN_VERSION_KEY)) === APP_VERSION) return;
        const [latest] = await fetchChangelog(1);
        if (!cancelled && latest) setEntry(latest);
      } catch (error) {
        console.warn('[WhatIsNew] Could not load changelog:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  const close = async () => {
    setEntry(null);
    await AsyncStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION).catch(() => {});
  };

  return (
    <Sheet visible={!!entry} onClose={close} footer={<Button title="Got it" onPress={close} fullWidth size="lg" />}>
      {entry ? (
        <View style={{ alignItems: 'center', paddingBottom: space.md }}>
          <IconBadge icon="sparkles" size={56} bg={colors.goldSoft} fg={colors.gold} />
          <AppText variant="overline" tone="gold" style={{ marginTop: space.lg }}>
            What’s new{entry.version ? ` · v${entry.version}` : ''}
          </AppText>
          <AppText variant="title1" align="center" style={{ marginTop: space.sm }}>
            {entry.title}
          </AppText>
          {entry.description ? (
            <AppText variant="body" tone="soft" align="center" style={{ marginTop: space.md }}>
              {entry.description}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
};

export default WhatIsNewModal;
