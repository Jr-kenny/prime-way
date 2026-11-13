// Security: the active wallet, Add wallet, Export wallet, PIN
// for sending (per active wallet). Signing out signs out of Privy
// and drops the Privy wallet; imported wallets stay.

import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { pinIsSet } from '../store/settings';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, Heading, Row, Screen } from '../components/ui';
import { WalletIcon } from '../components/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Security'>;

export function SecurityScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address, activeWallet, logout, privySignedIn } = useWallet();
  const [pinOn, setPinOn] = useState(false);

  const load = useCallback(() => {
    pinIsSet(activeWallet?.id ?? null).then(setPinOn);
  }, [activeWallet?.id]);
  useFocusEffect(load);

  const walletLabel =
    activeWallet?.source === 'privy'
      ? 'Privy wallet'
      : activeWallet?.source === 'imported-mnemonic'
        ? 'Imported wallet'
        : activeWallet?.source === 'imported-key'
          ? 'Imported wallet'
          : 'No wallet';

  return (
    <Screen>
      <BackButton title="Settings" onPress={() => navigation.goBack()} />
      <Heading>Security</Heading>
      <View
        style={{
          backgroundColor: palette.soft,
          borderRadius: 20,
          padding: 16,
          marginTop: 12,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: palette.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WalletIcon size={22} color={palette.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16, color: palette.ink }}>
            {activeWallet ? `${activeWallet.label} · ${walletLabel}` : walletLabel}
          </Text>
          <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
            {address ? `${shortAddress(address)} · Saved on this device` : 'Add a wallet to get started'}
          </Text>
        </View>
        {address ? (
          <Text
            style={{
              fontSize: 11.5,
              fontWeight: '800',
              fontFamily: FONTS.heading,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 3,
              backgroundColor: palette.goodSoft,
              color: palette.good,
            }}
          >
            Active
          </Text>
        ) : null}
      </View>

      <Text
        style={{
          fontFamily: FONTS.heading,
          fontWeight: '700',
          fontSize: 12.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: palette.muted,
          marginTop: 20,
        }}
      >
        Wallet
      </Text>
      <View
        style={{
          backgroundColor: palette.surface,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: 20,
          paddingHorizontal: 14,
          marginTop: 10,
        }}
      >
        <Row
          title="Add wallet"
          sub="Create or import another wallet"
          onPress={() => navigation.navigate('AddWallet', {})}
        />
        <Row
          title="Export wallet"
          sub="See and copy your phrase or key"
          onPress={() => navigation.navigate('ExportWallet', {})}
        />
        <Row
          title="Manage Wallets"
          sub="All accounts, backup and delete"
          onPress={() => navigation.navigate('ManageWallets')}
        />
      </View>

      <Text
        style={{
          fontFamily: FONTS.heading,
          fontWeight: '700',
          fontSize: 12.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: palette.muted,
          marginTop: 20,
        }}
      >
        Sending
      </Text>
      <View
        style={{
          backgroundColor: palette.surface,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: 20,
          paddingHorizontal: 14,
          marginTop: 10,
        }}
      >
        <Row
          title="PIN for sending"
          sub="Ask for a PIN before money leaves"
          onPress={() => navigation.navigate('PinSettings', {})}
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
      </View>

      {privySignedIn ? (
        <View style={{ marginTop: 24 }}>
          <Row title="Sign out of Privy" danger onPress={logout} />
        </View>
      ) : null}
    </Screen>
  );
}
