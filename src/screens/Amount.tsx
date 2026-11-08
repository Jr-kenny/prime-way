// Amount: type dollars, pick the asset that pays. What they receive
// is the star, from a live Relay quote. No made-up numbers: when the
// quote cannot be reached, the screen says so.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, SendDraft } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { fetchBalances, type AssetBalance } from '../lib/balances';
import { fetchQuote, formatFee, quoteRequestFor, type Quote } from '../lib/relay';
import { tokenOn } from '../lib/chains';
import { formatToken, formatUsd } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';
import { Pip } from '../components/Pip';

type Props = NativeStackScreenProps<RootStackParamList, 'Amount'>;

const RECEIVE_OPTIONS = ['USDC', 'USDT', 'ETH'] as const;

type QuoteState = 'idle' | 'loading' | 'live' | 'error';

export function AmountScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { address } = useWallet();
  const { personName, personId, recipient, networkName, networkChainId } = route.params;

  const [assets, setAssets] = useState<AssetBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [payIndex, setPayIndex] = useState(0);
  const [usd, setUsd] = useState('100');
  const [receiveSym, setReceiveSym] = useState<string>('USDC');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>('idle');
  const [retryTick, setRetryTick] = useState(0);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!address) return;
    fetchBalances(address)
      .then((res) => {
        setAssets(res.assets);
        const bnb = res.assets.findIndex((a) => a.symbol === 'BNB');
        setPayIndex(bnb >= 0 ? bnb : 0);
      })
      .catch(() => setAssets([]))
      .finally(() => setBalancesLoading(false));
  }, [address]);

  const pay = assets[payIndex] ?? null;
  const payUsdValue = pay && pay.priceUsd !== null ? pay.amount * pay.priceUsd : null;
  const usdNum = parseFloat(usd.replace(',', '.'));
  const valid = !!pay && !Number.isNaN(usdNum) && usdNum > 0 && payUsdValue !== null && usdNum <= payUsdValue;

  const receiveAvailable = useMemo(
    () =>
      RECEIVE_OPTIONS.map((sym) => ({
        sym,
        ok: !!tokenOn(networkChainId, sym),
      })),
    [networkChainId],
  );

  // Live quote, debounced while typing.
  useEffect(() => {
    if (!valid || !pay || !address) {
      setQuote(null);
      setQuoteState('idle');
      return;
    }
    const req = quoteRequestFor(
      usd,
      pay.chainId,
      pay.symbol,
      pay.priceUsd ?? 0,
      networkChainId,
      receiveSym,
      address,
      recipient,
    );
    if (!req) {
      setQuote(null);
      setQuoteState('idle');
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setQuoteState((s) => (s === 'live' ? s : 'loading'));
    const seq = ++seqRef.current;
    timerRef.current = setTimeout(() => {
      fetchQuote(req)
        .then((q) => {
          if (seq !== seqRef.current) return;
          if (!q.outputAmountFormatted || Number(q.outputAmountFormatted) <= 0) {
            setQuote(null);
            setQuoteState('error');
            return;
          }
          setQuote(q);
          setQuoteState('live');
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          setQuote(null);
          setQuoteState('error');
        });
    }, 650);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usd, pay?.symbol, pay?.chainId, receiveSym, networkChainId, valid, retryTick]);

  const retryQuote = () => {
    seqRef.current++;
    setQuoteState('loading');
    setRetryTick((t) => t + 1);
  };

  const continueToConfirm = () => {
    if (!quote || !pay || !address) return;
    const draft: SendDraft = {
      personId,
      personName,
      recipient,
      networkName,
      networkChainId,
      usdAmount: usd,
      payChainId: pay.chainId,
      paySymbol: pay.symbol,
      payPrice: pay.priceUsd ?? 0,
      receiveSymbol: receiveSym,
      quote,
    };
    navigation.navigate('Confirm', { draft });
  };

  if (!address) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <Heading>How much?</Heading>
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 10, fontSize: 15 }}>
          Add a wallet first.
        </Text>
        <BigButton title="Add wallet" onPress={() => navigation.navigate('AddWallet')} />
      </Screen>
    );
  }

  if (balancesLoading) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <Heading>How much for {personName}?</Heading>
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 16 }}>
          Checking your balances…
        </Text>
      </Screen>
    );
  }

  if (assets.length === 0) {
    return (
      <Screen>
        <BackButton title="Back" onPress={() => navigation.goBack()} />
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Pip expression="thinking" size={96} />
        </View>
        <Heading center>Nothing to send yet</Heading>
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 15,
            color: palette.muted,
            textAlign: 'center',
            marginTop: 12,
            lineHeight: 22,
          }}
        >
          Your wallet is empty on every network. Deposit first.
        </Text>
        <BigButton title="Deposit" onPress={() => navigation.navigate('Deposit')} />
      </Screen>
    );
  }

  const feeTxt = quote ? formatFee(quote.feesUsd) : null;

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Heading center size={24}>
          How much for {personName}?
        </Heading>
        <Tip text="Type dollars. Prime Way works out how much of the asset you pick that is." />
      </View>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 34, color: palette.muted }}>$</Text>
          <TextInput
            value={usd}
            onChangeText={(t) => {
              setUsd(t.replace(/[^0-9.,]/g, ''));
              setQuote(null);
            }}
            keyboardType="decimal-pad"
            style={{
              fontFamily: FONTS.display,
              fontSize: 52,
              color: palette.ink,
              textAlign: 'center',
              minWidth: 130,
            }}
          />
        </View>
      </View>

      <Text style={{ fontFamily: FONTS.heading, fontSize: 14, color: palette.ink, marginTop: 14, marginBottom: 4 }}>
        Pay with
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {assets.map((a, i) => (
          <Pressable
            key={`${a.chainId}-${a.symbol}`}
            onPress={() => {
              setPayIndex(i);
              setQuote(null);
            }}
            style={{
              borderWidth: 2,
              borderColor: payIndex === i ? palette.accent : palette.line,
              backgroundColor: payIndex === i ? palette.accentSoft : palette.surface,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 16,
              minHeight: 44,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.heading,
                fontSize: 14,
                color: payIndex === i ? palette.accent : palette.ink,
              }}
            >
              {a.symbol} · {a.priceUsd !== null ? formatUsd(a.amount * a.priceUsd, 0) : formatToken(a.amount, a.symbol)}
            </Text>
          </Pressable>
        ))}
      </View>
      {pay && !Number.isNaN(usdNum) && usdNum > 0 && pay.priceUsd ? (
        <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '700', marginTop: 8 }}>
          That is {(usdNum / pay.priceUsd).toFixed(pay.priceUsd > 100 ? 3 : 2)} {pay.symbol} from
          your {pay.symbol} on {pay.chainName}
        </Text>
      ) : null}

      <Text style={{ fontFamily: FONTS.heading, fontSize: 14, color: palette.ink, marginTop: 14 }}>
        {personName} receives
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {receiveAvailable.map(({ sym, ok }) => (
          <Pressable
            key={sym}
            disabled={!ok}
            onPress={() => {
              setReceiveSym(sym);
              setQuote(null);
            }}
            style={{
              flex: 1,
              minWidth: 100,
              borderWidth: 2,
              borderColor: receiveSym === sym ? palette.accent : palette.line,
              backgroundColor: receiveSym === sym ? palette.accentSoft : palette.surface,
              borderRadius: 16,
              padding: 11,
              opacity: ok ? 1 : 0.6,
            }}
          >
            <Text style={{ fontFamily: FONTS.display, fontSize: 16, color: palette.ink }}>
              {sym}
              {receiveSym === sym ? ' ✓' : ''}
            </Text>
            <Text style={{ fontSize: 12, color: palette.muted, fontWeight: '700', marginTop: 2 }}>
              {ok ? `Available on ${networkName}` : `Not on ${networkName}`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 14 }}>
        {quoteState === 'live' && quote ? (
          <>
            <View
              style={{
                backgroundColor: palette.accentSoft,
                borderRadius: 22,
                padding: 18,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.muted }}>
                {personName} will receive
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 37,
                  color: palette.accent,
                  lineHeight: 42,
                  marginTop: 4,
                }}
              >
                {quote.outputAmountFormatted} {quote.outputCurrency}{' '}
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    fontFamily: FONTS.heading,
                    backgroundColor: palette.goodSoft,
                    color: palette.good,
                    borderRadius: 999,
                  }}
                >
                  Live
                </Text>
              </Text>
              <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600', marginTop: 4 }}>
                On {networkName}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: palette.muted, textAlign: 'center', marginTop: 12, fontWeight: '600' }}>
              {feeTxt ? `Fee ${feeTxt}. A tiny fee comes out of the amount. Nothing extra to pay.` : 'A tiny fee comes out of the amount. Nothing extra to pay.'}
            </Text>
          </>
        ) : quoteState === 'error' ? (
          <View
            style={{
              backgroundColor: palette.badSoft,
              borderRadius: 18,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink, textAlign: 'center' }}>
              Can't reach the live quote right now
            </Text>
            <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600', textAlign: 'center', marginTop: 6 }}>
              Check your connection and try again. Nothing is sent until you tap send.
            </Text>
            <BigButton title="Try again" secondary onPress={retryQuote} />
          </View>
        ) : valid ? (
          <View
            style={{
              backgroundColor: palette.accentSoft,
              borderRadius: 22,
              padding: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.muted }}>
              {personName} will receive
            </Text>
            <Text style={{ fontFamily: FONTS.display, fontSize: 37, color: palette.accent, marginTop: 4 }}>
              …
            </Text>
            <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600' }}>
              Checking the live quote…
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: palette.accentSoft,
              borderRadius: 22,
              padding: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: palette.muted }}>
              {personName} will receive
            </Text>
            <Text style={{ fontFamily: FONTS.display, fontSize: 37, color: palette.accent, marginTop: 4 }}>
              ,
            </Text>
            <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600' }}>
              {payUsdValue !== null && usdNum > payUsdValue
                ? `That is more than your ${pay?.symbol} is worth (${formatUsd(payUsdValue, 0)})`
                : 'Type an amount to see what they get'}
            </Text>
          </View>
        )}
      </View>

      <BigButton
        title="Keep going"
        onPress={continueToConfirm}
        disabled={quoteState !== 'live' || !quote}
      />
    </Screen>
  );
}
