// Confirm: who, how much, what they get, when. One tap.
//
// Before Send wakes up, a real check runs against live data: the
// quote is re-requested fresh (never sign a stale quote), the
// address and amount are validated, and the total balance must
// cover amount + fee. Send stays off (40% opacity) until the check
// passes. When amount + fee is more than the total balance, the
// top-up sheet opens with the real fee and the real shortfall;
// its Add button goes to Add money (Deposit), and coming back
// re-runs the check.

import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { fetchQuote, formatFee, type Quote } from '../lib/relay';
import { fetchBalances } from '../lib/balances';
import { formatMicroUsd, runConfirmCheck } from '../lib/sendCheck';
import { loadContacts } from '../store/contacts';
import { loadHistory } from '../store/history';
import { formatUsd, shortAddress } from '../lib/format';
import { pinIsSet } from '../store/settings';
import { useWallet } from '../wallet/WalletContext';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, MascotMsg, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Confirm'>;

type CheckState = 'checking' | 'passed' | 'failed';

export function ConfirmScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { address } = useWallet();
  const { draft } = route.params;
  const [pinOn, setPinOn] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>('checking');
  const [checkReason, setCheckReason] = useState<string | null>(null);
  const [freshQuote, setFreshQuote] = useState<Quote | null>(null);
  const [isNewAddress, setIsNewAddress] = useState(false);
  const [shortfallMicro, setShortfallMicro] = useState<bigint>(0n);
  const [sheetOpen, setSheetOpen] = useState(false);
  const seqRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      pinIsSet().then(setPinOn);
    }, []),
  );

  const runCheck = useCallback(async () => {
    const seq = ++seqRef.current;
    setCheckState('checking');
    setCheckReason(null);
    const result = await runConfirmCheck(
      {
        usdAmount: draft.usdAmount,
        payChainId: draft.payChainId,
        paySymbol: draft.paySymbol,
        payPrice: draft.payPrice,
        receiveSymbol: draft.receiveSymbol,
        destinationChainId: draft.networkChainId,
        recipient: draft.recipient,
        personId: draft.personId,
        quote: draft.quote,
        walletAddress: address,
      },
      {
        fetchQuoteFn: fetchQuote,
        fetchBalancesFn: fetchBalances,
        loadContactsFn: loadContacts,
        loadHistoryFn: loadHistory,
      },
    );
    if (seq !== seqRef.current) return;
    setIsNewAddress(result.isNewAddress);
    setShortfallMicro(result.shortfallMicro);
    if (result.ok) {
      // The fresh quote is the one the send signs. The draft quote
      // is never used after this point.
      setFreshQuote(result.quote);
      setCheckState('passed');
      setSheetOpen(false);
    } else {
      setFreshQuote(result.quote);
      setCheckState('failed');
      setCheckReason(result.reason);
      setSheetOpen(result.needsTopUp);
    }
  }, [address, draft]);

  // Runs on first open and every time the user comes back, including
  // from Add money, so a topped-up balance closes the sheet.
  useFocusEffect(
    useCallback(() => {
      void runCheck();
    }, [runCheck]),
  );

  const feeTxt = formatFee(freshQuote?.feesUsd ?? draft.quote.feesUsd);
  const shortfallTxt = formatMicroUsd(shortfallMicro);
  const payAmount =
    draft.payPrice > 0 ? Number(draft.usdAmount) / draft.payPrice : 0;
  const checkedDraft = freshQuote ? { ...draft, quote: freshQuote } : draft;

  const send = () => {
    if (checkState !== 'passed' || !freshQuote) return;
    if (pinOn) navigation.navigate('PinGate', { draft: checkedDraft });
    else navigation.navigate('Sending', { draft: checkedDraft });
  };

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <Heading>Check and send</Heading>
      <View
        style={{
          backgroundColor: palette.soft,
          borderRadius: 22,
          padding: 18,
          marginTop: 14,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>Sending to</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink }}>
            {draft.personName}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>
            {draft.personName} receives
          </Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.accent }}>
            {(freshQuote ?? draft.quote).outputAmountFormatted}{' '}
            {(freshQuote ?? draft.quote).outputCurrency}{' '}
            <Text
              style={{
                fontSize: 10.5,
                backgroundColor: palette.goodSoft,
                color: palette.good,
                borderRadius: 999,
              }}
            >
              Live
            </Text>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>You send</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink }}>
            {formatUsd(Number(draft.usdAmount))} · {payAmount.toFixed(3)} {draft.paySymbol}
          </Text>
        </View>
        {feeTxt ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
            <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>Fee</Text>
            <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink }}>
              {feeTxt}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>Where</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink }}>
            {draft.networkName}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>Arrives</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink }}>
            In a few minutes
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: 12,
            marginTop: 8,
            borderTopWidth: 1,
            borderTopColor: palette.line,
          }}
        >
          {checkState === 'checking' ? (
            <Text style={{ fontWeight: '500', fontSize: 15, color: palette.muted }}>
              Checking…
            </Text>
          ) : checkState === 'passed' ? (
            <>
              <Text style={{ fontSize: 15, color: palette.good }}>✓</Text>
              <Text style={{ fontWeight: '600', fontSize: 15, color: palette.good }}>
                Checked, ready to send
              </Text>
            </>
          ) : (
            <Text style={{ fontWeight: '600', fontSize: 15, color: palette.muted }}>
              {checkReason ?? 'Could not check this send right now. Try again in a moment.'}
            </Text>
          )}
        </View>
      </View>
      {isNewAddress && checkState !== 'checking' ? (
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 14,
            color: palette.muted,
            marginTop: 14,
            lineHeight: 20,
          }}
        >
          You have never sent to {shortAddress(draft.recipient)} before. Check it is really theirs.
        </Text>
      ) : null}
      <MascotMsg expression="thinking" text="I've found the way there. All set when you are." />
      <BigButton
        title={`Send $${draft.usdAmount} to ${draft.personName}`}
        onPress={send}
        disabled={checkState !== 'passed'}
      />
      {checkState === 'failed' && !sheetOpen ? (
        <BigButton title="Check again" secondary onPress={runCheck} />
      ) : null}

      <Modal
        visible={sheetOpen && shortfallMicro > 0n}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setSheetOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: palette.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 22,
              paddingBottom: 28,
            }}
            onPress={() => {}}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: palette.line,
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />
            <Text style={{ fontFamily: FONTS.display, fontSize: 22, color: palette.ink }}>
              Add a little more to send
            </Text>
            <Text
              style={{
                fontFamily: FONTS.bodySemi,
                fontSize: 15,
                color: palette.muted,
                marginTop: 10,
                lineHeight: 22,
              }}
            >
              It costs {feeTxt ?? 'a little'} to send this. Your balance is {shortfallTxt} short.
            </Text>
            <BigButton
              title={`Add ${shortfallTxt}`}
              onPress={() => navigation.navigate('Deposit')}
            />
            <BigButton title="Not now" secondary onPress={() => setSheetOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
