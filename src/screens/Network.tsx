// Pick the network: type the first letters and the closest matches
// come up straight away.

import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { SUPPORTED_CHAINS } from '../lib/chains';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Network'>;

export function NetworkScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const { personName, personId, recipient, selfSend } = route.params;

  const q = query.trim().toLowerCase();
  const list = SUPPORTED_CHAINS.filter(
    (n) => !q || n.name.toLowerCase().startsWith(q) || n.name.toLowerCase().includes(q),
  ).sort((a, b) => {
    const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return as - bs;
  });

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <Heading size={25}>
        Where does {personName}
        {'\n'}keep {selfSend ? 'your' : 'their'} money?
      </Heading>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.soft,
          borderRadius: 16,
          paddingHorizontal: 16,
          marginTop: 12,
          marginBottom: 12,
          borderWidth: 2,
          borderColor: 'transparent',
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
      {list.length === 0 ? (
        <Text style={{ textAlign: 'center', color: palette.muted, fontWeight: '600', paddingVertical: 18 }}>
          Nothing matches that yet. Try “ba” for Base.
        </Text>
      ) : (
        list.slice(0, 5).map((n) => (
          <Pressable
            key={n.id}
            onPress={() =>
              navigation.navigate('Amount', {
                personId,
                personName,
                recipient,
                networkName: n.name,
                networkChainId: n.id,
                selfSend,
              })
            }
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 13,
              borderRadius: 16,
              opacity: pressed ? 0.7 : 1,
              minHeight: 60,
            })}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: n.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.display, fontSize: 15, color: '#fff' }}>
                {n.coin[0]}
              </Text>
            </View>
            <View>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 16.5, color: palette.ink }}>
                {n.name}
              </Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600' }}>
                Arrives as USDC
              </Text>
            </View>
          </Pressable>
        ))
      )}
      {q ? (
        <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600', textAlign: 'center', marginTop: 8 }}>
          {list.length} match{list.length === 1 ? '' : 'es'} for “{q}”
        </Text>
      ) : null}
    </Screen>
  );
}
