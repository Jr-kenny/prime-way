// Welcome: Pip says hello. One button: start.

import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { Pip } from '../components/Pip';
import { BigButton, Heading, Screen, Subtext } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <Pip expression="happy" size={132} />
        <View style={{ marginTop: 16 }}>
          <Heading center size={30}>
            Sending money{'\n'}should feel like this.
          </Heading>
        </View>
        <Subtext center>Pick a person. Type an amount.</Subtext>
      </View>
      <BigButton title="Start sending" onPress={() => navigation.navigate('Tabs')} />
    </Screen>
  );
}
