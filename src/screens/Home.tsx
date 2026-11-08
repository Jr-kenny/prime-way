// Home: the big USD total balance card at the very top, then
// Deposit + Send, then the assets. Real balances only.

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { fetchBalances, type AssetBalance } from '../lib/balances';
import { formatToken, formatUsd, shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { Screen, SectionLabel } from '../components/ui';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'HomeTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address, source } = useWallet();
  const [assets, setAssets] = useState<AssetBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!address) {
      setAssets([]);
      setTotalUsd(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetchBalances(address);
      setAssets(res.assets);
      setTotalUsd(res.totalUsd);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View
        style={{
          backgroundColor: palette.balcard,
          borderRadius: 26,
          padding: 22,
          paddingBottom: 0,
          overflow: 'hidden',
        }}
      >
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: palette.ink, opacity: 0.85 }}>
          Total balance
        </Text>
        <Text
          style={{
            fontFamily: FONTS.display,
            fontSize: 46,
            letterSpacing: -0.9,
            color: palette.ink,
            marginTop: 4,
          }}
        >
          {totalUsd === null ? '—' : formatUsd(totalUsd)}{' '}
          <Text style={{ fontSize: 22, color: palette.muted }}>USD</Text>
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: palette.line,
            marginTop: 16,
            paddingVertical: 13,
          }}
        >
          <Text style={{ fontWeight: '700', color: palette.ink, fontSize: 14 }}>
            {source === 'privy' ? 'Privy wallet' : source === 'imported' ? 'Imported wallet' : 'No wallet yet'}
          </Text>
          <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 13.5 }}>
            {address ? shortAddress(address) : ''}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
        <Pressable
          onPress={() => navigation.navigate('Deposit')}
          style={({ pressed }) => ({
            flex: 1,
            borderWidth: 1.5,
            borderColor: palette.line,
            backgroundColor: palette.surface,
            borderRadius: 20,
            padding: 16,
            minHeight: 104,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 20, color: palette.good }}>↓</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 16.5, color: palette.ink, marginTop: 9 }}>
            Deposit
          </Text>
          <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>Into Prime Way</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('People', {})}
          style={({ pressed }) => ({
            flex: 1,
            borderWidth: 1.5,
            borderColor: palette.line,
            backgroundColor: palette.surface,
            borderRadius: 20,
            padding: 16,
            minHeight: 104,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 20, color: palette.accent }}>↗</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 16.5, color: palette.ink, marginTop: 9 }}>
            Send
          </Text>
          <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
            To anyone, on any network
          </Text>
        </Pressable>
      </View>

      <SectionLabel>Assets</SectionLabel>
      {!address ? (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Pip expression="thinking" size={72} />
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 15,
              color: palette.muted,
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            No wallet yet. Add one in Settings to see your money here.
          </Text>
        </View>
      ) : loading ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 12 }}>
          Checking your balances…
        </Text>
      ) : failed ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 12 }}>
          Could not reach the networks right now. Pull down to try again.
        </Text>
      ) : assets.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 12 }}>
          Nothing here yet. Deposit to get started.
        </Text>
      ) : (
        assets.map((a) => (
          <View
            key={`${a.chainId}-${a.symbol}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: palette.line,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: a.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: '#fff' }}>
                {a.letter}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: palette.ink }}>
                {a.symbol}
              </Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
                {formatToken(a.amount, a.symbol)} · {a.chainName}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 15.5, color: palette.ink }}>
                {a.priceUsd === null ? '—' : formatUsd(a.amount * a.priceUsd)}
              </Text>
              {a.change24h !== null ? (
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '700',
                    color: a.change24h >= 0 ? palette.good : palette.bad,
                  }}
                >
                  {a.change24h >= 0 ? '+' : ''}
                  {a.change24h.toFixed(2)}%
                </Text>
              ) : null}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}
