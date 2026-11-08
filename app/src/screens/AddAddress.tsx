// Add an address to a contact that does not have one yet.

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isAddress } from 'viem';
import { ZERO_ADDRESS } from '../lib/chains';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { loadContacts, updateContact, type Contact } from '../store/contacts';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddAddress'>;

export function AddAddressScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const [contact, setContact] = useState<Contact | null>(null);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts().then((list) => {
      setContact(list.find((c) => c.id === route.params.contactId) ?? null);
    });
  }, [route.params.contactId]);

  const save = async () => {
    if (!contact) return;
    if (!isAddress(address.trim()) || address.trim().toLowerCase() === ZERO_ADDRESS) {
      setError('That address does not look right. Check it and try again.');
      return;
    }
    await updateContact(contact.id, { address: address.trim() as `0x${string}` });
    navigation.goBack();
  };

  if (!contact) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 20 }}>
          That person is gone.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <Heading size={23}>Address for {contact.name}</Heading>
      <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14.5, color: palette.muted, marginTop: 8 }}>
        Paste their address to send to them.
      </Text>
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
      <BigButton title="Save address" onPress={save} disabled={!address.trim()} />
    </Screen>
  );
}
