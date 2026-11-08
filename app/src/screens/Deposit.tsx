// Deposit: your address as a QR code, copy it or share it. The
// Cross-chain card starts a send to yourself from another network.

import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'Deposit'>;

export function DepositScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address } = useWallet();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert('Address copied', 'Share it with anyone who wants to send you money.');
  };

  if (!address) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <Heading>Deposit</Heading>
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 10, fontSize: 15 }}>
          Add a wallet first, then your address shows up here.
        </Text>
        <BigButton title="Add wallet" onPress={() => navigation.navigate('AddWallet')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading>Deposit</Heading>
        <Tip text="Send BNB, USDC or ETH to this address. It can come from anywhere." />
      </View>
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 28,
          padding: 20,
          marginTop: 16,
          alignItems: 'center',
        }}
      >
        <QRCode value={address} size={210} color="#2B1A10" backgroundColor="#fff" />
      </View>
      <Pressable
        onPress={copy}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: palette.soft2,
          borderRadius: 999,
          paddingVertical: 13,
          marginTop: 14,
          minHeight: 48,
        }}
      >
        <Text style={{ fontWeight: '700', fontSize: 14.5, color: palette.ink }}>
          {copied ? 'Copied' : shortAddress(address)}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
        <Pressable
          onPress={share}
          style={{
            flex: 1,
            borderWidth: 1.5,
            borderColor: palette.line,
            backgroundColor: palette.surface,
            borderRadius: 20,
            padding: 16,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 20, color: palette.good }}>↗</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: palette.ink, marginTop: 6 }}>
            Share
          </Text>
          <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600' }}>
            Send your address
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            navigation.navigate('People', { selfSend: true })
          }
          style={{
            flex: 1,
            borderWidth: 1.5,
            borderColor: palette.line,
            backgroundColor: palette.surface,
            borderRadius: 20,
            padding: 16,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 20, color: palette.accent }}>⇄</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: palette.ink, marginTop: 6 }}>
            To yourself
          </Text>
          <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600' }}>
            From somewhere else
          </Text>
        </Pressable>
      </View>
      <BigButton title="Back to home" secondary onPress={() => navigation.navigate('Tabs')} />
    </Screen>
  );
}
