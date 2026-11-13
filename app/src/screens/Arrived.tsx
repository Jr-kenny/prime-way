// Arrived: "She's got it." Confetti and a hop from Pip.

import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { BigButton, Heading, Screen } from '../components/ui';
import { CheckIcon } from '../components/icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Arrived'>;

const CONFETTI = ['#E8641C', '#F5A524', '#0E9F8A', '#2E6BE6', '#D9577B', '#F07A35', '#F5A524', '#0E9F8A'];

export function ArrivedScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { draft, received } = route.params;
  const selfSend = draft.personName === 'You';
  const she = draft.personName === 'Mum' || draft.personName === 'Sarah';

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
          {CONFETTI.map((c, i) => (
            <View
              key={i}
              style={{
                width: 9,
                height: 14,
                borderRadius: 2,
                backgroundColor: c,
                transform: [{ rotate: `${i * 37}deg` }],
              }}
            />
          ))}
        </View>
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 46,
            backgroundColor: palette.goodSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon size={46} color={palette.good} />
        </View>
        <View style={{ marginTop: 18 }}>
          <Heading center size={29}>
            {selfSend ? 'Moved' : she ? "She's got it" : "They've got it"}
          </Heading>
        </View>
        <Text
          style={{
            color: palette.muted,
            fontWeight: '600',
            marginTop: 10,
            textAlign: 'center',
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          {selfSend ? 'You received' : `${draft.personName} received`}{' '}
          <Text style={{ color: palette.ink, fontFamily: FONTS.heading, fontWeight: '700' }}>{received}</Text>
          {'\n'}just now, on {draft.networkName}.
        </Text>
        <View style={{ marginTop: 18 }}>
          <Pip expression="celebrating" size={104} />
        </View>
      </View>
      <BigButton title="Done" onPress={() => navigation.navigate('Tabs')} />
      <BigButton title="Send more" secondary onPress={() => navigation.navigate('Tabs', { screen: 'ContactsTab' })} />
    </Screen>
  );
}
