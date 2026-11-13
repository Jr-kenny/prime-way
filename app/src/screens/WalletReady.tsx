// Wallet ready: the last step of onboarding, after the PIN is
// set. One button into the app.

import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { Pip } from '../components/Pip';
import { BigButton, Heading, Screen, Subtext } from '../components/ui';
import { View } from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'WalletReady'>;

export function WalletReadyScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <Pip expression="celebrating" size={132} />
        <View style={{ marginTop: 16 }}>
          <Heading center size={30}>
            Wallet ready
          </Heading>
        </View>
        <Subtext center>Your wallet is set up and your PIN is on. Time to send money.</Subtext>
      </View>
      <BigButton title="Start sending" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })} />
    </Screen>
  );
}
