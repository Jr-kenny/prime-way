// Add wallet: create or log in with Privy, or import a key or a
// seed phrase.

import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, Heading, Row, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWallet'>;

export function AddWalletScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { privyReady } = useWallet();

  return (
    <Screen>
      <BackButton title="Security" onPress={() => navigation.goBack()} />
      <Heading>Add wallet</Heading>

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
        With Privy
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
          title="Create wallet via Privy"
          sub={
            privyReady
              ? 'New wallet, made with your Google account'
              : 'Needs a Privy App ID first'
          }
          onPress={() => navigation.navigate('PrivyAuth', { mode: 'create' })}
        />
        <Row
          title="Log in via Privy"
          sub={privyReady ? 'Sign back in' : 'Needs a Privy App ID first'}
          onPress={() => navigation.navigate('PrivyAuth', { mode: 'login' })}
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
        Import
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
          title="Import private key"
          sub="Paste the key for one address"
          onPress={() => navigation.navigate('ImportWallet', { kind: 'key' })}
        />
        <Row
          title="Import seed phrase"
          sub="12 or 24 words, in order"
          onPress={() => navigation.navigate('ImportWallet', { kind: 'mnemonic' })}
        />
      </View>
    </Screen>
  );
}
