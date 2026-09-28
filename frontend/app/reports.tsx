import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateField } from '../src/components/DateField';
import { exportCsv } from '../src/utils/exportCsv';
import { fetchReportData, normalizeBookingStatus } from '../src/utils/rtdbService';
import { TOTAL_ROOMS } from '../src/utils/roomConstants';
import { localDay } from '../src/utils/date';
import * as RevenueService from '../src/utils/RevenueService';
import {
  AppText,
  Avatar,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  IconButton,
  NavBar,
  Screen,
  Section,
  Segmented,
  SkeletonList,
  StatTile,
  colors,
  formatRupees,
  space,
} from '../src/ui';

type ReportTab = 'Revenue' | 'Occupancy' | 'Checkins';
type Preset = '7D' | '30D' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM';

const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const presetRange = (p: Preset): [Date, Date] | null => {
  const today = startOf(new Date());
  if (p === '7D') return [new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), today];
  if (p === '30D') return [new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), today];
  if (p === 'MONTH') return [new Date(today.getFullYear(), today.getMonth(), 1), today];
  if (p === 'LAST_MONTH') return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)];
  return null;
};
const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const DAY = 86400000;

const ReportsScreen = () => {
  const [tab, setTab] = useState<ReportTab>('Revenue');
  const [preset, setPreset] = useState<Preset>('30D');
  const [[startDate, endDate], setRange] = useState<[Date, Date]>(presetRange('30D')!);
  const [loading, setLoading] = useState(false);
  const [checkedOut, setCheckedOut] = useState<any[]>([]);
  const [checkedIn, setCheckedIn] = useState<any[]>([]);

  // Two indexed range queries per date range; switching tabs reuses the data.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReportData(startDate, endDate)
      .then(res => {
        if (cancelled) return;
        setCheckedOut(res.checkedOut);
        setCheckedIn(res.checkedIn);
      })
      .catch(err => {
        console.error('Error generating report:', err);
        Alert.alert('Could not load report', 'Check your connection and try again.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const revenue = useMemo(() => RevenueService.getLiveRevenueReport(checkedOut, startDate, endDate), [checkedOut, startDate, endDate]);

  const occupancy = useMemo(() => {
    const rangeStart = startOf(startDate).getTime();
    const rangeEnd = startOf(endDate).getTime() + DAY;
    const days = Math.round((rangeEnd - rangeStart) / DAY);
    const live = checkedIn.filter(b => normalizeBookingStatus(b.status) !== 'CANCELLED');
    let roomNights = 0;
    let stayNights = 0;
    const stays = new Set<string>();
    for (const b of live) {
      const a = startOf(new Date(b.checkInDate)).getTime();
      const z = startOf(new Date(b.check_out_actual || b.checkOutDate)).getTime();
      if (isNaN(a) || isNaN(z)) continue;
      const nights = Math.max(1, Math.round((z - a) / DAY));
      roomNights += Math.max(0, Math.min(rangeEnd, a + nights * DAY) - Math.max(rangeStart, a)) / DAY;
      const key = b.stayId || `${b.customerId}_${b.checkInDay}`;
      if (!stays.has(key)) {
        stays.add(key);
        stayNights += nights;
      }
    }
    const capacity = TOTAL_ROOMS * days;
    return {
      rate: capacity ? Math.min(100, Math.round((roomNights / capacity) * 100)) : 0,
      roomNights: Math.round(roomNights),
      days,
      avgStay: stays.size ? stayNights / stays.size : 0,
      checkins: stays.size,
      checkedOutCount: live.filter(b => normalizeBookingStatus(b.status) === 'CHECKED_OUT').length,
      cancelled: checkedIn.filter(b => normalizeBookingStatus(b.status) === 'CANCELLED').length,
    };
  }, [checkedIn, startDate, endDate]);

  const byDay = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    revenue.bookings.forEach(b => {
      const d = map.get(b.checkoutDate) || { amount: 0, count: 0 };
      d.amount += b.amount;
      d.count += 1;
      map.set(b.checkoutDate, d);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [revenue.bookings]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const r = presetRange(p);
    if (r) setRange(r);
  };

  const handleExportCSV = async () => {
    if (revenue.bookings.length === 0) {
      Alert.alert('Nothing to export', 'There are no checked-out stays in this period.');
      return;
    }
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csv = 'Checkout Date,Guest Name,Mobile,Room,Amount,Cash,UPI,Entered As\n';
    revenue.bookings.forEach(b => {
      csv += `${b.checkoutDate},${q(b.guestName)},${q(b.mobile)},${q(b.room)},${b.amount},${b.cash},${b.upi},${q(b.amountRaw)}\n`;
    });
    await exportCsv(csv, `Revenue_${localDay(startDate)}_to_${localDay(endDate)}`, { dialogTitle: 'Save report', showSuccessAlert: true });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavBar title="Reports" subtitle={`${fmt(startDate)} – ${fmt(endDate)}`} right={<IconButton icon="download-outline" onPress={handleExportCSV} accessibilityLabel="Export revenue as CSV" />} />
      <Screen edges={[]} contentStyle={{ paddingBottom: space.huge }}>
        <ChipRow style={{ marginBottom: space.md }}>
          {([
            ['7D', 'Last 7 days'],
            ['30D', 'Last 30 days'],
            ['MONTH', 'This month'],
            ['LAST_MONTH', 'Last month'],
            ['CUSTOM', 'Custom'],
          ] as [Preset, string][]).map(([p, label]) => (
            <Chip key={p} label={label} selected={preset === p} onPress={() => choosePreset(p)} />
          ))}
        </ChipRow>

        {preset === 'CUSTOM' ? (
          <View style={styles.pair}>
            <DateField label="From" value={startDate} maximumDate={endDate} onChange={d => setRange(([, e]) => [startOf(d), e])} style={{ flex: 1 }} />
            <DateField label="To" value={endDate} minimumDate={startDate} maximumDate={new Date()} onChange={d => setRange(([st]) => [st, startOf(d)])} style={{ flex: 1 }} />
          </View>
        ) : null}

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'Revenue', label: 'Revenue' },
            { value: 'Occupancy', label: 'Occupancy' },
            { value: 'Checkins', label: 'Check-ins' },
          ]}
          style={{ marginBottom: space.lg }}
        />

        {loading ? (
          <SkeletonList count={3} height={90} />
        ) : tab === 'Revenue' ? (
          <>
            <Card style={{ marginBottom: space.md }}>
              <AppText variant="caption" tone="soft">
                Total revenue · {revenue.totalBookings} stay{revenue.totalBookings === 1 ? '' : 's'} checked out
              </AppText>
              <AppText variant="display" style={{ marginTop: space.xs }}>
                {formatRupees(revenue.totalRevenue)}
              </AppText>
              <View style={styles.split}>
                <View style={[styles.splitBar, { flex: Math.max(revenue.cashRevenue, 0.0001), backgroundColor: colors.gold }]} />
                <View style={[styles.splitBar, { flex: Math.max(revenue.upiRevenue, 0.0001), backgroundColor: colors.brand }]} />
              </View>
              <View style={styles.pair}>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" tone="muted">
                    Cash
                  </AppText>
                  <AppText variant="bodyStrong">{formatRupees(revenue.cashRevenue)}</AppText>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <AppText variant="caption" tone="muted">
                    UPI
                  </AppText>
                  <AppText variant="bodyStrong">{formatRupees(revenue.upiRevenue)}</AppText>
                </View>
              </View>
            </Card>

            {revenue.bookings.length === 0 ? (
              <Card>
                <EmptyState icon="receipt-outline" title="No checkouts" message="No stays were checked out in this period." style={{ paddingVertical: space.xl }} />
              </Card>
            ) : (
              byDay.map(([day, totals]) => (
                <Section key={day} title={fmtDay(day)} caption={`${totals.count} stay${totals.count === 1 ? '' : 's'} · ${formatRupees(totals.amount)}`} style={{ marginBottom: space.lg }}>
                  <Card padded={false}>
                    {revenue.bookings
                      .filter(b => b.checkoutDate === day)
                      .map((b, i) => (
                        <View key={b.id} style={[styles.row, i > 0 && styles.rowLine]}>
                          <Avatar name={b.guestName} size={38} />
                          <View style={{ flex: 1 }}>
                            <AppText variant="bodyStrong" numberOfLines={1}>
                              {b.guestName}
                            </AppText>
                            <AppText variant="caption" tone="muted" numberOfLines={1}>
                              Room {b.room}
                              {b.cash > 0 && b.upi > 0 ? ` · Cash ${formatRupees(b.cash)} + UPI ${formatRupees(b.upi)}` : b.upi > 0 ? ' · UPI' : ' · Cash'}
                            </AppText>
                          </View>
                          <AppText variant="bodyStrong">{formatRupees(b.amount)}</AppText>
                        </View>
                      ))}
                  </Card>
                </Section>
              ))
            )}
          </>
        ) : tab === 'Occupancy' ? (
          <>
            <View style={styles.tiles}>
              <StatTile label="Occupancy" value={`${occupancy.rate}%`} icon="bed-outline" hint={`${TOTAL_ROOMS} rooms × ${occupancy.days} days`} style={styles.tile} />
              <StatTile label="Room-nights" value={occupancy.roomNights} icon="moon-outline" hint="Sold in this period" accent={colors.gold} style={styles.tile} />
            </View>
            <View style={styles.tiles}>
              <StatTile label="Average stay" value={occupancy.avgStay ? `${occupancy.avgStay.toFixed(1)} n` : '—'} icon="time-outline" hint="Nights per stay" accent={colors.info} style={styles.tile} />
              <StatTile label="Stays started" value={occupancy.checkins} icon="log-in-outline" hint="Check-ins in period" accent={colors.success} style={styles.tile} />
            </View>
            <AppText variant="caption" tone="muted" style={{ marginTop: space.md }}>
              Based on stays that started in this period.
            </AppText>
          </>
        ) : (
          <>
            <View style={styles.tiles}>
              <StatTile label="Check-ins" value={occupancy.checkins} icon="log-in-outline" hint="Stays started" accent={colors.success} style={styles.tile} />
              <StatTile label="Checked out" value={revenue.totalBookings} icon="log-out-outline" hint="Stays completed" accent={colors.brand} style={styles.tile} />
            </View>
            <View style={styles.tiles}>
              <StatTile label="Cancelled" value={occupancy.cancelled} icon="close-circle-outline" hint="In this period" accent={colors.danger} style={styles.tile} />
              <StatTile label="Avg. revenue" value={formatRupees(revenue.totalBookings ? revenue.totalRevenue / revenue.totalBookings : 0)} icon="wallet-outline" hint="Per completed stay" accent={colors.gold} style={styles.tile} />
            </View>
          </>
        )}

      </Screen>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md },
  split: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 3, marginTop: space.lg, marginBottom: space.md },
  splitBar: { height: 8, borderRadius: 4 },
  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  tile: { borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
});

export default ReportsScreen;
