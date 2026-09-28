import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RtdbRoom } from '../utils/rtdbService';
import { AppText, PressableScale, colors, haptic, radius, space } from '../ui';

const FLOOR_ORDER = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Halls & basement'];
const floorOf = (n: string) =>
  /^\d{1,2}$/.test(n) ? 'Ground floor' : /^1\d{2}$/.test(n) ? 'First floor' : /^2\d{2}$/.test(n) ? 'Second floor' : /^3\d{2}$/.test(n) ? 'Third floor' : 'Halls & basement';

const AC_ROOMS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '101', '102', '103', '105', '106', '107', '110', '112', '114', '115', '116', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '303', '304', '306', '307', '108', '109']);

/** Short room description, e.g. "AC · 3 beds" (special halls are named). */
export const roomInfo = (room: RtdbRoom) => {
  const n = room.room_no;
  if (n === '302') return 'Small hall';
  if (n === '304') return 'Hall · AC';
  const type = (room.type || '').toUpperCase();
  const isBasement = n.toLowerCase().includes('basement') || n.toLowerCase().startsWith('cb') || type.includes('BASEMENT') || type.includes('COMMON');
  if (isBasement) return 'Common';
  const ac = n === '107' || n === '110' ? '' : type.includes('NON AC') || type.includes('NON-AC') ? 'Non AC' : type.includes('AC') || AC_ROOMS.has(n) ? 'AC' : '';
  const beds = room.beds > 0 ? `${room.beds} bed${room.beds === 1 ? '' : 's'}` : '';
  return [ac, beds].filter(Boolean).join(' · ');
};

const COLUMNS = 3;
const GAP = space.sm;

export interface RoomPickerProps {
  rooms: RtdbRoom[];
  selected: Set<string>;
  unavailable: Set<string>;
  onToggle: (room: RtdbRoom) => void;
}

/** Rooms grouped by floor; tap to select or deselect. Booked rooms are shown but disabled. */
export const RoomPicker: React.FC<RoomPickerProps> = ({ rooms, selected, unavailable, onToggle }) => {
  const [width, setWidth] = useState(0);
  const tileW = width ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  const floors = useMemo(() => {
    const map = new Map<string, RtdbRoom[]>();
    rooms.forEach(r => {
      const f = floorOf(r.room_no);
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(r);
    });
    return FLOOR_ORDER.filter(f => map.has(f)).map(f => ({ floor: f, rooms: map.get(f)! }));
  }, [rooms]);

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {tileW > 0
        ? floors.map((f, fi) => (
            <View key={f.floor} style={fi > 0 && { marginTop: space.xl }}>
              <AppText variant="caption" tone="soft" style={{ marginBottom: space.sm }}>
                {f.floor}
              </AppText>
              <View style={styles.grid}>
                {f.rooms.map(room => {
                  const off = unavailable.has(room.room_no);
                  const on = !off && selected.has(room.room_no);
                  const info = roomInfo(room);
                  return (
                    <PressableScale
                      key={room.key}
                      onPress={() => {
                        haptic.tap();
                        onToggle(room);
                      }}
                      disabled={off}
                      scaleTo={0.95}
                      style={[styles.tile, { width: tileW }, on && styles.tileOn, off && styles.tileOff]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: off }}
                      accessibilityLabel={`Room ${room.room_no}${info ? `, ${info}` : ''}${off ? ', booked' : ''}`}
                    >
                      <AppText variant="bodyStrong" color={on ? colors.inkInverse : off ? colors.inkMuted : colors.ink} numberOfLines={1} style={styles.no}>
                        {room.room_no.replace(/^Basement\s*/i, 'B')}
                      </AppText>
                      <AppText variant="caption" color={on ? 'rgba(255,255,255,0.8)' : colors.inkMuted} numberOfLines={1} style={styles.info}>
                        {off ? 'Booked' : info || ' '}
                      </AppText>
                      {on ? (
                        <View style={styles.tick}>
                          <Ionicons name="checkmark" size={12} color={colors.brand} />
                        </View>
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ))
        : null}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md - 2,
    paddingVertical: space.sm + 2,
    justifyContent: 'center',
  },
  tileOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tileOff: { backgroundColor: colors.surfaceAlt, borderColor: 'transparent' },
  no: { fontSize: 17 },
  info: { fontSize: 11, letterSpacing: -0.1 },
  tick: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});

