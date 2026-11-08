// Someone new: name and address. Nothing else to ask. The app
// picks where the money goes; a person has no per-person place
// their money lives.

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { addContact } from '../store/contacts';
import { DEFAULT_DESTINATION_CHAIN_ID, DEFAULT_DESTINATION_CHAIN_NAME, ZERO_ADDRESS } from '../lib/chains';
import { isAddress } from 'viem';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddPerson'>;

const COLORS = ['#2E6BE6', '#8B5CF6', '#3E7CB1', '#D9577B', '#7A5AF5'];

export function AddPersonScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give them a name first.');
      return;
    }
    if (!isAddress(address.trim()) || address.trim().toLowerCase() === ZERO_ADDRESS) {
      setError('That address does not look right. Check it and try again.');
      return;
    }
    setBusy(true);
    const contact = await addContact({
      name: name.trim(),
      address: address.trim() as `0x${string}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    setBusy(false);
    navigation.navigate('Amount', {
      personId: contact.id,
      personName: contact.name,
      recipient: contact.address as `0x${string}`,
      networkName: DEFAULT_DESTINATION_CHAIN_NAME,
      networkChainId: DEFAULT_DESTINATION_CHAIN_ID,
    });
  };

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <Heading size={23}>Someone new</Heading>
      <Text style={{ fontFamily: FONTS.heading, fontSize: 13.5, color: palette.ink, marginTop: 16, marginBottom: 7 }}>
        Their name
      </Text>
      <View style={{ backgroundColor: palette.soft, borderRadius: 14, paddingHorizontal: 14 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Daniel"
          placeholderTextColor={palette.muted}
          style={{ height: 50, fontSize: 16, fontFamily: FONTS.bodySemi, color: palette.ink }}
        />
      </View>
      <Text style={{ fontFamily: FONTS.heading, fontSize: 13.5, color: palette.ink, marginTop: 16, marginBottom: 7 }}>
        Their address
      </Text>
      <View style={{ backgroundColor: palette.soft, borderRadius: 14, paddingHorizontal: 14 }}>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Paste their address"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ height: 50, fontSize: 16, fontFamily: FONTS.bodySemi, color: palette.ink }}
        />
      </View>
      {error ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: palette.bad, marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
      <BigButton title={busy ? 'Please wait…' : 'Save and keep going'} onPress={save} disabled={busy} />
    </Screen>
  );
}
