// Navigation: bottom tabs (Home, History, Swap, Contacts,
// Settings) plus the send flow and the settings screens on one
// stack. Tab icons are inline SVG, never text symbols.

import React from 'react';
import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { Quote } from '../lib/relay';
import { useTheme } from '../theme-context';
import { WelcomeScreen } from '../screens/Welcome';
import { HomeScreen } from '../screens/Home';
import { ReceiveScreen } from '../screens/Receive';
import { HistoryScreen } from '../screens/History';
import { SwapScreen } from '../screens/Swap';
import { ContactsScreen } from '../screens/Contacts';
import { SettingsScreen } from '../screens/Settings';
import { SecurityScreen } from '../screens/Security';
import { AddWalletScreen } from '../screens/AddWallet';
import { PrivyAuthScreen } from '../screens/PrivyAuth';
import { ImportWalletScreen } from '../screens/ImportWallet';
import { CreatePhraseScreen } from '../screens/CreatePhrase';
import { AddSolanaScreen } from '../screens/AddSolana';
import { WalletReadyScreen } from '../screens/WalletReady';
import { ManageWalletsScreen } from '../screens/ManageWallets';
import { WalletDetailScreen } from '../screens/WalletDetail';
import { ExportWalletScreen } from '../screens/ExportWallet';
import { PinScreen } from '../screens/Pin';
import { AddPersonScreen } from '../screens/AddPerson';
import { AmountScreen } from '../screens/Amount';
import { ConfirmScreen } from '../screens/Confirm';
import { SendingScreen } from '../screens/Sending';
import { ArrivedScreen } from '../screens/Arrived';
import { SendErrorScreen } from '../screens/SendError';
import { AddAddressScreen } from '../screens/AddAddress';
import {
  ContactsIcon,
  HistoryIcon,
  HomeIcon,
  SettingsIcon,
  SwapIcon,
} from '../components/icons';

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
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Receive: undefined;
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
  Security: undefined;
  AddWallet: { onboarding?: boolean };
  PrivyAuth: { mode: 'create' | 'login'; onboarding?: boolean };
  ImportWallet: { kind: 'key' | 'mnemonic'; onboarding?: boolean };
  CreatePhrase: { onboarding?: boolean };
  AddSolana: undefined;
  WalletReady: undefined;
  ManageWallets: undefined;
  WalletDetail: { walletId: string };
  ExportWallet: { walletId?: string };
  PinSettings: { walletId?: string };
  SetupPin: { fromConfirm?: boolean };
};

export type TabParamList = {
  HomeTab: undefined;
  HistoryTab: undefined;
  SwapTab: undefined;
  ContactsTab: undefined;
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => <HistoryIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="SwapTab"
        component={SwapScreen}
        options={{
          tabBarLabel: 'Swap',
          tabBarIcon: ({ color }) => <SwapIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="ContactsTab"
        component={ContactsScreen}
        options={{
          tabBarLabel: 'Contacts',
          tabBarIcon: ({ color }) => <ContactsIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <SettingsIcon size={22} color={color} />,
        }}
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
        <Stack.Screen name="Receive" component={ReceiveScreen} />
        <Stack.Screen name="AddPerson" component={AddPersonScreen} />
        <Stack.Screen name="AddAddress" component={AddAddressScreen} />
        <Stack.Screen name="Amount" component={AmountScreen} />
        <Stack.Screen name="Confirm" component={ConfirmScreen} />
        <Stack.Screen name="PinGate" component={PinScreen} />
        <Stack.Screen name="Sending" component={SendingScreen} />
        <Stack.Screen name="Arrived" component={ArrivedScreen} />
        <Stack.Screen name="SendError" component={SendErrorScreen} />
        <Stack.Screen name="Security" component={SecurityScreen} />
        <Stack.Screen name="AddWallet" component={AddWalletScreen} />
        <Stack.Screen name="PrivyAuth" component={PrivyAuthScreen} />
        <Stack.Screen name="ImportWallet" component={ImportWalletScreen} />
        <Stack.Screen name="CreatePhrase" component={CreatePhraseScreen} />
        <Stack.Screen name="AddSolana" component={AddSolanaScreen} />
        <Stack.Screen name="WalletReady" component={WalletReadyScreen} />
        <Stack.Screen name="ManageWallets" component={ManageWalletsScreen} />
        <Stack.Screen name="WalletDetail" component={WalletDetailScreen} />
        <Stack.Screen name="ExportWallet" component={ExportWalletScreen} />
        <Stack.Screen name="PinSettings" component={PinScreen} />
        <Stack.Screen name="SetupPin" component={PinScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
