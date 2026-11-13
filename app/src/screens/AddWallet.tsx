// Add wallet: create or log in with Privy by email, make a fresh
// phrase wallet, import a key or a phrase, or watch a Solana
// address (balances only, no key held).

import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, Heading, Row, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWallet'>;

export function AddWalletScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { privyReady, solanaAddress } = useWallet();
  const onboarding = route.params?.onboarding === true;

  const section = (label: string) => (
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
      {label}
    </Text>
  );

  const card = (children: React.ReactNode) => (
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
      {children}
    </View>
  );

  return (
    <Screen>
      <BackButton title={onboarding ? 'Back' : 'Security'} onPress={() => navigation.goBack()} />
      <Heading>Add wallet</Heading>

      {section('With Privy')}
      {card(
        <>
          <Row
            title="Create wallet with email"
            sub={
              privyReady
                ? 'New wallet, made with your email'
                : 'Needs a Privy App ID first'
            }
            onPress={() => navigation.navigate('PrivyAuth', { mode: 'create', onboarding })}
          />
          <Row
            title="Log in with email"
            sub={privyReady ? 'Sign back in with a code' : 'Needs a Privy App ID first'}
            onPress={() => navigation.navigate('PrivyAuth', { mode: 'login', onboarding })}
          />
        </>,
      )}

      {section('With a recovery phrase')}
      {card(
        <Row
          title="Create with recovery phrase"
          sub="A fresh 12-word phrase, made on this phone"
          onPress={() => navigation.navigate('CreatePhrase', { onboarding })}
        />,
      )}

      {section('Import')}
      {card(
        <>
          <Row
            title="Import private key"
            sub="Paste the key for one address"
            onPress={() => navigation.navigate('ImportWallet', { kind: 'key', onboarding })}
          />
          <Row
            title="Import seed phrase"
            sub="12 or 24 words, in order"
            onPress={() => navigation.navigate('ImportWallet', { kind: 'mnemonic', onboarding })}
          />
        </>,
      )}

      {section('Solana, watch only')}
      {card(
        <Row
          title="Watch a Solana address"
          sub={
            solanaAddress
              ? `Watching ${shortAddress(solanaAddress)}`
              : 'See Solana balances. No key is held.'
          }
          onPress={() => navigation.navigate('AddSolana')}
        />,
      )}
    </Screen>
  );
}
