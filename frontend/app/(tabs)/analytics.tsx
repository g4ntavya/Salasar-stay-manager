import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import RevenueLineChart from '../../src/components/RevenueLineChart';
import { fetchAnalyticsData, MonthlyStats } from '../../src/firebase/stats';
import { buildMonthSeries, formatMonthLabel, monthKey } from '../../src/utils/date';
import { computeGrowth } from '../../src/utils/growth';
import { getCached, setCached } from '../../src/utils/cache';
import { rebuildMonthlyStats } from '../../src/utils/rtdbService';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  Screen,
  ScreenHeader,
  Section,
  Segmented,
  Skeleton,
  StatTile,
  colors,
  formatRupees,
  radius,
  space,
} from '../../src/ui';

type PaymentFilter = 'ALL' | 'CASH' | 'UPI';

const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const AnalyticsScreen = () => {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const isGrowthUser = profile?.role === 'GROWTH';
  const isAdmin = profile?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL');
  const [data, setData] = useState<Record<string, MonthlyStats>>({});

  const monthSeries = useMemo(() => buildMonthSeries(12), []);
  const currentKey = useMemo(() => monthKey(new Date()), []);
  const prevKey = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return monthKey(d);
  }, []);
  const lastYearKey = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return monthKey(d);
  }, []);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const months = monthSeries.includes(lastYearKey) ? monthSeries : [...monthSeries, lastYearKey];
        const result = await fetchAnalyticsData(months, paymentFilter);
        setData(result);
        await setCached(`analytics:CHECKOUT:${paymentFilter}`, result);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [monthSeries, lastYearKey, paymentFilter]
  );

  // Cached numbers first, then a silent refresh.
  useEffect(() => {
    getCached<Record<string, MonthlyStats>>(`analytics:CHECKOUT:${paymentFilter}`).then(cached => {
      if (cached) {
        setData(cached);
        setLoading(false);
        loadData(true);
      } else {
        loadData();
      }
    });
  }, [paymentFilter, loadData]);

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await rebuildMonthlyStats();
      await loadData(true);
    } catch (error) {
      console.error('Rebuild failed:', error);
    } finally {
      setRebuilding(false);
    }
  };

  const current = data[currentKey] || { revenue: 0, bookingsCount: 0 };
  const previous = data[prevKey] || { revenue: 0, bookingsCount: 0 };
  const lastYear = data[lastYearKey] || { revenue: 0, bookingsCount: 0 };
  const mom = computeGrowth(current.revenue, previous.revenue);
  const yoy = computeGrowth(current.revenue, lastYear.revenue);
  const avgStay = current.bookingsCount ? current.revenue / current.bookingsCount : 0;
  const last6 = monthSeries.slice(-6);
  const hasAny = monthSeries.some(m => (data[m]?.revenue || 0) > 0);
  const filterLabel = paymentFilter === 'ALL' ? '' : paymentFilter === 'CASH' ? ' · cash only' : ' · UPI only';

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }}>
      <ScreenHeader
        title="Revenue"
        subtitle={`Realised at checkout${filterLabel}`}
        right={
          isGrowthUser ? (
            <IconButton icon="log-out-outline" onPress={() => signOut()} accessibilityLabel="Sign out" />
          ) : (
            <IconButton icon="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} accessibilityLabel="Close" />
          )
        }
      />

      <Segmented
        value={paymentFilter}
        onChange={setPaymentFilter}
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'CASH', label: 'Cash' },
          { value: 'UPI', label: 'UPI' },
        ]}
        style={{ marginBottom: space.lg }}
      />

      {/* This month */}
      <LinearGradient colors={[colors.brand, colors.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <AppText variant="overline" color="rgba(255,255,255,0.72)">
          {monthName(currentKey)}
        </AppText>
        {loading ? (
          <Skeleton width={180} height={40} style={{ marginTop: space.sm, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        ) : (
          <AppText variant="display" color={colors.inkInverse} style={{ marginTop: space.sm }}>
            {formatRupees(current.revenue)}
          </AppText>
        )}
        <View style={styles.heroFoot}>
          <AppText variant="footnote" color="rgba(255,255,255,0.82)">
            {current.bookingsCount} stay{current.bookingsCount === 1 ? '' : 's'} checked out
          </AppText>
          <View style={styles.growthChip}>
            <Ionicons name={mom.isNegative ? 'trending-down' : 'trending-up'} size={14} color={colors.inkInverse} />
            <AppText variant="caption" color={colors.inkInverse}>
              {mom.label} vs last month
            </AppText>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.tiles}>
        <StatTile label="Month on month" value={mom.label} icon={mom.isNegative ? 'trending-down-outline' : 'trending-up-outline'} hint={`Last month ${formatRupees(previous.revenue)}`} accent={mom.isNegative ? colors.danger : colors.success} style={styles.tile} />
        <StatTile label="Year on year" value={yoy.label} icon="calendar-outline" hint={`${formatMonthLabel(lastYearKey)}: ${formatRupees(lastYear.revenue)}`} accent={yoy.isNegative ? colors.danger : colors.success} style={styles.tile} />
      </View>
      <View style={styles.tiles}>
        <StatTile label="Average per stay" value={formatRupees(avgStay)} icon="bed-outline" hint="This month" accent={colors.gold} style={styles.tile} />
        <StatTile label="Stays this month" value={current.bookingsCount} icon="people-outline" hint={`${previous.bookingsCount} last month`} accent={colors.info} style={styles.tile} />
      </View>

      <Section title="Last 6 months" caption="Revenue by month of checkout">
        <Card>
          {loading ? <Skeleton height={200} /> : <RevenueLineChart labels={last6.map(formatMonthLabel)} data={last6.map(m => data[m]?.revenue || 0)} />}
        </Card>
      </Section>

      <Section title="Month by month">
        {!loading && !hasAny ? (
          <Card>
            <EmptyState
              icon="stats-chart-outline"
              title="No revenue yet"
              message="Revenue appears here as stays are checked out."
              action={isAdmin ? { label: rebuilding ? 'Syncing…' : 'Sync analytics', icon: 'sync-outline', onPress: handleRebuild } : undefined}
              style={{ paddingVertical: space.xl }}
            />
          </Card>
        ) : (
          <Card padded={false}>
            {[...monthSeries].reverse().map((m, i) => {
              const row = data[m] || { revenue: 0, bookingsCount: 0 };
              const share = Math.min(1, row.revenue / Math.max(1, ...monthSeries.map(k => data[k]?.revenue || 0)));
              return (
                <View key={m} style={[styles.monthRow, i > 0 && styles.monthRowLine]}>
                  <View style={{ width: 92 }}>
                    <AppText variant="callout">{formatMonthLabel(m)}</AppText>
                    <AppText variant="caption" tone="muted">
                      {row.bookingsCount} stay{row.bookingsCount === 1 ? '' : 's'}
                    </AppText>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: m === currentKey ? colors.brand : colors.brandTint }]} />
                  </View>
                  <AppText variant="bodyStrong" style={styles.monthValue} numberOfLines={1}>
                    {formatRupees(row.revenue)}
                  </AppText>
                </View>
              );
            })}
          </Card>
        )}
      </Section>

      {isAdmin && hasAny ? (
        <Button title={rebuilding ? 'Syncing…' : 'Sync analytics'} icon="sync-outline" variant="secondary" onPress={handleRebuild} loading={rebuilding} fullWidth />
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xxl, overflow: 'hidden' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
  growthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  tiles: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  tile: { borderWidth: 1, borderColor: colors.line },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  monthRowLine: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  monthValue: { width: 92, textAlign: 'right' },
});

export default AnalyticsScreen;
