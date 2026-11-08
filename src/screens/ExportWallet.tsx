// Export wallet: the recovery phrase and private key, behind a
// warning. Only an imported wallet has a phrase or key to show; a
// Privy wallet is kept by Privy.

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getImportedSecret, useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'ExportWallet'>;

export function ExportWalletScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { source } = useWallet();
  const [secret, setSecret] = useState<{ kind: 'key' | 'mnemonic'; secret: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    getImportedSecret().then((s) => {
      setSecret(s);
      setLoaded(true);
    });
  }, []);

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    setNote(`${what} copied. Keep it somewhere safe.`);
    setTimeout(() => setNote(''), 2500);
  };

  const words = secret?.kind === 'mnemonic' ? secret.secret.split(/\s+/) : [];
  const key =
    secret?.kind === 'key'
      ? secret.secret
      : secret?.kind === 'mnemonic'
        ? null
        : null;

  return (
    <Screen>
      <BackButton title="Security" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading>Export wallet</Heading>
        <Tip text="Anyone who has your phrase or key has your wallet. Copy it somewhere safe." />
      </View>
      <View
        style={{
          backgroundColor: palette.badSoft,
          borderRadius: 16,
          padding: 13,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'flex-start',
          marginTop: 12,
        }}
      >
        <Text style={{ fontSize: 16, color: palette.bad }}>⚠</Text>
        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', lineHeight: 20, color: palette.ink }}>
          Never share your phrase or key with anyone. Prime Way will never ask for it.
        </Text>
      </View>

      {source === 'privy' ? (
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 15,
            color: palette.muted,
            marginTop: 20,
            lineHeight: 22,
          }}
        >
          This wallet was made with Privy. There is no phrase or key on this phone to show. Privy keeps the wallet safe under your Google account.
        </Text>
      ) : !loaded ? (
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 20 }}>
          Checking…
        </Text>
      ) : !secret ? (
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 15,
            color: palette.muted,
            marginTop: 20,
            lineHeight: 22,
          }}
        >
          No imported wallet here. Import a wallet first to see its phrase or key.
        </Text>
      ) : (
        <>
          {secret.kind === 'mnemonic' ? (
            <>
              <Text
                style={{
                  fontFamily: FONTS.heading,
                  fontSize: 12.5,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: palette.muted,
                  marginTop: 20,
                }}
              >
                Recovery phrase
              </Text>
              {showPhrase ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  {words.map((w, i) => (
                    <View
                      key={i}
                      style={{
                        backgroundColor: palette.soft,
                        borderRadius: 12,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                        flexDirection: 'row',
                        gap: 6,
                      }}
                    >
                      <Text style={{ color: palette.muted, fontSize: 11, fontFamily: FONTS.heading }}>
                        {i + 1}
                      </Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.ink }}>
                        {w}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: palette.soft,
                    borderRadius: 16,
                    padding: 22,
                    marginTop: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 14, letterSpacing: 3 }}>
                    •••• •••• •••• ••••
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <BigButton
                    title={showPhrase ? 'Hide' : 'Show'}
                    secondary
                    onPress={() => setShowPhrase((s) => !s)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <BigButton title="Copy phrase" onPress={() => copy(secret.secret, 'Phrase')} />
                </View>
              </View>
            </>
          ) : null}

          {key ? (
            <>
              <Text
                style={{
                  fontFamily: FONTS.heading,
                  fontSize: 12.5,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: palette.muted,
                  marginTop: 20,
                }}
              >
                Private key
              </Text>
              <View
                style={{
                  backgroundColor: palette.soft,
                  borderRadius: 14,
                  padding: 13,
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: palette.ink,
                    lineHeight: 20,
                  }}
                >
                  {showKey ? key : '••••••••••••••••••••••••'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <BigButton
                    title={showKey ? 'Hide' : 'Show'}
                    secondary
                    onPress={() => setShowKey((s) => !s)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <BigButton title="Copy key" onPress={() => copy(key, 'Private key')} />
                </View>
              </View>
            </>
          ) : null}
          {note ? (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 12.5,
                color: palette.muted,
                fontWeight: '700',
                marginTop: 12,
              }}
            >
              {note}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
