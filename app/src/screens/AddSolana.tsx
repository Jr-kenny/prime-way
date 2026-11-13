// Watch a Solana address: paste a public Solana address and its
// SOL and token balances show on Home. Watch-only: Prime Way holds
// no Solana key and cannot send from this address.

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { isSolanaAddress, shortMint } from '../lib/solana';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'AddSolana'>;

export function AddSolanaScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { solanaAddress, setSolanaAddress } = useWallet();
  const [value, setValue] = useState(solanaAddress ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const trimmed = value.trim();
    if (!isSolanaAddress(trimmed)) {
      setError('That does not look like a Solana address. It is 32 to 44 base58 characters.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await setSolanaAddress(trimmed);
      setSaved(true);
    } catch {
      setError('That address could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await setSolanaAddress(null);
      setValue('');
      setSaved(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackButton title="Add wallet" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading size={23}>Watch a Solana address</Heading>
        <Tip text="A public address only. Its balances show on Home next to your other assets. Prime Way cannot send from it." />
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
        Solana address
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
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setError(null);
            setSaved(false);
          }}
          placeholder="Paste a Solana address"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            minHeight: 50,
            fontSize: 16,
            fontFamily: FONTS.bodySemi,
            color: palette.ink,
            paddingVertical: 12,
          }}
        />
      </View>
      {solanaAddress ? (
        <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600', marginTop: 10 }}>
          Watching {shortMint(solanaAddress)} now.
        </Text>
      ) : null}
      {error ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: palette.bad, marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
      {saved ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: palette.good, marginTop: 12 }}>
          Saved. Its balances will show on Home.
        </Text>
      ) : null}
      <BigButton title={busy ? 'Please wait…' : 'Watch this address'} onPress={save} disabled={busy || !value.trim()} />
      {solanaAddress ? (
        <BigButton title="Stop watching" secondary onPress={remove} disabled={busy} />
      ) : null}
    </Screen>
  );
}
