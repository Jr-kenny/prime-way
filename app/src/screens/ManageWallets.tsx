// Manage Wallets: every account in one list. Tap one for its
// detail: address, assets, source, HD path and backup. Delete is
// per wallet, from its detail screen.

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ManageWallets'>;

export function ManageWalletsScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { wallets, activeId, setActiveWallet } = useWallet();

  return (
    <Screen>
      <BackButton title="Settings" onPress={() => navigation.goBack()} />
      <Heading>Manage Wallets</Heading>
      {wallets.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 14, lineHeight: 22 }}>
          No wallets yet.
        </Text>
      ) : (
        wallets.map((w) => {
          const active = w.id === activeId;
          return (
            <Pressable
              key={w.id}
              onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: palette.soft,
                borderRadius: 18,
                padding: 14,
                marginTop: 10,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16.5, color: palette.ink }}>
                  {w.label}
                </Text>
                <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600', marginTop: 2 }}>
                  {shortAddress(w.address)}
                  {w.source === 'privy' ? ' · Privy' : w.source === 'imported-mnemonic' ? ' · Recovery phrase' : ' · Private key'}
                </Text>
              </View>
              {active ? (
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: '800',
                    fontFamily: FONTS.heading,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    backgroundColor: palette.goodSoft,
                    color: palette.good,
                  }}
                >
                  Active
                </Text>
              ) : (
                <Pressable
                  onPress={() => setActiveWallet(w.id)}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    backgroundColor: palette.accentSoft,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: palette.accent }}>
                    Make active
                  </Text>
                </Pressable>
              )}
            </Pressable>
          );
        })
      )}
      <BigButton title="+  Add account" secondary onPress={() => navigation.navigate('AddWallet', {})} />
      <View style={{ height: 4 }} />
      <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600', lineHeight: 18, marginTop: 8 }}>
        Deleting a wallet removes only that wallet. If it was the only one, you go back to set up.
      </Text>
    </Screen>
  );
}
