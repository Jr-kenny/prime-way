// Unit tests: dollars-to-units math.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dollarsToUnits } from '../src/quote.js';

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
