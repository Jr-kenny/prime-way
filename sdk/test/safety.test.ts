// Unit tests: dollars-to-units math and the decision store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dollarsToUnits } from '../src/quote.js';
import { FileDecisionStore, MemoryDecisionStore } from '../src/store.js';
import { makeDecisionKey, recipientAllowed } from '../src/safety.js';

test('dollarsToUnits: $100 of BNB at $780 is 0.128205... BNB', () => {
  assert.equal(dollarsToUnits('100', 780, 18), '128205128205128205');
});

test('dollarsToUnits: $1 of USDC at $1 is 1000000 units', () => {
  assert.equal(dollarsToUnits('1', 1, 6), '1000000');
  assert.equal(dollarsToUnits('0.5', 1, 6), '500000');
  assert.equal(dollarsToUnits('100', 1, 6), '100000000');
});

test('dollarsToUnits: $1.50 of BNB at $780', () => {
  assert.equal(dollarsToUnits('1.5', 780, 18), '1923076923076923');
});

test('dollarsToUnits rejects nonsense', () => {
  assert.equal(dollarsToUnits('', 780, 18), null);
  assert.equal(dollarsToUnits('abc', 780, 18), null);
  assert.equal(dollarsToUnits('0', 780, 18), null);
  assert.equal(dollarsToUnits('-5', 780, 18), null);
  assert.equal(dollarsToUnits('10', 0, 18), null);
});

test('makeDecisionKey is deterministic and nonce-sensitive', () => {
  const base = {
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '100000000',
    originChainId: 8453,
    destinationChainId: 42161,
    nonce: 'n-1',
  };
  const a = makeDecisionKey(base);
  const b = makeDecisionKey(base);
  const c = makeDecisionKey({ ...base, nonce: 'n-2' });
  const d = makeDecisionKey({ ...base, amount: '200000000' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.ok(a.startsWith('pw_'));
});

test('recipientAllowed matches address case-insensitively and respects chain', () => {
  const rules = [
    { address: '0xAbC0000000000000000000000000000000000000' as `0x${string}`, chainId: 42161 },
    { address: '0xDEF0000000000000000000000000000000000000' as `0x${string}` },
  ];
  assert.equal(
    recipientAllowed(rules, '0xabc0000000000000000000000000000000000000', 42161),
    true,
  );
  assert.equal(
    recipientAllowed(rules, '0xabc0000000000000000000000000000000000000', 8453),
    false,
  );
  assert.equal(
    recipientAllowed(rules, '0xdef0000000000000000000000000000000000000', 1),
    true,
  );
  assert.equal(
    recipientAllowed(rules, '0x9990000000000000000000000000000000000000', 42161),
    false,
  );
  assert.equal(recipientAllowed([], '0xabc0000000000000000000000000000000000000', 42161), false);
});

test('memory store round-trips a receipt', async () => {
  const store = new MemoryDecisionStore();
  assert.equal(await store.get('k1'), undefined);
  await store.put({ key: 'k1', receipt: { decisionKey: 'k1' } as never });
  assert.equal((await store.get('k1'))?.receipt?.decisionKey, 'k1');
  assert.equal((await store.list()).length, 1);
});

test('file store writes atomically and reads back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prime-way-store-'));
  const path = join(dir, 'decisions.json');
  const store = new FileDecisionStore(path);
  assert.equal(await store.get('k1'), undefined);
  await store.put({ key: 'k1', pending: { decisionKey: 'k1' } as never });
  const again = new FileDecisionStore(path);
  assert.equal((await again.get('k1'))?.pending?.decisionKey, 'k1');
});
