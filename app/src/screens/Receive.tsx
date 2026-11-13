// Receive: your address as a QR code, copy it or share it with
// the system share sheet. The To yourself card starts a send to
// yourself from another network.

import React, { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { DEFAULT_DESTINATION_CHAIN_ID, DEFAULT_DESTINATION_CHAIN_NAME } from '../lib/chains';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';
import { ArrowUpRightIcon, SwapIcon } from '../components/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Receive'>;

export function ReceiveScreen({ navigation }: Props) {
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
    await Share.share({ message: address });
  };

  if (!address) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <Heading>Receive</Heading>
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 10, fontSize: 15 }}>
          Add a wallet first, then your address shows up here.
        </Text>
        <BigButton title="Add wallet" onPress={() => navigation.navigate('AddWallet', {})} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading>Receive</Heading>
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
          <ArrowUpRightIcon size={20} color={palette.good} />
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16, color: palette.ink, marginTop: 6 }}>
            Share
          </Text>
          <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600' }}>
            Send your address
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            navigation.navigate('Amount', {
              personId: null,
              personName: 'You',
              recipient: address,
              networkName: DEFAULT_DESTINATION_CHAIN_NAME,
              networkChainId: DEFAULT_DESTINATION_CHAIN_ID,
              selfSend: true,
            })
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
          <SwapIcon size={20} color={palette.accent} />
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16, color: palette.ink, marginTop: 6 }}>
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
