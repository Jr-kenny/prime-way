// Privy login by email code: the code goes to the email, the
// code comes back here, Privy makes or brings back the wallet.
// When the Privy App ID is not set yet, this screen says what is
// missing instead of pretending. Email sign-in also has to be
// enabled for the app in the Privy dashboard; the app cannot check
// that itself, so if the code never arrives, that is the first
// thing to check there.

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEmbeddedEthereumWallet, useLoginWithEmail, usePrivy } from '@privy-io/expo';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivyAuth'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const { wallets: appWallets } = useWallet();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createMode = route.params.mode === 'create';
  const onboarding = route.params.onboarding === true;
  const hadPrivyWallet = appWallets.some((w) => w.source === 'privy');

  // Once signed in with a wallet, move on. A brand-new wallet made
  // during onboarding goes to set a PIN first; everywhere else it
  // goes straight to the app.
  useEffect(() => {
    if (user && wallets.length > 0) {
      if (onboarding && createMode && !hadPrivyWallet) {
        navigation.reset({ index: 0, routes: [{ name: 'SetupPin', params: {} }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
      }
    }
  }, [user, wallets, navigation, onboarding, createMode, hadPrivyWallet]);

  useEffect(() => {
    if (user && wallets.length === 0 && !busy) {
      setBusy(true);
      create()
        .catch(() => setError('The wallet could not be made. Try again.'))
        .finally(() => setBusy(false));
    }
  }, [user, wallets, busy, create]);

  const send = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setError('That email does not look right. Check it and try again.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendCode({ email: email.trim() });
      setCodeSent(true);
    } catch {
      setError('The code could not be sent. Check the email and try again. If no code ever arrives, email sign-in may not be enabled for this app in the Privy dashboard.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 4) {
      setError('Type the code from your email.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await loginWithCode({ code: digits, email: email.trim() });
    } catch {
      setError('That code did not work. Check it and try again.');
    } finally {
      setBusy(false);
    }
  };

  const loading =
    busy || state.status === 'sending-code' || state.status === 'submitting-code';

  return (
    <Screen>
      <BackButton title="Add wallet" onPress={() => navigation.goBack()} />
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <Pip expression="happy" size={76} />
      </View>
      <Heading center size={23}>
        {createMode ? 'Create wallet with email' : 'Log in with email'}
      </Heading>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Tip
          text={
            createMode
              ? 'Privy makes a new wallet tied to your email. No phrase to write down.'
              : 'Sign in with your email and Privy brings your wallet back.'
          }
        />
      </View>
      <Text
        style={{
          fontFamily: FONTS.heading,
          fontWeight: '700',
          fontSize: 13.5,
          color: palette.ink,
          marginTop: 16,
          marginBottom: 7,
        }}
      >
        Your email
      </Text>
      <View
        style={{
          backgroundColor: palette.soft,
          borderRadius: 14,
          paddingHorizontal: 14,
          borderWidth: 2,
          borderColor: 'transparent',
        }}
      >
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!codeSent}
          style={{
            minHeight: 50,
            fontSize: 16,
            fontFamily: FONTS.bodySemi,
            color: palette.ink,
            paddingVertical: 12,
          }}
        />
      </View>
      {codeSent ? (
        <>
          <Text
            style={{
              fontFamily: FONTS.heading,
              fontWeight: '700',
              fontSize: 13.5,
              color: palette.ink,
              marginTop: 16,
              marginBottom: 7,
            }}
          >
            Code from your email
          </Text>
          <View
            style={{
              backgroundColor: palette.soft,
              borderRadius: 14,
              paddingHorizontal: 14,
              borderWidth: 2,
              borderColor: 'transparent',
            }}
          >
            <TextInput
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, '').slice(0, 8));
                setError(null);
              }}
              placeholder="123456"
              placeholderTextColor={palette.muted}
              keyboardType="number-pad"
              autoFocus
              style={{
                minHeight: 50,
                fontSize: 16,
                fontFamily: FONTS.bodySemi,
                color: palette.ink,
                paddingVertical: 12,
              }}
            />
          </View>
          <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600', marginTop: 10 }}>
            Sent to {email.trim()}. It can take a minute to arrive.
          </Text>
        </>
      ) : null}
      {error ? (
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 13.5,
            color: palette.bad,
            marginTop: 12,
          }}
        >
          {error}
        </Text>
      ) : null}
      <BigButton
        title={
          loading
            ? 'Please wait…'
            : codeSent
              ? createMode
                ? 'Create with email'
                : 'Continue with email'
              : 'Send code'
        }
        onPress={codeSent ? submitCode : send}
        disabled={loading || (!codeSent && !email.trim()) || (codeSent && code.replace(/\D/g, '').length < 4)}
      />
      {codeSent ? (
        <BigButton
          title="Send a new code"
          secondary
          onPress={() => {
            setCode('');
            setCodeSent(false);
          }}
        />
      ) : (
        <BigButton title="Back to options" secondary onPress={() => navigation.goBack()} />
      )}
    </Screen>
  );
}

export function PrivyAuthScreen(props: Props) {
  const { privyReady } = useWallet();
  if (!privyReady) return <PrivySetupNeeded {...props} />;
  return <PrivyAuthInner {...props} />;
}
