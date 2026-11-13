// Onboarding: first run only. A phone mockup shows the Home
// layout as it will look when empty ($0.00, no assets yet), and
// the three ways in overlap its middle. Nothing here is live data:
// the mockup is a layout preview of an empty wallet, never fake
// holdings.

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { PrimeWayMark } from '../components/PrimeWayMark';
import { Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

function PhoneMockup() {
  const { palette } = useTheme();
  // Static replica of the Home layout, empty. The rows are layout
  // only: no balances, no holdings, $0.00 total.
  const rows = [
    { symbol: 'ETH', chain: 'Ethereum' },
    { symbol: 'USDC', chain: 'Base' },
    { symbol: 'BNB', chain: 'BNB Chain' },
  ];
  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: palette.line,
        backgroundColor: palette.surface,
        borderRadius: 32,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 20,
        height: 380,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 14, color: palette.ink }}>
          Account 1
        </Text>
        <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '700' }}>0x0000…0000</Text>
      </View>
      <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600', marginTop: 18 }}>
        Total balance
      </Text>
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: '900',
          fontSize: 44,
          color: palette.ink,
          textAlign: 'center',
          marginTop: 2,
        }}
      >
        $0.00
      </Text>
      <Text style={{ textAlign: 'center', fontSize: 13, color: palette.muted, fontWeight: '600' }}>
        USD
      </Text>
      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 14, color: palette.ink, marginTop: 20, marginBottom: 6 }}>
        Assets
      </Text>
      {rows.map((r) => (
        <View
          key={r.symbol}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: palette.soft,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15, color: palette.muted }}>
              {r.symbol}
            </Text>
            <Text style={{ fontSize: 12.5, color: palette.muted, fontWeight: '600' }}>
              {r.chain}
            </Text>
          </View>
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 14, color: palette.muted }}>
            $0.00
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
        No assets yet
      </Text>
    </View>
  );
}

function ChoiceButton({
  title,
  sub,
  onPress,
  primary,
}: {
  title: string;
  sub: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: primary ? palette.accent : palette.surface,
        borderWidth: primary ? 0 : 1.5,
        borderColor: palette.line,
        borderRadius: 20,
        paddingVertical: 15,
        paddingHorizontal: 18,
        marginBottom: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: FONTS.heading,
          fontWeight: '800',
          fontSize: 16.5,
          color: primary ? palette.accentInk : palette.ink,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: primary ? palette.accentInk : palette.muted,
          marginTop: 3,
          opacity: primary ? 0.9 : 1,
        }}
      >
        {sub}
      </Text>
    </Pressable>
  );
}

export function WelcomeScreen({ navigation }: Props) {
  const { palette } = useTheme();
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <PrimeWayMark size={148} />
      </View>
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: '900',
          fontSize: 28,
          color: palette.ink,
          textAlign: 'center',
          marginTop: 14,
          lineHeight: 34,
        }}
      >
        Sending money should feel like this.
      </Text>
      <Text
        style={{
          fontSize: 14.5,
          color: palette.muted,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: 8,
          lineHeight: 21,
        }}
      >
        Pick a person. Type an amount. It arrives.
      </Text>
      {/* The mockup, with the three choices overlapping its middle,
          positioned against the frame, halfway down the phone. */}
      <View style={{ marginTop: 22 }}>
        <PhoneMockup />
        <View style={{ marginTop: -190, paddingHorizontal: 10 }}>
          <ChoiceButton
            primary
            title="Create with email"
            sub="New wallet, made with your email. Privy makes a new wallet tied to your email. No phrase to write down."
            onPress={() => navigation.navigate('PrivyAuth', { mode: 'create', onboarding: true })}
          />
          <ChoiceButton
            title="Create with recovery phrase"
            sub="A fresh 12-word phrase, made on this phone. You write it down."
            onPress={() => navigation.navigate('CreatePhrase', { onboarding: true })}
          />
          <ChoiceButton
            title="Import wallet"
            sub="Bring a wallet you already have, with its phrase or private key."
            onPress={() => navigation.navigate('AddWallet', { onboarding: true })}
          />
        </View>
      </View>
      <View style={{ height: 8 }} />
    </Screen>
  );
}
