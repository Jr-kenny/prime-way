// Settings: the active account, appearance, Manage Wallets, and
// Security. One place for appearance: a single segmented pill.
// No WalletConnect row: there is no WalletConnect SDK or project
// ID, so the row would do nothing. No alerts, messages or guides.

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Row, Screen } from '../components/ui';
import { AccountSwitcher } from '../components/AccountSwitcher';
import { ChevronRightIcon } from '../components/icons';
import type { ThemeChoice } from '../store/settings';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'SettingsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

const APPEARANCE_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Automatic' },
  { value: 'light', label: 'AMOLED White' },
  { value: 'dark', label: 'AMOLED Black' },
  { value: 'charcoal', label: 'Charcoal' },
];

export function SettingsScreen({ navigation }: Props) {
  const { palette, choice, setChoice } = useTheme();
  const { address, activeWallet } = useWallet();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const section = (label: string) => (
    <Text
      style={{
        fontFamily: FONTS.heading,
        fontWeight: '700',
        fontSize: 13,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: palette.muted,
        marginTop: 26,
        marginBottom: 4,
      }}
    >
      {label}
    </Text>
  );

  return (
    <Screen>
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: '900',
          fontSize: 27,
          color: palette.ink,
          marginTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        Settings
      </Text>

      <Pressable
        onPress={() => setSwitcherOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: palette.soft,
          borderRadius: 20,
          padding: 16,
          marginTop: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '800', fontSize: 17, color: palette.ink }}>
            {activeWallet?.label ?? 'No account'}
          </Text>
          <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600', marginTop: 2 }}>
            {address ? shortAddress(address) : 'No wallet yet'}
            {activeWallet?.source === 'privy'
              ? ' · Privy'
              : activeWallet?.source === 'imported-mnemonic'
                ? ' · Recovery phrase'
                : activeWallet?.source === 'imported-key'
                  ? ' · Private key'
                  : ''}
          </Text>
        </View>
        <ChevronRightIcon size={20} color={palette.muted} />
      </Pressable>
      <AccountSwitcher
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onAddAccount={() => navigation.navigate('AddWallet', {})}
      />

      {section('Appearance')}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          backgroundColor: palette.soft,
          borderRadius: 20,
          padding: 8,
        }}
      >
        {APPEARANCE_OPTIONS.map((opt) => {
          const selected = choice === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setChoice(opt.value)}
              style={{
                borderWidth: 2,
                borderColor: selected ? palette.accent : 'transparent',
                backgroundColor: selected ? palette.accentSoft : 'transparent',
                borderRadius: 999,
                paddingVertical: 10,
                paddingHorizontal: 14,
                minHeight: 44,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.heading,
                  fontWeight: '700',
                  fontSize: 13.5,
                  color: selected ? palette.accent : palette.ink,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section('Features')}
      <View
        style={{
          backgroundColor: palette.surface,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: 20,
          paddingHorizontal: 14,
          marginTop: 10,
        }}
      >
        <Row
          title="Manage Wallets"
          sub="All accounts, backup and delete"
          onPress={() => navigation.navigate('ManageWallets')}
        />
      </View>

      {section('Wallet and safety')}
      <View
        style={{
          backgroundColor: palette.surface,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: 20,
          paddingHorizontal: 14,
          marginTop: 10,
        }}
      >
        <Row
          title="Security"
          sub="Add wallet, export and send PIN"
          onPress={() => navigation.navigate('Security')}
        />
      </View>
    </Screen>
  );
}
