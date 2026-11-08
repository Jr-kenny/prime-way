// Settings: profile, Address Book, Security, theme. Contacts only
// appear after tapping Address Book, never on this screen.

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Row, Screen } from '../components/ui';
import { loadThemeChoice, type ThemeChoice } from '../store/settings';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'SettingsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function SettingsScreen({ navigation }: Props) {
  const { palette, choice, setChoice } = useTheme();
  const { address, source } = useWallet();
  const [theme, setTheme] = useState<ThemeChoice>('system');

  useEffect(() => {
    loadThemeChoice().then(setTheme);
  }, [choice]);

  const themeLabel =
    theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';

  const cycleTheme = () => {
    const next: ThemeChoice =
      theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setChoice(next);
    setTheme(next);
  };

  return (
    <Screen>
      <Text
        style={{
          fontFamily: FONTS.display,
          fontSize: 27,
          color: palette.ink,
          marginTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
        }}
      >
        Profile
      </Text>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: palette.accent,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
          marginTop: 20,
        }}
      >
        <Text style={{ fontFamily: FONTS.display, fontSize: 30, color: palette.accentInk }}>
          {address ? address[2].toUpperCase() : 'P'}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: FONTS.display,
          fontSize: 24,
          color: palette.ink,
          textAlign: 'center',
          marginTop: 12,
        }}
      >
        {source === 'privy' ? 'Privy wallet' : source === 'imported' ? 'Imported wallet' : 'Account 1'}
      </Text>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 13.5,
            color: palette.muted,
            backgroundColor: palette.soft,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
          }}
        >
          {address ? shortAddress(address) : 'No wallet yet'}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: FONTS.heading,
          fontSize: 13,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: palette.muted,
          marginTop: 26,
          marginBottom: 4,
        }}
      >
        Preferences
      </Text>
      <Row
        title="Theme"
        sub={themeLabel}
        onPress={cycleTheme}
        right={
          <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 14.5 }}>
            {themeLabel}
          </Text>
        }
      />
      <Row title="Address Book" onPress={() => navigation.navigate('AddressBook')} />

      <Text
        style={{
          fontFamily: FONTS.heading,
          fontSize: 13,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: palette.muted,
          marginTop: 22,
        }}
      >
        Wallet and safety
      </Text>
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
