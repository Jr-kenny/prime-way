// PIN for sending: a 4-number PIN, asked for before any send.
// Used three ways:
//  - PinGate: verify the active wallet's PIN before a send.
//  - PinSettings: set, change or remove a wallet's PIN.
//  - SetupPin: set the PIN for a wallet just made in onboarding,
//    then on to Wallet Ready (or back, when reached from Confirm
//    because no PIN was set yet).
// The PIN is per wallet; a PIN saved before per-wallet PINs is
// honoured as that wallet's PIN.

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { checkPin, pinIsSet, removePin, setPin } from '../store/settings';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';

type GateProps = NativeStackScreenProps<RootStackParamList, 'PinGate'>;
type SettingsProps = NativeStackScreenProps<RootStackParamList, 'PinSettings'>;
type SetupProps = NativeStackScreenProps<RootStackParamList, 'SetupPin'>;

export function PinScreen(props: GateProps | SettingsProps | SetupProps) {
  const { palette } = useTheme();
  const { activeId } = useWallet();
  const { navigation, route } = props;
  const isGate = route.name === 'PinGate';
  const isSetup = route.name === 'SetupPin';
  const draft = isGate ? (route.params as { draft: RootStackParamList['PinGate']['draft'] }).draft : null;
  const walletId =
    !isGate && route.params && 'walletId' in route.params
      ? ((route.params as { walletId?: string }).walletId ?? activeId)
      : activeId;
  const fromConfirm =
    isSetup && route.params && 'fromConfirm' in route.params
      ? ((route.params as { fromConfirm?: boolean }).fromConfirm ?? false)
      : false;

  const [pin, setPinValue] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pinIsSet(walletId).then(setHasPin);
  }, [walletId]);

  const digits = pin.replace(/\D/g, '').slice(0, 4);

  const submitGate = async () => {
    if (digits.length !== 4 || !draft) return;
    setBusy(true);
    const ok = await checkPin(digits, walletId);
    setBusy(false);
    if (ok) {
      navigation.navigate('Sending', { draft });
    } else {
      setError('Wrong PIN. Try again.');
      setPinValue('');
    }
  };

  const submitSettings = async () => {
    if (digits.length !== 4) return;
    setBusy(true);
    await setPin(digits, walletId);
    setBusy(false);
    setHasPin(true);
    setPinValue('');
    navigation.goBack();
  };

  const submitSetup = async () => {
    if (digits.length !== 4) return;
    setBusy(true);
    await setPin(digits, walletId);
    setBusy(false);
    if (fromConfirm) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'WalletReady' }] });
    }
  };

  const remove = async () => {
    await removePin(walletId);
    setHasPin(false);
    navigation.goBack();
  };

  const heading = isGate ? 'Enter your PIN' : isSetup ? 'Set a PIN for sending' : 'PIN for sending';
  const explainer = isGate
    ? 'Your PIN keeps your money safe.'
    : isSetup
      ? 'A short PIN, asked for before any send. You set it once, for this wallet.'
      : hasPin
        ? 'Your PIN is on. You will be asked for it before any send.'
        : 'A short PIN, asked for before any send.';
  const buttonTitle = busy
    ? 'Please wait…'
    : isGate
      ? 'Continue'
      : isSetup
        ? 'Set PIN'
        : hasPin
          ? 'Change PIN'
          : 'Set PIN';

  return (
    <Screen>
      <BackButton
        title={isGate ? 'Confirm' : isSetup ? 'Back' : 'Security'}
        onPress={() => navigation.goBack()}
      />
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Heading center size={24}>
          {heading}
        </Heading>
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 14.5,
            color: palette.muted,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 21,
          }}
        >
          {explainer}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 2.5,
              borderColor: digits.length > i ? palette.accent : palette.muted,
              backgroundColor: digits.length > i ? palette.accent : 'transparent',
            }}
          />
        ))}
      </View>
      <View style={{ maxWidth: 220, alignSelf: 'center', width: '100%', marginTop: 8 }}>
        <View
          style={{
            backgroundColor: palette.soft,
            borderRadius: 14,
            paddingHorizontal: 14,
          }}
        >
          <TextInput
            value={pin}
            onChangeText={(t) => {
              setPinValue(t.replace(/\D/g, '').slice(0, 4));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="4 numbers"
            placeholderTextColor={palette.muted}
            autoFocus={isGate || isSetup}
            style={{
              height: 50,
              fontSize: 16,
              fontFamily: FONTS.bodySemi,
              color: palette.ink,
              textAlign: 'center',
            }}
          />
        </View>
      </View>
      {error ? (
        <Text
          style={{
            textAlign: 'center',
            fontSize: 13.5,
            color: palette.bad,
            fontWeight: '700',
            marginTop: 10,
          }}
        >
          {error}
        </Text>
      ) : null}
      <Text
        style={{
          textAlign: 'center',
          fontSize: 12.5,
          color: palette.muted,
          fontWeight: '700',
          marginTop: 10,
        }}
      >
        {isGate ? '' : isSetup ? 'Choose 4 numbers you will remember.' : hasPin ? 'Enter a new PIN to change it, or remove it below.' : 'Choose 4 numbers you will remember.'}
      </Text>
      <BigButton
        title={buttonTitle}
        onPress={isGate ? submitGate : isSetup ? submitSetup : submitSettings}
        disabled={busy || digits.length !== 4}
      />
      {isGate ? (
        <BigButton title="Not now" secondary onPress={() => navigation.goBack()} />
      ) : isSetup ? (
        <BigButton
          title="Skip for now"
          secondary
          onPress={() => {
            if (fromConfirm) navigation.goBack();
            else navigation.reset({ index: 0, routes: [{ name: 'WalletReady' }] });
          }}
        />
      ) : hasPin ? (
        <BigButton title="Remove PIN" secondary onPress={remove} />
      ) : (
        <BigButton title="Not now" secondary onPress={() => navigation.goBack()} />
      )}
    </Screen>
  );
}
