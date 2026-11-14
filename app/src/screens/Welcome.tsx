// Onboarding: first run only. A direct translation of the approved
// test-page welcome screen ("Prime Way Home Test"): compact logo,
// headline "Your money, on any chain", no subtitle, a small phone
// mockup of the Home layout sitting behind the actions, and three
// plain buttons — one blue pill "Create with email" with a PRIVY
// tag, then "Create with recovery phrase" and "Import wallet".
// The only difference from the test page is the preview: the real
// app has no money yet, so the mockup shows the empty $0.00
// preview (zero amounts), never fake holdings.

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { PrimeWayMark } from '../components/PrimeWayMark';
import { Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

// The four token icons from the approved mockup, drawn as inline
// SVG (same marks as the test page). Static preview only.
function MockTokenIcon({ symbol }: { symbol: 'USDC' | 'ETH' | 'SOL' | 'BNB' }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 32 32">
      {symbol === 'USDC' && (
        <>
          <Circle cx="16" cy="16" r="16" fill="#2775CA" />
          <Path
            d="M4.3 11.7A12.5 12.5 0 0 1 10.7 4.7M27.7 20.3a12.5 12.5 0 0 1-6.4 7"
            fill="none"
            stroke="#fff"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <Path
            d="M20.6 11.3c-.7-1.6-2.4-2.5-4.6-2.5-2.5 0-4.3 1.3-4.3 3.2 0 4.7 9 2.4 9 7 0 2-1.9 3.4-4.7 3.4-2.3 0-4-1-4.7-2.7M16 6.8v18.4"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {symbol === 'ETH' && (
        <>
          <Circle cx="16" cy="16" r="16" fill="#627EEA" />
          <Path fill="#FFF" fillOpacity="0.55" d="M16 5.6v6.8l5.7 2.5z" />
          <Path fill="#FFF" d="M16 5.6 10.3 14.9 16 12.4z" />
          <Path fill="#FFF" fillOpacity="0.55" d="M16 21.2v5.2l5.7-7.6z" />
          <Path fill="#FFF" d="M16 26.4v-5.2l-5.7-2.4z" />
          <Path fill="#FFF" fillOpacity="0.2" d="M16 20.1l5.7-3.3-5.7-2.5z" />
          <Path fill="#FFF" fillOpacity="0.5" d="M10.3 16.8l5.7 3.3v-5.8z" />
        </>
      )}
      {symbol === 'SOL' && (
        <>
          <Circle cx="16" cy="16" r="16" fill="#0E0E12" />
          <Defs>
            <LinearGradient id="solGMock" x1="9" y1="9" x2="23" y2="23" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#9945FF" />
              <Stop offset="1" stopColor="#14F195" />
            </LinearGradient>
          </Defs>
          <Path
            fill="url(#solGMock)"
            d="M10.3 12.5l1.8-2h9.6l-1.8 2zM10.3 17l1.8-2h9.6l-1.8 2zM10.3 21.5l1.8-2h9.6l-1.8 2z"
          />
        </>
      )}
      {symbol === 'BNB' && (
        <>
          <Circle cx="16" cy="16" r="16" fill="#0E0E12" />
          <Path fill="#F0B90B" d="M16 6.6l2.9 2.9-2.9 2.9-2.9-2.9z" />
          <Path fill="#F0B90B" d="M16 19.6l2.9 2.9-2.9 2.9-2.9-2.9z" />
          <Path fill="#F0B90B" d="M6.6 16l2.9-2.9 2.9 2.9-2.9 2.9z" />
          <Path fill="#F0B90B" d="M25.4 16l-2.9 2.9-2.9-2.9 2.9-2.9z" />
          <Path fill="#F0B90B" d="M16 13.1l2.9 2.9-2.9 2.9-2.9-2.9z" />
        </>
      )}
    </Svg>
  );
}

function PhoneMockup() {
  const { palette } = useTheme();
  // Static replica of the Home layout, empty. The rows are layout
  // only: zero amounts, $0.00 total.
  const rows: { symbol: 'USDC' | 'ETH' | 'SOL' | 'BNB'; name: string; sub: string; value: string }[] = [
    { symbol: 'USDC', name: 'USD Coin', sub: 'Base · Solana · Ethereum · BNB', value: '0.00' },
    { symbol: 'ETH', name: 'Ethereum', sub: 'Ethereum · Base', value: '0.0000' },
    { symbol: 'SOL', name: 'Solana', sub: 'Solana', value: '0.000' },
    { symbol: 'BNB', name: 'BNB', sub: 'BNB Chain', value: '0.0000' },
  ];
  return (
    <View
      style={{
        backgroundColor: palette.soft2,
        borderRadius: 44,
        padding: 6,
        // Drop shadow under the phone, as in the reference.
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 9 },
        elevation: 8,
      }}
    >
      <View
        style={{
          width: 238,
          borderWidth: 2,
          borderColor: palette.line,
          backgroundColor: palette.bg,
          borderRadius: 38,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 16,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: 74,
            height: 5,
            borderRadius: 99,
            backgroundColor: palette.line,
            opacity: 0.55,
            alignSelf: 'center',
            marginBottom: 12,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: palette.soft2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: palette.ink }}>A1</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.ink, lineHeight: 15 }}>
              Account 1⌄
            </Text>
            <Text style={{ fontSize: 11, color: palette.muted }}>✓ 0xA37a…091C</Text>
          </View>
        </View>
        <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 2 }}>
          <Text style={{ fontSize: 11.5, color: palette.muted }}>Total balance</Text>
          <Text
            style={{
              fontFamily: FONTS.display,
              fontWeight: '800',
              fontSize: 27,
              letterSpacing: -0.8,
              color: palette.ink,
              marginTop: 2,
            }}
          >
            $0.00
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingTop: 14,
            paddingBottom: 7,
            paddingHorizontal: 2,
          }}
        >
          <Text style={{ fontSize: 10, letterSpacing: 1.3, fontWeight: '700', color: palette.muted }}>
            ASSETS
          </Text>
          <Text style={{ fontSize: 11, color: palette.muted }}>$0.00</Text>
        </View>
        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 2,
          }}
        >
          {rows.map((r, i) => (
            <View
              key={r.symbol}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: palette.line,
              }}
            >
              <MockTokenIcon symbol={r.symbol} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: palette.ink, lineHeight: 14.5 }}>
                  {r.name}
                </Text>
                <Text style={{ fontSize: 10.5, color: palette.muted }}>{r.sub}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: palette.ink }}>{r.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function WelcomeScreen({ navigation }: Props) {
  const { palette } = useTheme();
  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: 34, paddingHorizontal: 6, paddingBottom: 8 }}>
        <View
          style={{
            width: 98,
            height: 98,
            borderRadius: 49,
            backgroundColor: '#101013',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 7 },
            elevation: 6,
          }}
        >
          {/* The mark renders bare at 60 inside the 98 circle.
              Measured from the approved screenshot itself, PRIME is
              ~51% of the circle diameter — a full-size 98 mark would
              make PRIME ~85% wide, the oversized-logo error, and 80
              still makes it ~72%. At 60, PRIME is ~50 wide, the road
              base ~27, and the mark sits centred with black space
              above and below, as in the reference. */}
          <PrimeWayMark size={60} bare />
        </View>
        <Text
          style={{
            fontFamily: FONTS.display,
            fontWeight: '800',
            fontSize: 30,
            letterSpacing: -0.6,
            lineHeight: 36,
            color: palette.ink,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          Your money, on any chain
        </Text>
      </View>
      {/* The phone sits behind; the actions overlap its middle,
          starting at the Ethereum row, as in the reference. The
          6px bezel ring above the phone shifts the phone down 6px,
          so the actions start at 232, not 226. */}
      <View style={{ position: 'relative', paddingBottom: 108 }}>
        <View style={{ alignItems: 'center' }}>
          <PhoneMockup />
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 232 }}>
          <Pressable
            onPress={() => navigation.navigate('PrivyAuth', { mode: 'create', onboarding: true })}
            style={({ pressed }) => ({
              backgroundColor: palette.accent,
              borderRadius: 999,
              minHeight: 56,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.32,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 7 },
              elevation: 6,
            })}
          >
            <Text
              style={{
                fontFamily: FONTS.heading,
                fontWeight: '700',
                fontSize: 17,
                color: palette.accentInk,
              }}
            >
              Create with email
            </Text>
            <View
              style={{
                backgroundColor: palette.soft2,
                borderRadius: 999,
                paddingVertical: 4,
                paddingHorizontal: 8,
                marginLeft: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.7,
                  color: palette.muted,
                }}
              >
                PRIVY
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('CreatePhrase', { onboarding: true })}
            style={({ pressed }) => ({
              backgroundColor: palette.bg,
              borderWidth: 1,
              borderColor: palette.line,
              borderRadius: 999,
              minHeight: 48,
              padding: 12,
              marginTop: 10,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 5 },
              elevation: 4,
            })}
          >
            <Text
              style={{
                fontFamily: FONTS.heading,
                fontWeight: '600',
                fontSize: 16,
                color: palette.accent,
              }}
            >
              Create with recovery phrase
            </Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('AddWallet', { onboarding: true })}
            style={({ pressed }) => ({
              backgroundColor: palette.bg,
              borderWidth: 1,
              borderColor: palette.line,
              borderRadius: 999,
              minHeight: 48,
              padding: 12,
              marginTop: 10,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 5 },
              elevation: 4,
            })}
          >
            <Text
              style={{
                fontFamily: FONTS.heading,
                fontWeight: '600',
                fontSize: 16,
                color: palette.accent,
              }}
            >
              Import wallet
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
