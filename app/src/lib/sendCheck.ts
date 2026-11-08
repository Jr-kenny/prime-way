// The check that runs on Confirm before Send wakes up.
//
// Real checks against live data, never a timer:
//   1. the quote is re-requested fresh, so the requestId signed at
//      send time is never the stale one from Amount;
//   2. the address is a valid 0x + 40 hex address;
//   3. the amount is a valid positive amount;
//   4. amount + fee is covered by the user's total balance, in
//      micro-dollars as BigInt (never floats);
//   5. the recipient is known (a saved person, or an address sent
//      to before) or the new-address note is shown.
//
// Money math: 1 micro-dollar = $0.000001. Dollar strings are parsed
// digit by digit into BigInt; numbers coming from the quote and the
// balance (feesUsd, totalUsd) go through toFixed(6) first, so no
// binary-float addition ever decides whether a send is covered.
// A shortfall is rounded UP to the cent when shown, so the amount
// the sheet asks for always covers the real shortfall.
//
// Nothing here logs an address, a key, or a secret. The recipient
// address is compared lower-cased in memory only.

import { fetchQuote, hasPositiveOutputAmount, quoteCanSend, quoteRequestFor, type Quote } from './relay';
import type { BalancesResult } from './balances';
import type { Contact } from '../store/contacts';
import type { HistoryEntry } from '../store/history';

/** One micro-dollar = $0.000001. All money in this file is BigInt micro-dollars. */
export const MICRO_PER_DOLLAR = 1_000_000n;

/** True for a plain 0x address: 0x followed by exactly 40 hex digits.
 *  The zero address is never valid here: money sent to it is
 *  unrecoverable. (It is a valid native-currency sentinel elsewhere
 *  in the app, but never an address to send to.) */
export function isValidAddress(address: string): boolean {
  const a = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return false;
  return a.toLowerCase() !== '0x0000000000000000000000000000000000000000';
}

/** Parse a typed dollar amount ("100", "100.50", ".5") to micro-dollars.
 *  Returns null for anything that is not a plain dollar amount.
 *  Digits past the 6th decimal place are dropped; a dollar amount
 *  never needs more precision than a micro-dollar. */
export function parseUsdToMicroDollars(value: string): bigint | null {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const parts = s.split('.');
  const intPart = parts[0] || '0';
  const fracPart = (parts[1] || '').slice(0, 6).padEnd(6, '0');
  try {
    return BigInt(intPart + fracPart);
  } catch {
    return null;
  }
}

/** A dollar number from the quote or the balance (feesUsd, totalUsd)
 *  to micro-dollars. Goes through toFixed(6) so the conversion is
 *  exact to the micro-dollar instead of binary-float arithmetic. */
export function numberToMicroDollars(value: number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return parseUsdToMicroDollars(value.toFixed(6));
}

/** How much more is needed: amount + fee - total, or zero when covered. */
export function computeShortfallMicro(
  amountMicro: bigint,
  feeMicro: bigint,
  totalMicro: bigint,
): bigint {
  const short = amountMicro + feeMicro - totalMicro;
  return short > 0n ? short : 0n;
}

/** Format micro-dollars as dollars, rounded UP to the cent, so a
 *  shortfall shown to the user always covers the real shortfall.
 *  e.g. 30000n -> "$0.03", 2500000n -> "$2.50". */
export function formatMicroUsd(micro: bigint): string {
  const cents = (micro + 9999n) / 10000n;
  const dollars = cents / 100n;
  const rem = cents % 100n;
  return `$${dollars.toString()}.${rem.toString().padStart(2, '0')}`;
}

export interface ConfirmCheckInput {
  usdAmount: string;
  payChainId: number;
  paySymbol: string;
  payPrice: number;
  receiveSymbol: string;
  destinationChainId: number;
  recipient: string;
  personId: string | null;
  quote: Quote;
  walletAddress: `0x${string}` | null;
}

export interface ConfirmCheckDeps {
  fetchQuoteFn?: (req: Parameters<typeof fetchQuote>[0]) => Promise<Quote>;
  fetchBalancesFn?: (address: `0x${string}`) => Promise<BalancesResult>;
  loadContactsFn?: () => Promise<Contact[]>;
  loadHistoryFn?: () => Promise<HistoryEntry[]>;
}

export type ConfirmCheckResult =
  | {
      ok: true;
      quote: Quote;
      isNewAddress: boolean;
      shortfallMicro: bigint;
    }
  | {
      ok: false;
      reason: string;
      needsTopUp: boolean;
      shortfallMicro: bigint;
      quote: Quote | null;
      isNewAddress: boolean;
    };

const CANNOT_CHECK = 'Could not check this send right now. Try again in a moment.';
const NOT_READY = 'This send is not ready yet. Try again in a moment.';

/** Run the Confirm check. The deps default to the live ones; tests
 *  pass stubs. The fresh quote is returned on success and must be
 *  the quote the send signs, never the stale draft quote. */
export async function runConfirmCheck(
  input: ConfirmCheckInput,
  deps: ConfirmCheckDeps = {},
): Promise<ConfirmCheckResult> {
  const fetchQuoteFn = deps.fetchQuoteFn ?? fetchQuote;
  const fetchBalancesFn = deps.fetchBalancesFn;
  const loadContactsFn = deps.loadContactsFn;
  const loadHistoryFn = deps.loadHistoryFn;

  const fail = (
    reason: string,
    extra: Partial<Extract<ConfirmCheckResult, { ok: false }>> = {},
  ): ConfirmCheckResult => ({
    ok: false,
    reason,
    needsTopUp: false,
    shortfallMicro: 0n,
    quote: null,
    isNewAddress: false,
    ...extra,
  });

  if (!input.walletAddress) {
    return fail('Add a wallet first.');
  }
  if (!isValidAddress(input.recipient)) {
    return fail('That address does not look right. Check it with them and try again.');
  }
  const amountMicro = parseUsdToMicroDollars(input.usdAmount);
  if (amountMicro === null || amountMicro <= 0n) {
    return fail('That amount does not look right. Go back and type it again.');
  }

  // Fresh quote, requested now, plus the saved people and past sends
  // (for the new-address note) in parallel.
  const req = quoteRequestFor(
    input.usdAmount,
    input.payChainId,
    input.paySymbol,
    input.payPrice,
    input.destinationChainId,
    input.receiveSymbol,
    input.walletAddress,
    input.recipient.trim() as `0x${string}`,
  );
  if (!req) {
    return fail(CANNOT_CHECK);
  }
  let freshQuote: Quote;
  let contacts: Contact[] = [];
  let history: HistoryEntry[] = [];
  try {
    const [q, c, h] = await Promise.all([
      fetchQuoteFn(req),
      loadContactsFn ? loadContactsFn().catch(() => []) : Promise.resolve([] as Contact[]),
      loadHistoryFn ? loadHistoryFn().catch(() => []) : Promise.resolve([] as HistoryEntry[]),
    ]);
    freshQuote = q;
    contacts = c;
    history = h;
  } catch {
    return fail(CANNOT_CHECK);
  }
  if (!hasPositiveOutputAmount(freshQuote) || !quoteCanSend(freshQuote)) {
    return fail(NOT_READY, { quote: freshQuote });
  }

  const recipientLower = input.recipient.trim().toLowerCase();
  const knownByPerson = input.personId !== null;
  const knownByAddress =
    contacts.some((c) => c.address?.toLowerCase() === recipientLower) ||
    history.some((e) => e.toAddress?.toLowerCase() === recipientLower);
  const isNewAddress = !knownByPerson && !knownByAddress;

  // Balance: the one total across everything the user holds.
  if (!fetchBalancesFn) {
    return fail('Could not check your balance right now. Try again in a moment.', {
      quote: freshQuote,
      isNewAddress,
    });
  }
  let totalMicro: bigint | null;
  try {
    const balances = await fetchBalancesFn(input.walletAddress);
    totalMicro = numberToMicroDollars(balances.totalUsd);
  } catch {
    return fail('Could not check your balance right now. Try again in a moment.', {
      quote: freshQuote,
      isNewAddress,
    });
  }
  if (totalMicro === null) {
    return fail('Could not check your balance right now. Try again in a moment.', {
      quote: freshQuote,
      isNewAddress,
    });
  }
  // An unknown fee blocks the send. Counting it as $0 would let a
  // send through when the real fee is not known. The rule itself
  // stays: the balance must cover the amount plus the fee.
  const feeMicro = numberToMicroDollars(freshQuote.feesUsd);
  if (feeMicro === null) {
    return fail('Could not check the fee for this send. Try again in a moment.', {
      quote: freshQuote,
      isNewAddress,
    });
  }
  const shortfallMicro = computeShortfallMicro(amountMicro, feeMicro, totalMicro);
  if (shortfallMicro > 0n) {
    return {
      ok: false,
      reason: `Your balance is ${formatMicroUsd(shortfallMicro)} short.`,
      needsTopUp: true,
      shortfallMicro,
      quote: freshQuote,
      isNewAddress,
    };
  }

  return { ok: true, quote: freshQuote, isNewAddress, shortfallMicro: 0n };
}
