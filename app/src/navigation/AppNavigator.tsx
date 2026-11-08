// Navigation: bottom tabs (Home, History, Settings) plus the send
// flow and the settings screens on one stack.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import type { Quote } from '../lib/relay';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { WelcomeScreen } from '../screens/Welcome';
import { HomeScreen } from '../screens/Home';
import { DepositScreen } from '../screens/Deposit';
import { HistoryScreen } from '../screens/History';
import { SettingsScreen } from '../screens/Settings';
import { AddressBookScreen } from '../screens/AddressBook';
import { SecurityScreen } from '../screens/Security';
import { AddWalletScreen } from '../screens/AddWallet';
import { PrivyAuthScreen } from '../screens/PrivyAuth';
import { ImportWalletScreen } from '../screens/ImportWallet';
import { ExportWalletScreen } from '../screens/ExportWallet';
import { PinScreen } from '../screens/Pin';
import { PeopleScreen } from '../screens/People';
import { AddPersonScreen } from '../screens/AddPerson';
import { AmountScreen } from '../screens/Amount';
import { ConfirmScreen } from '../screens/Confirm';
import { SendingScreen } from '../screens/Sending';
import { ArrivedScreen } from '../screens/Arrived';
import { SendErrorScreen } from '../screens/SendError';
import { AddAddressScreen } from '../screens/AddAddress';

export interface SendDraft {
  personId: string | null;
  personName: string;
  recipient: `0x${string}`;
  networkName: string;
  networkChainId: number;
  usdAmount: string;
  payChainId: number;
  paySymbol: string;
  payPrice: number;
  receiveSymbol: string;
  quote: Quote;
}

export type RootStackParamList = {
  Welcome: undefined;
  Tabs: undefined;
  Deposit: undefined;
  People: { selfSend?: boolean } | undefined;
  AddPerson: undefined;
  AddAddress: { contactId: string };
  Amount: {
    personId: string | null;
    personName: string;
    recipient: `0x${string}`;
    networkName: string;
    networkChainId: number;
    selfSend?: boolean;
  };
  Confirm: { draft: SendDraft };
  PinGate: { draft: SendDraft };
  Sending: { draft: SendDraft };
  Arrived: {
    draft: SendDraft;
    received: string;
    txHash?: string;
  };
  SendError: {
    title: string;
    message: string;
    draft?: SendDraft;
  };
  AddressBook: undefined;
  Security: undefined;
  AddWallet: undefined;
  PrivyAuth: { mode: 'create' | 'login' };
  ImportWallet: { kind: 'key' | 'mnemonic' };
  ExportWallet: undefined;
  PinSettings: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  HistoryTab: undefined;
  SettingsTab: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  const { palette } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.dock,
          borderTopColor: palette.line,
        },
        tabBarLabelStyle: { fontFamily: FONTS.heading, fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: () => <Text style={{ fontSize: 20 }}>⌂</Text> }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History', tabBarIcon: () => <Text style={{ fontSize: 20 }}>◷</Text> }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚙</Text> }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator({ hasWallet }: { hasWallet: boolean }) {
  const { palette } = useTheme();
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={hasWallet ? 'Tabs' : 'Welcome'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Deposit" component={DepositScreen} />
        <Stack.Screen name="People" component={PeopleScreen} />
        <Stack.Screen name="AddPerson" component={AddPersonScreen} />
        <Stack.Screen name="AddAddress" component={AddAddressScreen} />
        <Stack.Screen name="Amount" component={AmountScreen} />
        <Stack.Screen name="Confirm" component={ConfirmScreen} />
        <Stack.Screen name="PinGate" component={PinScreen} />
        <Stack.Screen name="Sending" component={SendingScreen} />
        <Stack.Screen name="Arrived" component={ArrivedScreen} />
        <Stack.Screen name="SendError" component={SendErrorScreen} />
        <Stack.Screen name="AddressBook" component={AddressBookScreen} />
        <Stack.Screen name="Security" component={SecurityScreen} />
        <Stack.Screen name="AddWallet" component={AddWalletScreen} />
        <Stack.Screen name="PrivyAuth" component={PrivyAuthScreen} />
        <Stack.Screen name="ImportWallet" component={ImportWalletScreen} />
        <Stack.Screen name="ExportWallet" component={ExportWalletScreen} />
        <Stack.Screen name="PinSettings" component={PinScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
