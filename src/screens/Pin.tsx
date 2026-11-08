// PIN for sending: a 4-number PIN, asked for before any send.
// Used two ways: as a gate before a send (PinGate, with a draft) and
// as the settings screen to set, change or remove it (PinSettings).

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { checkPin, pinIsSet, removePin, setPin } from '../store/settings';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';

type GateProps = NativeStackScreenProps<RootStackParamList, 'PinGate'>;
type SettingsProps = NativeStackScreenProps<RootStackParamList, 'PinSettings'>;

export function PinScreen(props: GateProps | SettingsProps) {
  const { palette } = useTheme();
  const { navigation, route } = props;
  const isGate = route.name === 'PinGate';
  const draft = isGate ? (route.params as { draft: RootStackParamList['PinGate']['draft'] }).draft : null;

  const [pin, setPinValue] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pinIsSet().then(setHasPin);
  }, []);

  const digits = pin.replace(/\D/g, '').slice(0, 4);

  const submitGate = async () => {
    if (digits.length !== 4 || !draft) return;
    setBusy(true);
    const ok = await checkPin(digits);
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
    await setPin(digits);
    setBusy(false);
    setHasPin(true);
    setPinValue('');
    navigation.goBack();
  };

  const remove = async () => {
    await removePin();
    setHasPin(false);
    navigation.goBack();
  };

  return (
    <Screen>
      <BackButton
        title={isGate ? 'Confirm' : 'Security'}
        onPress={() => navigation.goBack()}
      />
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Heading center size={24}>
          {isGate ? 'Enter your PIN' : 'PIN for sending'}
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
          {isGate
            ? 'Your PIN keeps your money safe.'
            : hasPin
              ? 'Your PIN is on. You will be asked for it before any send.'
              : 'A short PIN, asked for before any send.'}
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
            autoFocus={isGate}
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
        {isGate ? '' : hasPin ? 'Enter a new PIN to change it, or remove it below.' : 'Choose 4 numbers you will remember.'}
      </Text>
      <BigButton
        title={busy ? 'Please wait…' : isGate ? 'Continue' : hasPin ? 'Change PIN' : 'Set PIN'}
        onPress={isGate ? submitGate : submitSettings}
        disabled={busy || digits.length !== 4}
      />
      {isGate ? (
        <BigButton title="Not now" secondary onPress={() => navigation.goBack()} />
      ) : hasPin ? (
        <BigButton title="Remove PIN" secondary onPress={remove} />
      ) : (
        <BigButton title="Not now" secondary onPress={() => navigation.goBack()} />
      )}
    </Screen>
  );
}
