// Client for the Prime Way backend: live Relay quotes and send status.
//
// The backend only asks Relay for a quote. It never signs anything and
// never sends a transaction. Live endpoints verified 2026-11-08.

import { BACKEND_URL } from '../config';
import { chainById, tokenOn } from './chains';

export interface QuoteStep {
  id: string;
  action: string;
  description: string;
  /** Full transaction data for this step, when the backend returns it. */
  tx?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
  };
}

export interface Quote {
  requestId: string;
  outputAmount: string | null;
  outputAmountFormatted: string | null;
  outputCurrency: string;
  feesUsd: number;
  steps: QuoteStep[];
  timeEstimate: number | null;
}

export type SendStatus =
  | 'waiting'
  | 'depositing'
  | 'pending'
  | 'success'
  | 'refund'
  | 'failure';

export interface StatusResult {
  requestId: string;
  status: SendStatus;
  txHashes: string[];
}

export interface QuoteRequest {
  user: `0x${string}`;
  recipient: `0x${string}`;
  originChainId: number;
  destinationChainId: number;
  originCurrency: `0x${string}`;
  destinationCurrency: `0x${string}`;
  amount: string;
}

export async function fetchQuote(req: QuoteRequest): Promise<Quote> {
  const res = await fetch(`${BACKEND_URL}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`quote failed (${res.status})`);
  }
  return (await res.json()) as Quote;
}

export async function fetchStatus(requestId: string): Promise<StatusResult> {
  const res = await fetch(
    `${BACKEND_URL}/status?requestId=${encodeURIComponent(requestId)}`,
  );
  if (!res.ok) {
    throw new Error(`status failed (${res.status})`);
  }
  return (await res.json()) as StatusResult;
}

/** A quote's steps can only be sent when the backend returns the
 *  transaction data for each step. Today it returns id, action and
 *  description only; see app/README.md for the one backend change
 *  that turns sends on. */
export function quoteCanSend(q: Quote): boolean {
  return q.steps.length > 0 && q.steps.every((s) => s.tx && s.tx.to && s.tx.data);
}

/** The quote's receive amount must be a real positive number.
 *  A non-numeric or zero receive amount means the quote is not
 *  usable: Number("abc") is NaN, and NaN <= 0 is false, so a plain
 *  `Number(x) <= 0` check would let garbage through. The raw units
 *  must also be a positive integer string when present. */
export function hasPositiveOutputAmount(q: Quote): boolean {
  if (!q.outputAmountFormatted) return false;
  const n = Number(q.outputAmountFormatted);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (q.outputAmount !== null && q.outputAmount !== undefined) {
    if (!/^[0-9]+$/.test(q.outputAmount)) return false;
    try {
      if (BigInt(q.outputAmount) <= 0n) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Dollars typed by the user into the pay token's smallest units.
 *  Uses integer math only, so no rounding surprises. Returns null
 *  for anything that is not a plain positive dollar amount. */
export function dollarsToUnits(
  usdStr: string,
  price: number,
  decimals: number,
): string | null {
  const s = String(usdStr ?? '').trim().replace(',', '.');
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const parts = s.split('.');
  const intPart = parts[0] || '0';
  const fracPart = parts[1] || '';
  let digits = (intPart + fracPart).replace(/^0+(?=\d)/, '');
  if (!digits) digits = '0';
  try {
    // dollars = D / 10^f ; price = P / 10^p (p = 6 keeps price exact
    // to a millionth of a dollar); units = dollars / price * 10^decimals.
    const p = 6;
    const d = BigInt(digits);
    const f = BigInt(fracPart.length);
    const priceScaled = BigInt(Math.round(price * 10 ** p));
    if (priceScaled === 0n) return null;
    const units =
      (d * 10n ** BigInt(p + decimals)) / (10n ** f * priceScaled);
    if (units === 0n) return null;
    return units.toString();
  } catch {
    return null;
  }
}

/** Build the quote request for a send, or null when the route is not
 *  one the app can quote (unknown chain or token). */
export function quoteRequestFor(
  usdAmount: string,
  payChainId: number,
  paySymbol: string,
  payPrice: number,
  destChainId: number,
  receiveSymbol: string,
  wallet: `0x${string}`,
  recipient: `0x${string}`,
): QuoteRequest | null {
  const origin = tokenOn(payChainId, paySymbol);
  const dest = tokenOn(destChainId, receiveSymbol);
  if (!origin || !dest) return null;
  if (!chainById(payChainId) || !chainById(destChainId)) return null;
  const amount = dollarsToUnits(usdAmount, payPrice, origin.decimals);
  if (!amount) return null;
  return {
    user: wallet,
    recipient,
    originChainId: payChainId,
    destinationChainId: destChainId,
    originCurrency: origin.address,
    destinationCurrency: dest.address,
    amount,
  };
}

export function formatFee(feesUsd: number | null | undefined): string | null {
  if (feesUsd === null || feesUsd === undefined) return null;
  const f = Number(feesUsd);
  if (Number.isNaN(f)) return null;
  return '$' + (f < 1 ? f.toFixed(3) : f.toFixed(2));
}
