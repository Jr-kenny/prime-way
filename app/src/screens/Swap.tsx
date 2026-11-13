// Swap: move one asset to another chain as the same asset, or to
// a different asset on another chain, through a live Relay quote.
// The quote is the same one a send uses, and the move goes through
// the same Confirm, PIN, Sending and Arrived flow, with the
// recipient being your own address.
//
// What this is NOT: a same-chain, same-token swap. Relay has no
// trade to quote when origin and destination are the same token on
// the same chain, so that combination is blocked here with a plain
// message instead of a fake quote. Pick a different token or a
// different chain and the quote is real.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, SendDraft, TabParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { fetchBalances, type AssetBalance } from '../lib/balances';
import { fetchQuote, formatFee, hasPositiveOutputAmount, quoteRequestFor, type Quote } from '../lib/relay';
import { chainById, SUPPORTED_CHAINS, tokenOn } from '../lib/chains';
import { formatToken, formatUsd } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BigButton, Heading, Screen } from '../components/ui';
import { Tip } from '../components/Tip';
import { Pip } from '../components/Pip';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'SwapTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

const RECEIVE_OPTIONS = ['USDC', 'USDT', 'ETH'] as const;

type QuoteState = 'idle' | 'loading' | 'live' | 'error';

export function SwapScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { address } = useWallet();

  const [assets, setAssets] = useState<AssetBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [payIndex, setPayIndex] = useState(0);
  const [usd, setUsd] = useState('100');
  const [destChainId, setDestChainId] = useState(8453);
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
  const destChain = chainById(destChainId);
  const sameTokenSameChain =
    !!pay && pay.chainId === destChainId && pay.symbol === receiveSym;

  const receiveAvailable = useMemo(
    () =>
      RECEIVE_OPTIONS.map((sym) => ({
        sym,
        ok: !!tokenOn(destChainId, sym),
      })),
    [destChainId],
  );

  // Live quote, debounced while typing. A same-chain same-token
  // move has no quote to fetch, so it never asks.
  useEffect(() => {
    if (!valid || !pay || !address || sameTokenSameChain) {
      setQuote(null);
      setQuoteState('idle');
      return;
    }
    const req = quoteRequestFor(
      usd,
      pay.chainId,
      pay.symbol,
      pay.priceUsd ?? 0,
      destChainId,
      receiveSym,
      address,
      address,
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
          if (!hasPositiveOutputAmount(q)) {
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
  }, [usd, pay?.symbol, pay?.chainId, receiveSym, destChainId, valid, retryTick, sameTokenSameChain]);

  const retryQuote = () => {
    seqRef.current++;
    setQuoteState('loading');
    setRetryTick((t) => t + 1);
  };

  const continueToConfirm = () => {
    if (!quote || !pay || !address || !destChain) return;
    const draft: SendDraft = {
      personId: null,
      personName: 'You',
      recipient: address,
      networkName: destChain.name,
      networkChainId: destChainId,
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
        <Heading>Swap</Heading>
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 10, fontSize: 15 }}>
          Add a wallet first.
        </Text>
        <BigButton title="Add wallet" onPress={() => navigation.navigate('AddWallet', {})} />
      </Screen>
    );
  }

  if (balancesLoading) {
    return (
      <Screen>
        <Heading>Swap</Heading>
        <Text style={{ fontFamily: FONTS.bodySemi, color: palette.muted, marginTop: 16 }}>
          Checking your balances…
        </Text>
      </Screen>
    );
  }

  if (assets.length === 0) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Pip expression="thinking" size={96} />
        </View>
        <Heading center>Nothing to swap yet</Heading>
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
          Your wallet is empty. Receive money first.
        </Text>
        <BigButton title="Receive" onPress={() => navigation.navigate('Receive')} />
      </Screen>
    );
  }

  const feeTxt = quote ? formatFee(quote.feesUsd) : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Heading>Swap</Heading>
        <Tip text="Move an asset to another chain, or change it into another asset on the way. The move lands in your own wallet." />
      </View>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 34, color: palette.muted }}>$</Text>
          <TextInput
            value={usd}
            onChangeText={(t) => {
              setUsd(t.replace(/[^0-9.,]/g, ''));
              setQuote(null);
            }}
            keyboardType="decimal-pad"
            style={{
              fontFamily: FONTS.display,
              fontWeight: '900',
              fontSize: 52,
              color: palette.ink,
              textAlign: 'center',
              minWidth: 130,
            }}
          />
        </View>
      </View>

      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 14, color: palette.ink, marginTop: 14, marginBottom: 4 }}>
        From
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
                fontWeight: '700',
                fontSize: 14,
                color: payIndex === i ? palette.accent : palette.ink,
              }}
            >
              {a.symbol} · {a.chainName} · {a.priceUsd !== null ? formatUsd(a.amount * a.priceUsd, 0) : formatToken(a.amount, a.symbol)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 14, color: palette.ink, marginTop: 14, marginBottom: 4 }}>
        To chain
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SUPPORTED_CHAINS.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              setDestChainId(c.id);
              setQuote(null);
            }}
            style={{
              borderWidth: 2,
              borderColor: destChainId === c.id ? palette.accent : palette.line,
              backgroundColor: destChainId === c.id ? palette.accentSoft : palette.surface,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 16,
              minHeight: 44,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.heading,
                fontWeight: '700',
                fontSize: 14,
                color: destChainId === c.id ? palette.accent : palette.ink,
              }}
            >
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 14, color: palette.ink, marginTop: 14 }}>
        You receive
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
            <Text style={{ fontFamily: FONTS.display, fontWeight: '800', fontSize: 16, color: palette.ink }}>
              {sym}
            </Text>
            <Text style={{ fontSize: 12, color: palette.muted, fontWeight: '700', marginTop: 2 }}>
              {ok ? `Available on ${destChain?.name ?? ''}` : `Not on ${destChain?.name ?? ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 14 }}>
        {sameTokenSameChain ? (
          <View
            style={{
              backgroundColor: palette.soft,
              borderRadius: 18,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15, color: palette.ink, textAlign: 'center' }}>
              That is already where it is
            </Text>
            <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600', textAlign: 'center', marginTop: 6 }}>
              Same token, same chain: there is nothing to move. Pick a different token or a different chain.
            </Text>
          </View>
        ) : quoteState === 'live' && quote ? (
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
                You will receive
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.display,
                  fontWeight: '900',
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
                On {destChain?.name ?? ''}, in your wallet
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
            <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15, color: palette.ink, textAlign: 'center' }}>
              Can't reach the live quote right now
            </Text>
            <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600', textAlign: 'center', marginTop: 6 }}>
              Check your connection and try again. Nothing is moved until you confirm it.
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
              You will receive
            </Text>
            <Text style={{ fontFamily: FONTS.display, fontWeight: '900', fontSize: 37, color: palette.accent, marginTop: 4 }}>
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
              You will receive
            </Text>
            <Text style={{ fontFamily: FONTS.display, fontWeight: '900', fontSize: 37, color: palette.accent, marginTop: 4 }}>
              ,
            </Text>
            <Text style={{ fontSize: 13.5, color: palette.muted, fontWeight: '600' }}>
              {payUsdValue !== null && usdNum > payUsdValue
                ? `That is more than your ${pay?.symbol} is worth (${formatUsd(payUsdValue, 0)})`
                : 'Type an amount to see what you get'}
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
