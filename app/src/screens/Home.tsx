// Home: the account header, the big USD total, Send and Receive,
// then the assets with real brand icons, biggest value first.
// Real balances only. Solana watch-only balances merge in when a
// Solana address is set.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { fetchBalances, totalUsdFor, type AssetBalance } from '../lib/balances';
import {
  discoverBalances,
  loadCachedDiscovery,
  mergeBalances,
  saveCachedDiscovery,
} from '../lib/discovery';
import { fetchSolanaBalances } from '../lib/solana';
import { formatToken, formatUsd, shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { TokenIcon } from '../components/TokenIcon';
import { AccountSwitcher } from '../components/AccountSwitcher';
import { ArrowDownIcon, ArrowUpRightIcon, ChevronRightIcon } from '../components/icons';
import { BigButton, Screen, SectionLabel } from '../components/ui';
import { useFocusEffect } from '@react-navigation/native';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'HomeTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address, activeWallet, solanaAddress } = useWallet();
  const [assets, setAssets] = useState<AssetBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Fast-path assets, kept apart so the background scan can merge
  // into them without ever showing another wallet's money. The run
  // id guards the slow calls: if the wallet changes or the screen
  // reloads mid-flight, the old run's results are dropped.
  const fastAssetsRef = useRef<AssetBalance[]>([]);
  const solanaAssetsRef = useRef<AssetBalance[]>([]);
  const runIdRef = useRef(0);

  const applyAll = useCallback((discovered: AssetBalance[]) => {
    const merged = mergeBalances(
      [...fastAssetsRef.current, ...solanaAssetsRef.current],
      discovered,
    );
    setAssets(merged);
    setTotalUsd(totalUsdFor(merged));
  }, []);

  const load = useCallback(async () => {
    const myRun = ++runIdRef.current;
    if (!address) {
      fastAssetsRef.current = [];
      solanaAssetsRef.current = [];
      setAssets([]);
      setTotalUsd(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetchBalances(address);
      if (myRun !== runIdRef.current) return;
      fastAssetsRef.current = res.assets;
      setAssets(res.assets);
      setTotalUsd(res.totalUsd);
      setFailed(false);
      setLoading(false);
      setRefreshing(false);
      // Solana watch-only balances merge in next, then the cached
      // background finds, then the live scan. Home never waits on
      // the full scan.
      if (solanaAddress) {
        const sol = await fetchSolanaBalances(solanaAddress);
        if (myRun !== runIdRef.current) return;
        solanaAssetsRef.current = sol;
        applyAll([]);
      }
      const cached = await loadCachedDiscovery();
      if (myRun !== runIdRef.current) return;
      if (cached && cached.length > 0) applyAll(cached);
      const found = await discoverBalances(address);
      if (myRun !== runIdRef.current) return;
      if (found.assets.length > 0 || found.scannedChainIds.length > 0) {
        applyAll(found.assets);
        await saveCachedDiscovery(found);
      }
    } catch {
      if (myRun !== runIdRef.current) return;
      setFailed(true);
      setLoading(false);
      setRefreshing(false);
    }
  }, [address, solanaAddress, applyAll]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh on focus, so switching accounts or coming back from
  // Receive shows the new balance. No auto-polling.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (!address) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Pip expression="thinking" size={96} />
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 15,
              color: palette.muted,
              textAlign: 'center',
              marginTop: 14,
              lineHeight: 22,
            }}
          >
            No wallet yet. Set one up to see your money here.
          </Text>
        </View>
        <BigButton title="Set up a wallet" onPress={() => navigation.navigate('Welcome')} />
      </Screen>
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Pressable
        onPress={() => setSwitcherOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontFamily: FONTS.heading, fontWeight: '800', fontSize: 17, color: palette.ink }}>
          {activeWallet?.label ?? 'Account 1'}
        </Text>
        <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '700' }}>
          {shortAddress(address)}
        </Text>
        <ChevronRightIcon size={18} color={palette.muted} />
      </Pressable>
      <AccountSwitcher
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onAddAccount={() => navigation.navigate('AddWallet', {})}
      />

      <Text style={{ fontSize: 14, fontWeight: '600', color: palette.muted, textAlign: 'center', marginTop: 18 }}>
        Total balance
      </Text>
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: '900',
          fontSize: 46,
          letterSpacing: -0.9,
          color: palette.ink,
          textAlign: 'center',
          marginTop: 4,
        }}
      >
        {totalUsd === null ? '—' : formatUsd(totalUsd)}{' '}
        <Text style={{ fontSize: 22, color: palette.muted }}>USD</Text>
      </Text>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
        <Pressable
          onPress={() => navigation.navigate('Receive')}
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
          <ArrowDownIcon size={20} color={palette.good} />
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16.5, color: palette.ink, marginTop: 9 }}>
            Receive
          </Text>
          <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>Into Prime Way</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.jumpTo('ContactsTab')}
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
          <ArrowUpRightIcon size={20} color={palette.accent} />
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16.5, color: palette.ink, marginTop: 9 }}>
            Send
          </Text>
          <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
            To anyone, anywhere
          </Text>
        </Pressable>
      </View>

      <SectionLabel>Assets</SectionLabel>
      {loading ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 12 }}>
          Checking your balances…
        </Text>
      ) : failed ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 12 }}>
          Could not reach your money right now. Pull down to try again.
        </Text>
      ) : assets.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 12 }}>
          Nothing here yet. Receive to get started.
        </Text>
      ) : (
        assets.map((a) => (
          <View
            key={`${a.chainId}-${a.tokenAddress}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: palette.line,
            }}
          >
            <TokenIcon asset={a} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16, color: palette.ink }}>
                {a.symbol}
              </Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
                {formatToken(a.amount, a.symbol)} · {a.chainName}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15.5, color: palette.ink }}>
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
