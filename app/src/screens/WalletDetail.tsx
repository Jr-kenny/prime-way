// Wallet Detail: one account, everything about it. Address with
// copy, its real balances, its source, its HD path (phrase wallets
// only), its PIN status, backup for imported wallets, and delete.
// Privy wallets have no phrase or key on this phone: the backup row
// says so instead of pretending.

import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { fetchBalances, type AssetBalance } from '../lib/balances';
import { formatToken, formatUsd, shortAddress } from '../lib/format';
import { pinIsSet } from '../store/settings';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Row, Screen, SectionLabel } from '../components/ui';
import { TokenIcon } from '../components/TokenIcon';
import { CopyIcon } from '../components/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'WalletDetail'>;

export function WalletDetailScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { wallets, activeId, setActiveWallet, deleteWallet } = useWallet();
  const wallet = wallets.find((w) => w.id === route.params.walletId) ?? null;
  const [assets, setAssets] = useState<AssetBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinOn, setPinOn] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    if (!wallet) return;
    pinIsSet(wallet.id).then(setPinOn);
    setLoading(true);
    fetchBalances(wallet.address)
      .then((res) => setAssets(res.assets))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [wallet]);

  useFocusEffect(load);

  if (!wallet) {
    return (
      <Screen>
        <BackButton title="Manage Wallets" onPress={() => navigation.goBack()} />
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 20 }}>
          That wallet is gone.
        </Text>
      </Screen>
    );
  }

  const isPrivy = wallet.source === 'privy';
  const isActive = wallet.id === activeId;

  const copy = async () => {
    await Clipboard.setStringAsync(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${wallet.label}?`,
      isPrivy
        ? 'This signs you out of Privy and removes this wallet from the app.'
        : 'This removes this wallet from the app. Make sure you have its phrase or key saved somewhere else first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const wasOnly = wallets.length === 1;
            await deleteWallet(wallet.id);
            if (wasOnly) {
              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            } else {
              navigation.goBack();
            }
          },
        },
      ],
    );
  };

  const sourceLabel =
    wallet.source === 'privy'
      ? 'Privy, made with your email'
      : wallet.source === 'imported-mnemonic'
        ? 'Imported recovery phrase'
        : 'Imported private key';

  return (
    <Screen>
      <BackButton title="Manage Wallets" onPress={() => navigation.goBack()} />
      <Heading>{wallet.label}</Heading>
      <Pressable
        onPress={copy}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: palette.soft,
          borderRadius: 999,
          paddingVertical: 11,
          paddingHorizontal: 14,
          marginTop: 12,
          alignSelf: 'flex-start',
        }}
      >
        <CopyIcon size={16} color={palette.muted} />
        <Text style={{ fontWeight: '700', fontSize: 14, color: palette.ink }}>
          {copied ? 'Copied' : shortAddress(wallet.address)}
        </Text>
      </Pressable>

      <SectionLabel>Assets</SectionLabel>
      {loading ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 8 }}>
          Checking balances…
        </Text>
      ) : assets.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 8 }}>
          Nothing here yet.
        </Text>
      ) : (
        assets.map((a) => (
          <View
            key={`${a.chainId}-${a.tokenAddress}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: palette.line,
            }}
          >
            <TokenIcon asset={a} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15.5, color: palette.ink }}>
                {a.symbol}
              </Text>
              <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600' }}>
                {formatToken(a.amount, a.symbol)} · {a.chainName}
              </Text>
            </View>
            <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15, color: palette.ink }}>
              {a.priceUsd === null ? '—' : formatUsd(a.amount * a.priceUsd)}
            </Text>
          </View>
        ))
      )}

      <SectionLabel>About this wallet</SectionLabel>
      <View
        style={{
          backgroundColor: palette.surface,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: 20,
          paddingHorizontal: 14,
        }}
      >
        <Row title="Source" sub={sourceLabel} />
        <Row
          title="HD Path"
          sub={
            wallet.source === 'imported-mnemonic'
              ? (wallet.hdPath ?? 'Not recorded')
              : 'Not applicable'
          }
        />
        <Row
          title="PIN for sending"
          sub={pinOn ? 'On for this wallet' : 'Not set for this wallet'}
          onPress={() => navigation.navigate('PinSettings', { walletId: wallet.id })}
          right={
            <Text
              style={{
                fontSize: 11.5,
                fontWeight: '800',
                fontFamily: FONTS.heading,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 3,
                backgroundColor: pinOn ? palette.goodSoft : palette.soft2,
                color: pinOn ? palette.good : palette.muted,
              }}
            >
              {pinOn ? 'On' : 'Not set'}
            </Text>
          }
        />
        {isPrivy ? (
          <Row
            title="Backup"
            sub="No phrase or key on this phone. Privy keeps this wallet safe under your email."
          />
        ) : (
          <Row
            title="Backup seed phrase / private key"
            sub="See and copy your phrase or key"
            onPress={() => navigation.navigate('ExportWallet', { walletId: wallet.id })}
          />
        )}
      </View>

      {!isActive ? (
        <BigButton title="Make this the active wallet" onPress={() => setActiveWallet(wallet.id)} />
      ) : null}
      <BigButton title={`Delete ${wallet.label}`} secondary onPress={confirmDelete} />
    </Screen>
  );
}
