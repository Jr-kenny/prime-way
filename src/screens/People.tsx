// Send to: pick a person, or paste an address. Recent people first.

import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { loadContacts, type Contact } from '../store/contacts';
import { useWallet } from '../wallet/WalletContext';
import { initials } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen, Subtext } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'People'>;

export function PeopleScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { address } = useWallet();
  const selfSend = route.params?.selfSend === true;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    loadContacts().then(setContacts);
  }, []);
  useFocusEffect(load);

  const selectedContact = contacts.find((c) => c.id === selected) ?? null;

  const continueSend = () => {
    if (selfSend) {
      if (!address) return;
      navigation.navigate('Network', {
        personId: null,
        personName: 'You',
        recipient: address,
        selfSend: true,
      });
      return;
    }
    if (!selectedContact) return;
    if (!selectedContact.address) {
      navigation.navigate('AddAddress', { contactId: selectedContact.id });
      return;
    }
    navigation.navigate('Network', {
      personId: selectedContact.id,
      personName: selectedContact.name,
      recipient: selectedContact.address,
    });
  };

  const pasteAddress = async () => {
    setNote('Pasting is not set up here yet. Add the person below with their address.');
  };

  return (
    <Screen>
      <BackButton title="Home" onPress={() => navigation.navigate('Tabs')} />
      <Heading size={31}>Send to</Heading>
      <Text
        style={{
          fontFamily: FONTS.heading,
          fontSize: 25,
          lineHeight: 32,
          color: palette.muted,
          paddingVertical: 6,
        }}
      >
        {selfSend ? 'Yourself, on another network' : 'Type a name, or paste an address'}
      </Text>
      {selfSend ? (
        <Subtext>Money you send to yourself lands in your wallet on the network you pick.</Subtext>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={pasteAddress}
            style={{
              backgroundColor: palette.soft2,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 15,
              minHeight: 42,
            }}
          >
            <Text style={{ fontFamily: FONTS.heading, fontSize: 14, color: palette.ink }}>
              Paste
            </Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('AddressBook')}
            style={{
              backgroundColor: palette.soft2,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 15,
              minHeight: 42,
            }}
          >
            <Text style={{ fontFamily: FONTS.heading, fontSize: 14, color: palette.ink }}>
              Address Book
            </Text>
          </Pressable>
        </View>
      )}
      {note ? (
        <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600', marginTop: 8 }}>
          {note}
        </Text>
      ) : null}
      <Text style={{ fontFamily: FONTS.heading, fontSize: 19, color: palette.ink, marginTop: 16, marginBottom: 10 }}>
        Recent
      </Text>
      {selfSend ? null : contacts.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => setSelected(c.id)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: selected === c.id ? palette.accentSoft : palette.soft,
            borderWidth: 2,
            borderColor: selected === c.id ? palette.accent : 'transparent',
            borderRadius: 18,
            padding: 13,
            marginBottom: 10,
            minHeight: 68,
          }}
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
            <Text style={{ fontFamily: FONTS.display, fontSize: 17, color: '#fff' }}>
              {initials(c.name)}
            </Text>
          </View>
          <View>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 16.5, color: palette.ink }}>
              {c.name}
            </Text>
            <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
              {c.address ? `On ${c.network}` : `On ${c.network} · No address yet`}
            </Text>
          </View>
        </Pressable>
      ))}
      {selfSend ? null : (
        <BigButton title="+  Someone new" secondary onPress={() => navigation.navigate('AddPerson')} />
      )}
      <BigButton
        title="Continue"
        onPress={continueSend}
        disabled={selfSend ? !address : !selectedContact}
      />
    </Screen>
  );
}
