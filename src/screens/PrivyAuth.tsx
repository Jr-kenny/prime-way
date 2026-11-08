// Privy login: Google in, wallet out. When the Privy App ID is not
// set yet, this screen says what is missing instead of pretending.

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEmbeddedEthereumWallet, useLoginWithOAuth, usePrivy } from '@privy-io/expo';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivyAuth'>;

function PrivySetupNeeded({ navigation }: Props) {
  const { palette } = useTheme();
  return (
    <Screen>
      <BackButton title="Add wallet" onPress={() => navigation.goBack()} />
      <View style={{ alignItems: 'center', marginTop: 24 }}>
        <Pip expression="thinking" size={96} />
      </View>
      <Heading center>Privy is not set up yet</Heading>
      <Text
        style={{
          fontFamily: FONTS.bodySemi,
          fontSize: 15,
          color: palette.muted,
          textAlign: 'center',
          marginTop: 12,
          lineHeight: 22,
        }}
      >
        This needs a Privy App ID. Create an app at privy.io, then set EXPO_PUBLIC_PRIVY_APP_ID and rebuild.
      </Text>
      <BigButton title="Back to options" secondary onPress={() => navigation.goBack()} />
    </Screen>
  );
}

function PrivyAuthInner({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { user } = usePrivy();
  const { login, state } = useLoginWithOAuth();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createMode = route.params.mode === 'create';

  useEffect(() => {
    if (user && wallets.length > 0) {
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }
  }, [user, wallets, navigation]);

  useEffect(() => {
    if (user && wallets.length === 0 && createMode && !busy) {
      setBusy(true);
      create()
        .catch(() => setError('The wallet could not be made. Try again.'))
        .finally(() => setBusy(false));
    }
  }, [user, wallets, createMode, busy, create]);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      await login({ provider: 'google' });
    } catch {
      setError('Sign in did not finish. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const loading = busy || state.status === 'loading';

  return (
    <Screen>
      <BackButton title="Add wallet" onPress={() => navigation.goBack()} />
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <Pip expression="happy" size={76} />
      </View>
      <Heading center size={23}>
        {createMode ? 'Create wallet via Privy' : 'Log in via Privy'}
      </Heading>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Tip
          text={
            createMode
              ? 'Privy makes a new wallet tied to your Google account. No phrase to write down.'
              : 'Sign in with Google and Privy brings your wallet back.'
          }
        />
      </View>
      <Pressable
        onPress={start}
        disabled={loading}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          width: '100%',
          paddingVertical: 15,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: palette.line,
          backgroundColor: palette.surface,
          minHeight: 56,
          marginTop: 20,
          opacity: loading ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontWeight: '900', color: '#4285F4', fontSize: 19 }}>G</Text>
        <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: palette.ink }}>
          {loading ? 'Please wait…' : createMode ? 'Create with Google' : 'Continue with Google'}
        </Text>
      </Pressable>
      {error ? (
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 13.5,
            color: palette.bad,
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          {error}
        </Text>
      ) : null}
      <BigButton title="Back to options" secondary onPress={() => navigation.goBack()} />
    </Screen>
  );
}

export function PrivyAuthScreen(props: Props) {
  const { privyReady } = useWallet();
  if (!privyReady) return <PrivySetupNeeded {...props} />;
  return <PrivyAuthInner {...props} />;
}
