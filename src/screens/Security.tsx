// Security: your wallet, Add wallet, Export wallet, PIN for sending.

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

type Props = NativeStackScreenProps<RootStackParamList, 'Security'>;

export function SecurityScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address, source, logout } = useWallet();
  const [pinOn, setPinOn] = useState(false);

  const load = useCallback(() => {
    pinIsSet().then(setPinOn);
  }, []);
  useFocusEffect(load);

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
          <Text style={{ fontSize: 22, color: palette.accent }}>▣</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: palette.ink }}>
            {source === 'privy' ? 'Privy wallet' : source === 'imported' ? 'Imported wallet' : 'No wallet'}
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
          onPress={() => navigation.navigate('AddWallet')}
        />
        <Row
          title="Export wallet"
          sub="See and copy your phrase or key"
          onPress={() => navigation.navigate('ExportWallet')}
        />
      </View>

      <Text
        style={{
          fontFamily: FONTS.heading,
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
          onPress={() => navigation.navigate('PinSettings')}
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

      {address ? (
        <View style={{ marginTop: 24 }}>
          <Row title="Sign out" danger onPress={logout} />
        </View>
      ) : null}
    </Screen>
  );
}
