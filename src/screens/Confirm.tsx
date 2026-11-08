// Confirm: who, how much, what they get, when. One tap. The send
// button stays off until the quote carries the details the wallet
// needs to send it.

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { formatFee, quoteCanSend } from '../lib/relay';
import { formatUsd } from '../lib/format';
import { pinIsSet } from '../store/settings';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { BackButton, BigButton, Heading, MascotMsg, Screen } from '../components/ui';
import { Tip } from '../components/Tip';

type Props = NativeStackScreenProps<RootStackParamList, 'Confirm'>;

export function ConfirmScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { draft } = route.params;
  const [pinOn, setPinOn] = useState(false);

  useEffect(() => {
    pinIsSet().then(setPinOn);
  }, []);

  const canSend = quoteCanSend(draft.quote);
  const feeTxt = formatFee(draft.quote.feesUsd);
  const payAmount =
    draft.payPrice > 0 ? Number(draft.usdAmount) / draft.payPrice : 0;

  const send = () => {
    if (!canSend) return;
    if (pinOn) navigation.navigate('PinGate', { draft });
    else navigation.navigate('Sending', { draft });
  };

  return (
    <Screen>
      <BackButton title="Back" onPress={() => navigation.goBack()} />
      <Heading>Just to check</Heading>
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
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>You send</Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.ink }}>
            {formatUsd(Number(draft.usdAmount))} · {payAmount.toFixed(3)} {draft.paySymbol}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
          <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 15 }}>
            {draft.personName} receives
          </Text>
          <Text style={{ fontFamily: FONTS.heading, fontSize: 15, color: palette.accent }}>
            {draft.quote.outputAmountFormatted} {draft.quote.outputCurrency}{' '}
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
      </View>
      <MascotMsg expression="thinking" text="I've found the way there. All set when you are." />
      {!canSend ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 16,
            gap: 4,
          }}
        >
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14, color: palette.muted }}>
            Send is not ready yet.
          </Text>
          <Tip text="The quote came back without the details the wallet needs to send it. The backend needs one small change first, then this button works." />
        </View>
      ) : null}
      <BigButton
        title={`Send to ${draft.personName}`}
        onPress={send}
        disabled={!canSend}
      />
    </Screen>
  );
}
