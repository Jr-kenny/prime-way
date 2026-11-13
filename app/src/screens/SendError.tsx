// When it can't send: Pip is sorry, the money is safe, one clear
// next step.

import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../theme-context';
import { Pip } from '../components/Pip';
import { BigButton, Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'SendError'>;

export function SendErrorScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { title, message, draft } = route.params;

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 46,
            backgroundColor: palette.badSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pip expression="apologetic" size={72} />
        </View>
        <View style={{ marginTop: 18 }}>
          <Heading center size={26}>
            {title}
          </Heading>
        </View>
        <Text
          style={{
            color: palette.muted,
            fontWeight: '600',
            marginTop: 12,
            textAlign: 'center',
            fontSize: 15,
            lineHeight: 22,
            paddingHorizontal: 12,
          }}
        >
          {message}
        </Text>
      </View>
      {draft ? (
        <BigButton title="Try again" onPress={() => navigation.navigate('Tabs', { screen: 'ContactsTab' })} />
      ) : null}
      <BigButton title="Back to home" secondary onPress={() => navigation.navigate('Tabs')} />
    </Screen>
  );
}
