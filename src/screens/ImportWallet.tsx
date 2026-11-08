// Import a wallet: paste a private key or a seed phrase. It stays
// on this phone, in the secure store.

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportWallet'>;

export function ImportWalletScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { importWallet } = useWallet();
  const isKey = route.params.kind === 'key';
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await importWallet(isKey ? 'key' : 'mnemonic', value);
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    } catch {
      setError(
        isKey
          ? 'That key does not look right. Check it and try again.'
          : 'Those words do not look right. Check them and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackButton title="Add wallet" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading size={23}>{isKey ? 'Import private key' : 'Import seed phrase'}</Heading>
        <Tip
          text={
            isKey
              ? 'Paste the key for the wallet you want to add. It stays on this phone.'
              : 'Type the words in order, with a space between each one.'
          }
        />
      </View>
      <Text
        style={{
          fontFamily: FONTS.heading,
          fontSize: 13.5,
          color: palette.ink,
          marginTop: 16,
          marginBottom: 7,
        }}
      >
        {isKey ? 'Private key' : 'Seed phrase'}
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
          onChangeText={setValue}
          placeholder={isKey ? '0x…' : 'word word word…'}
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline={!isKey}
          style={{
            minHeight: 50,
            fontSize: 16,
            fontFamily: FONTS.bodySemi,
            color: palette.ink,
            paddingVertical: 12,
          }}
        />
      </View>
      <Text
        style={{
          fontSize: 12.5,
          color: palette.muted,
          fontWeight: '600',
          marginTop: 10,
        }}
      >
        Never paste a key into a website or share it with anyone.
      </Text>
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
        title={busy ? 'Please wait…' : 'Import wallet'}
        onPress={submit}
        disabled={busy || value.trim().length === 0}
      />
    </Screen>
  );
}
