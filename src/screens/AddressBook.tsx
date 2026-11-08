// Address Book: contacts live here, inside Settings. Tap one to add
// or change its address.

import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { loadContacts, type Contact } from '../store/contacts';
import { initials, shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddressBook'>;

export function AddressBookScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const [contacts, setContacts] = useState<Contact[]>([]);

  const load = useCallback(() => {
    loadContacts().then(setContacts);
  }, []);
  useFocusEffect(load);

  return (
    <Screen>
      <BackButton title="Settings" onPress={() => navigation.goBack()} />
      <Heading>Address Book</Heading>
      {contacts.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => navigation.navigate('AddAddress', { contactId: c.id })}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 10,
            borderRadius: 16,
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
            <Text style={{ fontFamily: FONTS.display, fontSize: 17, color: '#fff' }}>
              {initials(c.name)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 16.5, color: palette.ink }}>
              {c.name}
            </Text>
            <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
              {c.address ? `On ${c.network} · ${shortAddress(c.address)}` : `On ${c.network} · No address yet`}
            </Text>
          </View>
          <Text style={{ fontSize: 20, color: palette.muted }}>›</Text>
        </Pressable>
      ))}
      <BigButton title="+  Add someone" secondary onPress={() => navigation.navigate('AddPerson')} />
    </Screen>
  );
}
