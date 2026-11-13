// Contacts: everyone you send to, in one place. Tap a person to
// send to them, type or paste an address to send to someone new,
// or add someone to keep. Empty until the user adds people: there
// are no seeded contacts.

import React, { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { loadContacts, type Contact } from '../store/contacts';
import { useWallet } from '../wallet/WalletContext';
import { initials, shortAddress } from '../lib/format';
import { DEFAULT_DESTINATION_CHAIN_ID, DEFAULT_DESTINATION_CHAIN_NAME, ZERO_ADDRESS } from '../lib/chains';
import { isAddress } from 'viem';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BigButton, Heading, Screen, Subtext } from '../components/ui';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'ContactsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ContactsScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address } = useWallet();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [typedAddress, setTypedAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    loadContacts().then(setContacts);
  }, []);
  useFocusEffect(load);

  const goToAmount = (personId: string | null, personName: string, recipient: `0x${string}`) => {
    navigation.navigate('Amount', {
      personId,
      personName,
      recipient,
      networkName: DEFAULT_DESTINATION_CHAIN_NAME,
      networkChainId: DEFAULT_DESTINATION_CHAIN_ID,
    });
  };

  const sendToTyped = () => {
    const trimmed = typedAddress.trim();
    if (!isAddress(trimmed) || trimmed.toLowerCase() === ZERO_ADDRESS) {
      setError('That address does not look right. Check it and try again.');
      return;
    }
    setError(null);
    goToAmount(null, shortAddress(trimmed), trimmed as `0x${string}`);
  };

  const sendToSelf = () => {
    if (!address) return;
    navigation.navigate('Amount', {
      personId: null,
      personName: 'You',
      recipient: address,
      networkName: DEFAULT_DESTINATION_CHAIN_NAME,
      networkChainId: DEFAULT_DESTINATION_CHAIN_ID,
      selfSend: true,
    });
  };

  return (
    <Screen>
      <Heading>Contacts</Heading>
      <Subtext>Tap someone to send to them, or paste an address.</Subtext>

      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 13.5, color: palette.ink, marginTop: 16, marginBottom: 7 }}>
        Send to an address
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
          value={typedAddress}
          onChangeText={(t) => {
            setTypedAddress(t);
            setError(null);
          }}
          placeholder="Paste their address"
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
      {error ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: palette.bad, marginTop: 10 }}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <BigButton title="Send to this address" onPress={sendToTyped} />
        </View>
        <View style={{ flex: 1 }}>
          <BigButton title="To yourself" secondary onPress={sendToSelf} />
        </View>
      </View>

      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 19, color: palette.ink, marginTop: 22, marginBottom: 10 }}>
        People
      </Text>
      {contacts.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, paddingVertical: 8, lineHeight: 22 }}>
          No one here yet. Add someone below and they will show up here.
        </Text>
      ) : (
        contacts.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              if (!c.address) {
                navigation.navigate('AddAddress', { contactId: c.id });
                return;
              }
              goToAmount(c.id, c.name, c.address);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: palette.soft,
              borderRadius: 18,
              padding: 13,
              marginBottom: 10,
              minHeight: 68,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: c.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.display, fontWeight: '800', fontSize: 17, color: '#fff' }}>
                {initials(c.name)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16.5, color: palette.ink }}>
                {c.name}
              </Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
                {c.address ? shortAddress(c.address) : 'No address yet. Tap to add one.'}
              </Text>
            </View>
          </Pressable>
        ))
      )}
      <BigButton title="+  Someone new" secondary onPress={() => navigation.navigate('AddPerson')} />
    </Screen>
  );
}
