// Fixtures: a real quote recorded live from the Prime Way backend
// on 2026-11-08 (1 USDC on Base -> USDC on Arbitrum), and the status
// answers a send walks through. Nothing here spends money: the tests
// run against a mock backend that returns these, and a mock signer
// that only records transactions.
//
// The quote's requestId is real. The status sequence is scripted:
// waiting (the live answer for this requestId), then depositing,
// pending, then success.

import type { Quote, StatusResult } from '../src/quote.js';

export const LIVE_QUOTE: Quote = {
  requestId:
    '0x1794126361735db4d8ad7e59ddf21c9d55a18c273f4c66400f8e518b2257d4d6',
  outputAmount: '976173',
  outputAmountFormatted: '0.976173',
  outputCurrency: 'USDC',
  feesUsd: 0.024929,
  steps: [
    {
      id: 'approve',
      action: 'Confirm transaction in your wallet',
      description: 'Sign an approval for USDC',
      tx: {
        to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        data: '0x095ea7b30000000000000000000000004cd00e387622c35bddb9b4c962c136462338bc3100000000000000000000000000000000000000000000000000000000000f4240',
        value: '0',
        chainId: 8453,
      },
    },
    {
      id: 'deposit',
      action: 'Confirm transaction in your wallet',
      description: 'Depositing funds to the relayer to execute the swap for USDC',
      tx: {
        to: '0x4cd00e387622c35bddb9b4c962c136462338bc31',
        data: '0xe8017952000000000000000000000000a37a186afe306c3ee01d6abf912cc42bc568091c000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000000f42403344c70ac8f9eebfc36d171d4a472c99d748442e5b7a9c69ada7666936b89076',
        value: '0',
        chainId: 8453,
      },
    },
  ],
  timeEstimate: 1,
};

export const LIVE_STATUS_WAITING: StatusResult = {
  requestId: LIVE_QUOTE.requestId,
  status: 'waiting',
  txHashes: [],
};

/** waiting -> depositing -> pending -> success. */
export function statusSequence(): StatusResult[] {
  return (['waiting', 'depositing', 'pending', 'success'] as const).map(
    (status) => ({
      requestId: LIVE_QUOTE.requestId,
      status,
      txHashes:
        status === 'success'
          ? [
              '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            ]
          : [],
    }),
  );
}
