// End-to-end tests for the PrimeWay client, against a mock backend
// and a mock signer. No money moves: the backend answers with the
// recorded live fixture, the signer only records transactions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrimeWay } from '../src/client.js';
import type { FetchFn, Quote } from '../src/quote.js';
import type { Signer, StepTx } from '../src/signer.js';
import { LIVE_QUOTE, statusSequence } from './fixtures.js';

const WALLET = '0xA37a186AfE306C3EE01D6ABF912cC42BC568091C' as const;
const SARAH = '0x1111111111111111111111111111111111111111' as const;

class MockSigner implements Signer {
  address = WALLET;
  sent: StepTx[] = [];
  async sendTransaction(tx: StepTx): Promise<`0x${string}`> {
    this.sent.push(tx);
    const n = this.sent.length;
    return `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
  }
}

/** A backend that answers /quote with the live fixture and /status
 *  with the scripted sequence, one step per call. */
function mockFetch(quote: Quote = LIVE_QUOTE): FetchFn {
  let statusIdx = 0;
  const seq = statusSequence();
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/quote')) {
      return new Response(JSON.stringify(quote), { status: 200 });
    }
    if (u.includes('/status')) {
      const step = seq[Math.min(statusIdx, seq.length - 1)];
      statusIdx += 1;
      return new Response(JSON.stringify(step), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as FetchFn;
}

function makeClient(fetchFn: FetchFn = mockFetch()) {
  const signer = new MockSigner();
  const client = new PrimeWay({
    wallet: WALLET,
    signer,
    pollIntervalMs: 1,
    pollTimeoutMs: 5000,
    fetch: fetchFn,
  });
  return { client, signer };
}

const SEND = {
  usdAmount: '100',
  payChainId: 8453,
  paySymbol: 'USDC',
  payPrice: 1,
  destinationChainId: 42161,
  receiveSymbol: 'USDC',
  recipient: SARAH,
} as const;

test('getQuote returns the live fixture shape', async () => {
  const { client } = makeClient();
  const q = await client.getQuote(SEND);
  assert.equal(q.outputAmountFormatted, '0.976173');
  assert.equal(q.outputCurrency, 'USDC');
  assert.equal(q.feesUsd, 0.024929);
  assert.equal(q.steps.length, 2);
  assert.ok(q.steps.every((s) => s.tx));
});

test('send runs approve then deposit and returns a success receipt', async () => {
  const { client, signer } = makeClient();
  const receipt = await client.send(SEND);
  assert.equal(receipt.requestId, LIVE_QUOTE.requestId);
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.depositTx.slice(0, 4), '0x00');
  assert.equal(signer.sent.length, 2);
  assert.equal(signer.sent[0].to, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(signer.sent[1].to, '0x4cd00e387622c35bddb9b4c962c136462338bc31');
  assert.equal(signer.sent[0].chainId, 8453);
});

test('calling send twice sends twice: normal usage, no dedup', async () => {
  const { client, signer } = makeClient();
  await client.send(SEND);
  await client.send(SEND);
  assert.equal(signer.sent.length, 4, 'two sends, two deposits');
});

test('checkStatus returns the backend status', async () => {
  const { client } = makeClient();
  const st = await client.checkStatus(LIVE_QUOTE.requestId);
  assert.equal(st.status, 'waiting');
  assert.deepEqual(st.txHashes, []);
});

test('an unknown token is rejected before anything is quoted', async () => {
  const { client, signer } = makeClient();
  await assert.rejects(
    () => client.send({ ...SEND, paySymbol: 'NOPE' }),
    /unknown chain or token/,
  );
  assert.equal(signer.sent.length, 0);
});

test('a bad amount is rejected before anything is quoted', async () => {
  const { client, signer } = makeClient();
  await assert.rejects(() => client.send({ ...SEND, usdAmount: '0' }), /positive dollar/);
  await assert.rejects(() => client.send({ ...SEND, usdAmount: '-5' }), /positive dollar/);
  await assert.rejects(() => client.send({ ...SEND, usdAmount: 'abc' }), /positive dollar/);
  assert.equal(signer.sent.length, 0);
});

test('a bad recipient address is rejected', async () => {
  const { client, signer } = makeClient();
  await assert.rejects(
    () => client.send({ ...SEND, recipient: 'not-an-address' as never }),
    /recipient must be a 0x address/,
  );
  assert.equal(signer.sent.length, 0);
});

test('a quote without step transaction data is rejected and nothing is sent', async () => {
  const noTxQuote: Quote = {
    ...LIVE_QUOTE,
    steps: LIVE_QUOTE.steps.map((s) => ({ ...s, tx: undefined })),
  };
  const { client, signer } = makeClient(mockFetch(noTxQuote));
  await assert.rejects(() => client.send(SEND), /no send details/);
  assert.equal(signer.sent.length, 0);
});
