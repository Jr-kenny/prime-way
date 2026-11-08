// Someone new: name, address, and where they keep their money.

import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { addContact } from '../store/contacts';
import { SUPPORTED_CHAINS } from '../lib/chains';
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
  const [query, setQuery] = useState('');
  const [netIndex, setNetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const nets = SUPPORTED_CHAINS.filter((n) => !q || n.name.toLowerCase().includes(q)).slice(0, 3);

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give them a name first.');
      return;
    }
    if (!isAddress(address.trim())) {
      setError('That address does not look right. Check it and try again.');
      return;
    }
    setBusy(true);
    const net = SUPPORTED_CHAINS[netIndex];
    const contact = await addContact({
      name: name.trim(),
      network: net.name,
      address: address.trim() as `0x${string}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    setBusy(false);
    navigation.navigate('Network', {
      personId: contact.id,
      personName: contact.name,
      recipient: contact.address as `0x${string}`,
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
      <Text style={{ fontFamily: FONTS.heading, fontSize: 13.5, color: palette.ink, marginTop: 16, marginBottom: 7 }}>
        Where they keep their money
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.soft,
          borderRadius: 16,
          paddingHorizontal: 16,
        }}
      >
        <Text style={{ fontSize: 18, color: palette.muted }}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type a network name…"
          placeholderTextColor={palette.muted}
          style={{ flex: 1, height: 52, fontSize: 17, fontFamily: FONTS.bodySemi, color: palette.ink, marginLeft: 10 }}
        />
      </View>
      {nets.length === 0 ? (
        <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 14, marginTop: 6 }}>
          Nothing matches that yet. Try “ba”.
        </Text>
      ) : (
        nets.map((n) => {
          const idx = SUPPORTED_CHAINS.indexOf(n);
          const chosen = netIndex === idx;
          return (
            <Pressable
              key={n.id}
              onPress={() => setNetIndex(idx)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: 16,
                backgroundColor: chosen ? palette.accentSoft : 'transparent',
                marginTop: 4,
                minHeight: 46,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 11,
                  backgroundColor: n.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: FONTS.display, fontSize: 12, color: '#fff' }}>
                  {n.coin[0]}
                </Text>
              </View>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 15.5, color: palette.ink, flex: 1 }}>
                {n.name}
              </Text>
              {chosen ? (
                <Text style={{ color: palette.accent, fontWeight: '900', fontSize: 13.5 }}>✓ Chosen</Text>
              ) : null}
            </Pressable>
          );
        })
      )}
      {error ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: palette.bad, marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
      <BigButton title={busy ? 'Please wait…' : 'Save and keep going'} onPress={save} disabled={busy} />
    </Screen>
  );
}
