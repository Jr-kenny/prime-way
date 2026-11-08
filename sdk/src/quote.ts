// Client for the Prime Way backend: live Relay quotes and send status.
//
// The backend only asks Relay for a quote. It never signs anything and
// never sends a transaction. Live endpoints verified 2026-11-08.
// This is the Node version of app/src/lib/relay.ts: same shapes, same
// dollars-to-units math, no React Native dependency.

import { chainById, tokenOn } from './chains.js';

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

export type FetchFn = typeof fetch;

export const DEFAULT_BACKEND_URL = 'https://prime-way-backend.onrender.com';

export async function fetchQuote(
  backendUrl: string,
  req: QuoteRequest,
  fetchFn: FetchFn = fetch,
): Promise<Quote> {
  const res = await fetchFn(`${backendUrl}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`quote failed (${res.status})`);
  }
  return (await res.json()) as Quote;
}

export async function fetchStatus(
  backendUrl: string,
  requestId: string,
  fetchFn: FetchFn = fetch,
): Promise<StatusResult> {
  const res = await fetchFn(
    `${backendUrl}/status?requestId=${encodeURIComponent(requestId)}`,
  );
  if (!res.ok) {
    throw new Error(`status failed (${res.status})`);
  }
  return (await res.json()) as StatusResult;
}

/** A quote's steps can only be sent when the backend returns the
 *  transaction data for each step. */
export function quoteCanSend(q: Quote): boolean {
  return q.steps.length > 0 && q.steps.every((s) => s.tx && s.tx.to && s.tx.data);
}

/** Dollars into the pay token's smallest units. Uses integer math
 *  only, so no rounding surprises. Returns null for anything that is
 *  not a plain positive dollar amount. */
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
 *  one Prime Way can quote (unknown chain or token). */
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
