// History: every send, in its own card, with its status. Only real
// sends show up here.

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '../navigation/AppNavigator';
import { loadHistory, type HistoryEntry } from '../store/history';
import { formatUsd } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { Screen } from '../components/ui';
import { useFocusEffect } from '@react-navigation/native';

type Props = BottomTabScreenProps<TabParamList, 'HistoryTab'>;

const STATUS_LABEL: Record<string, { label: string; good: boolean }> = {
  pending: { label: 'Pending', good: false },
  sent: { label: 'Confirmed', good: true },
  refunded: { label: 'Refunded', good: false },
  failed: { label: 'Failed', good: false },
};

export function HistoryScreen(_props: Props) {
  const { palette } = useTheme();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent'>('all');

  const load = useCallback(() => {
    loadHistory().then(setEntries);
  }, []);

  useFocusEffect(load);
  useEffect(load, [load]);

  const shown = entries.filter((e) =>
    filter === 'all' ? true : filter === 'pending' ? e.status === 'pending' : e.status === 'sent',
  );

  const grouped = new Map<string, HistoryEntry[]>();
  for (const e of shown) {
    const day = new Date(e.date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const list = grouped.get(day) ?? [];
    list.push(e);
    grouped.set(day, list);
  }

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        <Text style={{ fontFamily: FONTS.display, fontSize: 27, color: palette.ink, flex: 1 }}>
          Activity
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {(['all', 'pending', 'sent'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={{
              borderWidth: 2,
              borderColor: filter === f ? palette.accent : palette.line,
              backgroundColor: filter === f ? palette.accentSoft : palette.surface,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 16,
              minHeight: 44,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.heading,
                fontSize: 14,
                color: filter === f ? palette.accent : palette.ink,
                textTransform: 'capitalize',
              }}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </View>
      {shown.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Pip expression="happy" size={96} />
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 15,
              color: palette.muted,
              textAlign: 'center',
              marginTop: 14,
            }}
          >
            Nothing yet. Your sends will show up here.
          </Text>
        </View>
      ) : (
        Array.from(grouped.entries()).map(([day, list]) => (
          <View key={day}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 18,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16.5, color: palette.ink }}>
                {day}
              </Text>
            </View>
            {list.map((e) => {
              const st = STATUS_LABEL[e.status];
              return (
                <View
                  key={e.requestId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 11,
                    borderBottomWidth: 1,
                    borderBottomColor: palette.line,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: palette.soft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, color: palette.accent }}>↗</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: palette.ink }}>
                      Sent
                    </Text>
                    <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
                      To: {e.toName} · {e.toNetwork}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: FONTS.heading, fontSize: 15.5, color: palette.ink }}>
                      −{formatUsd(e.usd)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '800',
                        fontFamily: FONTS.heading,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 999,
                        marginTop: 5,
                        backgroundColor: st.good ? palette.goodSoft : palette.accentSoft,
                        color: st.good ? palette.good : palette.accent,
                      }}
                    >
                      {st.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}
