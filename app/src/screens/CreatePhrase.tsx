// Create with recovery phrase: a fresh 12-word phrase is made on
// this phone, shown once, and confirmed by tapping the words back
// in order. Only then is the wallet saved, through the same import
// path as any other phrase wallet.

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { english, generateMnemonic } from 'viem/accounts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePhrase'>;

export function CreatePhraseScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { importWallet } = useWallet();
  const onboarding = route.params?.onboarding === true;
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // Make the phrase once, on mount, and keep it in state only.
    // It is saved to the secure store only after the user proves
    // they wrote it down by tapping the words back in order.
    const phrase = generateMnemonic(english);
    setMnemonic(phrase);
    const words = phrase.split(' ');
    setOrder(words.map((_, i) => i).sort(() => Math.random() - 0.5));
  }, []);

  const words = mnemonic ? mnemonic.split(' ') : [];

  const tapWord = (idx: number) => {
    if (confirmed || picked.includes(idx)) return;
    const next = [...picked, idx];
    setPicked(next);
    if (next.length === words.length) {
      const correct = next.every((w, i) => w === i);
      if (!correct) {
        setError('That order was not right. Try again from the start.');
        setPicked([]);
      } else {
        setError(null);
        setConfirmed(true);
      }
    }
  };

  const finish = async () => {
    if (!mnemonic || !confirmed || busy) return;
    setBusy(true);
    try {
      await importWallet('mnemonic', mnemonic);
      if (onboarding) {
        navigation.reset({ index: 0, routes: [{ name: 'SetupPin', params: {} }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
      }
    } catch {
      setError('The wallet could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!mnemonic) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <Heading>Making your phrase…</Heading>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading size={23}>Write these words down</Heading>
        <Tip text="These 12 words are the only way back into this wallet. Write them on paper, in order, and keep them somewhere safe." />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
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
            <Text style={{ color: palette.muted, fontSize: 11, fontFamily: FONTS.heading, fontWeight: '700' }}>
              {i + 1}
            </Text>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.ink }}>{w}</Text>
          </View>
        ))}
      </View>
      <Text
        style={{
          fontFamily: FONTS.heading,
          fontWeight: '700',
          fontSize: 13.5,
          color: palette.ink,
          marginTop: 22,
          marginBottom: 10,
        }}
      >
        {confirmed ? 'You got them all in order.' : 'Tap the words back in order to prove you wrote them down:'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {order.map((wordIdx) => {
          const position = picked.indexOf(wordIdx);
          const selected = position >= 0;
          const correctSoFar = selected && picked[position] === position;
          return (
            <Pressable
              key={wordIdx}
              onPress={() => tapWord(wordIdx)}
              disabled={confirmed}
              style={{
                borderWidth: 2,
                borderColor: selected
                  ? correctSoFar
                    ? palette.good
                    : palette.bad
                  : palette.line,
                backgroundColor: selected
                  ? correctSoFar
                    ? palette.goodSoft
                    : palette.badSoft
                  : palette.surface,
                borderRadius: 999,
                paddingVertical: 10,
                paddingHorizontal: 14,
                minHeight: 44,
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.heading,
                  fontWeight: '700',
                  fontSize: 14,
                  color: palette.ink,
                }}
              >
                {words[wordIdx]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: palette.bad, marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
      <BigButton
        title={busy ? 'Please wait…' : 'Save wallet'}
        onPress={finish}
        disabled={!confirmed || busy}
      />
    </Screen>
  );
}
