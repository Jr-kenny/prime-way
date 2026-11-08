// End-to-end tests for the PrimeWay client, against a mock backend
// and a mock signer. No money moves: the backend answers with the
// recorded live fixture, the signer only records transactions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrimeWay } from '../src/client.js';
import { MemoryDecisionStore, FileDecisionStore } from '../src/store.js';
import type { FetchFn } from '../src/quote.js';
import type { Signer, StepTx } from '../src/signer.js';
import { LIVE_QUOTE, statusSequence } from './fixtures.js';

const WALLET = '0xA37a186AfE306C3EE01D6ABF912cC42BC568091C' as const;
const SARAH = '0x1111111111111111111111111111111111111111' as const;
const STRANGER = '0x2222222222222222222222222222222222222222' as const;

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
function mockFetch(): { fetchFn: FetchFn; statusCalls: () => number } {
  let statusIdx = 0;
  const seq = statusSequence();
  const fetchFn = (async (url: string | URL | Request, init?: unknown) => {
    const u = String(url);
    if (u.endsWith('/quote')) {
      return new Response(JSON.stringify(LIVE_QUOTE), { status: 200 });
    }
    if (u.includes('/status')) {
      const step = seq[Math.min(statusIdx, seq.length - 1)];
      statusIdx += 1;
      return new Response(JSON.stringify(step), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as FetchFn;
  return { fetchFn, statusCalls: () => statusIdx };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const signer = new MockSigner();
  const { fetchFn } = mockFetch();
  const client = new PrimeWay({
    wallet: WALLET,
    signer,
    recipients: [{ address: SARAH, chainId: 42161, label: 'Sarah' }],
    maxSendUsd: 500,
    maxDailyUsd: 1000,
    store: new MemoryDecisionStore(),
    pollIntervalMs: 1,
    pollTimeoutMs: 5000,
    fetch: fetchFn,
    ...overrides,
  } as never);
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
  const out = await client.send({ ...SEND, decisionKey: 'test-send-1' });
  assert.equal(out.outcome, 'sent');
  if (out.outcome !== 'sent') return;
  assert.equal(out.receipt.requestId, LIVE_QUOTE.requestId);
  assert.equal(out.receipt.status, 'success');
  assert.equal(out.receipt.depositTx.slice(0, 4), '0x00');
  assert.equal(signer.sent.length, 2);
  assert.equal(signer.sent[0].to, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(signer.sent[1].to, '0x4cd00e387622c35bddb9b4c962c136462338bc31');
  assert.equal(signer.sent[0].chainId, 8453);
});

test('a retry with the same decision key returns the receipt and never re-sends', async () => {
  const { client, signer } = makeClient();
  const first = await client.send({ ...SEND, decisionKey: 'test-retry-1' });
  assert.equal(first.outcome, 'sent');
  const second = await client.send({ ...SEND, decisionKey: 'test-retry-1' });
  assert.equal(second.outcome, 'already-sent');
  if (second.outcome !== 'already-sent') return;
  assert.equal(second.receipt.requestId, LIVE_QUOTE.requestId);
  assert.equal(signer.sent.length, 2, 'signer must not be called again');
});

test('a nonce-derived key makes identical sends one decision, a new nonce a new one', async () => {
  const { client, signer } = makeClient();
  const a = await client.send({ ...SEND, nonce: 'n-1' });
  assert.equal(a.outcome, 'sent');
  const b = await client.send({ ...SEND, nonce: 'n-1' });
  assert.equal(b.outcome, 'already-sent');
  const c = await client.send({ ...SEND, nonce: 'n-2' });
  assert.equal(c.outcome, 'sent');
  assert.equal(signer.sent.length, 4, 'two distinct decisions, two deposits');
});

test('an over-limit send waits for approval and sends nothing', async () => {
  const { client, signer } = makeClient({ maxSendUsd: 50 });
  const out = await client.send({ ...SEND, decisionKey: 'test-limit-1' });
  assert.equal(out.outcome, 'needs-approval');
  if (out.outcome !== 'needs-approval') return;
  assert.equal(out.decision.reason, 'over-per-send-limit');
  assert.equal(out.decision.limitUsd, 50);
  assert.equal(signer.sent.length, 0);

  // The owner approves by re-issuing the same decision with approved: true.
  const approved = await client.send({
    ...SEND,
    decisionKey: 'test-limit-1',
    approved: true,
  });
  assert.equal(approved.outcome, 'sent');
  assert.equal(signer.sent.length, 2);
});

test('approve() lets a later re-issue send without the flag', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prime-way-'));
  const approvalsPath = join(dir, 'approvals.json');
  const { client, signer } = makeClient({ maxSendUsd: 50, approvalsPath });
  const out = await client.send({ ...SEND, decisionKey: 'test-approve-1' });
  assert.equal(out.outcome, 'needs-approval');
  await client.approve('test-approve-1');
  const again = await client.send({ ...SEND, decisionKey: 'test-approve-1' });
  assert.equal(again.outcome, 'sent');
  assert.equal(signer.sent.length, 2);
});

test('a recipient who is not on the list is refused and nothing is sent', async () => {
  const { client, signer } = makeClient();
  const out = await client.send({
    ...SEND,
    recipient: STRANGER,
    decisionKey: 'test-stranger-1',
  });
  assert.equal(out.outcome, 'refused');
  if (out.outcome !== 'refused') return;
  assert.equal(out.reason, 'recipient-not-allowed');
  assert.equal(signer.sent.length, 0);
});

test('the daily limit counts executed sends and blocks the next one', async () => {
  const { client, signer } = makeClient({ maxSendUsd: 500, maxDailyUsd: 150 });
  const first = await client.send({ ...SEND, decisionKey: 'test-daily-1' });
  assert.equal(first.outcome, 'sent');
  const second = await client.send({
    ...SEND,
    decisionKey: 'test-daily-2',
  });
  assert.equal(second.outcome, 'needs-approval');
  if (second.outcome !== 'needs-approval') return;
  assert.equal(second.decision.reason, 'over-daily-limit');
  assert.equal(signer.sent.length, 2, 'only the first send went out');
});

test('checkStatus returns the backend status', async () => {
  const { client } = makeClient();
  const st = await client.checkStatus(LIVE_QUOTE.requestId);
  assert.equal(st.status, 'waiting');
  assert.deepEqual(st.txHashes, []);
});

test('a send with no decision key and no nonce is rejected', async () => {
  const { client, signer } = makeClient();
  await assert.rejects(() => client.send({ ...SEND }), /decisionKey/);
  assert.equal(signer.sent.length, 0);
});

test('an unknown token is rejected before anything is quoted', async () => {
  const { client, signer } = makeClient();
  await assert.rejects(
    () =>
      client.send({
        ...SEND,
        paySymbol: 'NOPE',
        decisionKey: 'test-unknown-1',
      }),
    /unknown chain or token/,
  );
  assert.equal(signer.sent.length, 0);
});

test('the file store survives a new client: a retry still finds the receipt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prime-way-'));
  const storePath = join(dir, 'decisions.json');
  const { fetchFn } = mockFetch();
  const signer = new MockSigner();
  const first = new PrimeWay({
    wallet: WALLET,
    signer,
    recipients: [{ address: SARAH, chainId: 42161 }],
    maxSendUsd: 500,
    store: new FileDecisionStore(storePath),
    pollIntervalMs: 1,
    pollTimeoutMs: 5000,
    fetch: fetchFn,
  });
  const out = await first.send({ ...SEND, decisionKey: 'test-file-1' });
  assert.equal(out.outcome, 'sent');
  assert.equal(signer.sent.length, 2);

  // A brand new client on the same file must not send again.
  const second = new PrimeWay({
    wallet: WALLET,
    signer,
    recipients: [{ address: SARAH, chainId: 42161 }],
    maxSendUsd: 500,
    store: new FileDecisionStore(storePath),
    pollIntervalMs: 1,
    pollTimeoutMs: 5000,
    fetch: fetchFn,
  });
  const retry = await second.send({ ...SEND, decisionKey: 'test-file-1' });
  assert.equal(retry.outcome, 'already-sent');
  assert.equal(signer.sent.length, 2);
});
