// Sending: you watch the money travel, and change into their money
// on the way. The animation runs while the real send is watched:
// deposit goes out, then the backend is polled until the money lands
// or comes back.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useWallet } from '../wallet/WalletContext';
import { fetchStatus } from '../lib/relay';
import { executeQuoteSteps, executorFromWalletClient, PartialExecutionError } from '../lib/send';
import { addHistory, updateHistoryStatus } from '../store/history';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { Pip } from '../components/Pip';
import { Heading, Screen } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Sending'>;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function SendingScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const { getWalletClient, address } = useWallet();
  const { draft } = route.params;

  const [phase, setPhase] = useState<'sending' | 'waiting'>('sending');
  const [converted, setConverted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const progressRef = useRef(0);
  const doneRef = useRef(false);

  // Coin position along the route.
  const coinLeft = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['10%', '90%'],
  });
  const coinTop = progress.interpolate({
    inputRange: [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1],
    outputRange: ['79%', '52%', '33%', '24%', '26%', '42%', '64%'],
  });
  const routeDone = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });
  const sparkOpacity = progress.interpolate({
    inputRange: [0.42, 0.5, 1],
    outputRange: [0, 1, 1],
  });

  useEffect(() => {
    const loop = () => {
      progress.setValue(0);
      progressRef.current = 0;
      Animated.timing(progress, {
        toValue: 1,
        duration: 4600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !doneRef.current) loop();
      });
    };
    loop();
    const id = progress.addListener(({ value }) => {
      progressRef.current = value;
      if (value > 0.42 && value < 0.58) setConverted(true);
    });
    return () => {
      progress.removeListener(id);
      doneRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      doneRef.current = true;
      cancelled = true;
    };

    const run = async () => {
      try {
        const client = await getWalletClient(draft.payChainId);
        if (!client || !address) throw new Error('No wallet to send with.');
        const executor = executorFromWalletClient(client, address);
        const { depositTx } = await executeQuoteSteps(draft.quote, executor);
        if (cancelled) return;
        setPhase('waiting');
        await addHistory({
          requestId: draft.quote.requestId,
          toName: draft.personName,
          toNetwork: draft.networkName,
          toAddress: draft.recipient,
          usd: Number(draft.usdAmount),
          received: `${draft.quote.outputAmountFormatted ?? ''} ${draft.quote.outputCurrency}`,
          receiveSymbol: draft.quote.outputCurrency,
          status: 'pending',
          date: Date.now(),
          depositTx,
        });
        const started = Date.now();
        for (;;) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 4000));
          if (cancelled) return;
          // The timeout is checked every round, before the fetch, so
          // a status call that keeps throwing cannot keep the loop
          // alive past it.
          if (Date.now() - started > 10 * 60 * 1000) {
            finish();
            navigation.replace('SendError', {
              title: 'Still on its way',
              message: `It is taking longer than usual. Your send is saved in Activity, and you can check it there.`,
              draft,
            });
            return;
          }
          let status;
          try {
            status = await fetchStatus(draft.quote.requestId);
          } catch {
            continue;
          }
          if (status.status === 'success') {
            await updateHistoryStatus(
              draft.quote.requestId,
              'sent',
              `${draft.quote.outputAmountFormatted ?? ''} ${draft.quote.outputCurrency}`,
            );
            finish();
            navigation.replace('Arrived', {
              draft,
              received: `${draft.quote.outputAmountFormatted ?? ''} ${draft.quote.outputCurrency}`,
              txHash: status.txHashes[0],
            });
            return;
          }
          if (status.status === 'refund') {
            await updateHistoryStatus(draft.quote.requestId, 'refunded');
            finish();
            navigation.replace('SendError', {
              title: 'That one came back',
              message: `The money could not get to ${draft.personName}, so it came back to you. Nothing was lost.`,
              draft,
            });
            return;
          }
          // 'waiting', 'depositing', 'pending' and 'failure' all keep waiting.
        }
      } catch (err) {
        if (cancelled) return;
        finish();
        // The approval already went out: say so honestly, and save
        // it in Activity so it is not lost. This check comes before
        // the wallet-rejection check, because a deposit rejected in
        // the wallet after a landed approval still leaves the
        // approval open.
        if (err instanceof PartialExecutionError && err.approveTx) {
          await addHistory({
            requestId: draft.quote.requestId,
            toName: draft.personName,
            toNetwork: draft.networkName,
            toAddress: draft.recipient,
            usd: Number(draft.usdAmount),
            received: `${draft.quote.outputAmountFormatted ?? ''} ${draft.quote.outputCurrency}`,
            receiveSymbol: draft.quote.outputCurrency,
            status: 'failed',
            date: Date.now(),
            approveTx: err.approveTx,
          });
          navigation.replace('SendError', {
            title: 'That one could not go through',
            message: `The approval went through, then the send stopped. Your money is still yours, but the approval is still open. It is saved in Activity.`,
            draft,
          });
          return;
        }
        const message =
          err instanceof Error && /rejected/i.test(err.message)
            ? 'You said no in your wallet. Nothing moved.'
            : 'Something went wrong before the money moved. Your money is still all yours.';
        navigation.replace('SendError', {
          title: 'That one could not go through',
          message,
          draft,
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepState = (i: number): 'done' | 'doing' | 'todo' => {
    if (phase === 'sending') return i === 0 ? 'doing' : 'todo';
    return i === 0 ? 'done' : i === 1 ? 'doing' : 'todo';
  };

  const steps = [
    'On its way',
    `Making it just right for ${draft.personName}…`,
    'Almost with them',
  ];

  return (
    <Screen>
      <Heading center size={25}>
        Sending to {draft.personName}
      </Heading>
      <View style={{ position: 'relative', height: 190, width: '100%', marginVertical: 8 }}>
        <Svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 276 150" preserveAspectRatio="none">
          <Path
            d="M28 118 C 90 30, 186 30, 248 96"
            stroke={palette.line}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="1 9"
          />
          <AnimatedPath
            d="M28 118 C 90 30, 186 30, 248 96"
            stroke={palette.accent}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={100}
            strokeDashoffset={routeDone}
          />
        </Svg>
        <View
          style={{
            position: 'absolute',
            left: 28,
            top: 118,
            transform: [{ translateX: -20 }, { translateY: -8 }],
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: palette.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 13, color: '#fff', fontFamily: FONTS.heading }}>You</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '800', fontFamily: FONTS.heading, color: palette.muted }}>
            You
          </Text>
        </View>
        <View
          style={{
            position: 'absolute',
            left: 248,
            top: 96,
            transform: [{ translateX: -20 }, { translateY: -8 }],
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: palette.soft2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16, color: palette.ink, fontFamily: FONTS.heading }}>
              {draft.personName[0]}
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '800', fontFamily: FONTS.heading, color: palette.muted }}>
            {draft.personName}
          </Text>
        </View>
        <Animated.View
          style={{
            position: 'absolute',
            left: coinLeft,
            top: coinTop,
            width: 46,
            height: 46,
            marginLeft: -23,
            marginTop: -23,
            borderRadius: 23,
            backgroundColor: converted ? palette.good : palette.amber,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
          }}
        >
          <Text style={{ fontFamily: FONTS.display, fontSize: 19, color: converted ? '#EFFFFB' : '#7A4A00' }}>
            {converted ? draft.receiveSymbol[0] : draft.paySymbol[0]}
          </Text>
        </Animated.View>
        <Animated.View
          style={{
            position: 'absolute',
            left: '52%',
            top: '20%',
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: palette.amber,
            opacity: sparkOpacity,
          }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            left: '60%',
            top: '34%',
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: palette.amber,
            opacity: sparkOpacity,
          }}
        />
      </View>
      {steps.map((label, i) => {
        const st = stepState(i);
        return (
          <View
            key={label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: st === 'done' ? palette.good : st === 'doing' ? palette.accentSoft : palette.soft2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 12, color: st === 'done' ? '#fff' : palette.accent }}>
                {st === 'done' ? '✓' : st === 'doing' ? '…' : ''}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: st === 'todo' ? palette.muted : palette.ink,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <Pip expression={converted ? 'thinking' : 'happy'} size={74} />
        <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 14, marginTop: 4 }}>
          Takes a few minutes.
        </Text>
      </View>
    </Screen>
  );
}
