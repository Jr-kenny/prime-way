// The Prime Way agent client.
//
// One client, three abilities: get a live quote, send money through
// a quote's steps, and check a send. Normal usage, the same as a
// person using the app: quote, send, check.

import {
  DEFAULT_BACKEND_URL,
  fetchQuote,
  fetchStatus,
  quoteCanSend,
  quoteRequestFor,
  type FetchFn,
  type Quote,
  type SendStatus,
  type StatusResult,
} from './quote.js';
import {
  BackendError,
  InvalidSendError,
  QuoteNotSendableError,
} from './errors.js';
import type { Signer } from './signer.js';

export function isAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export interface PrimeWayConfig {
  /** The Prime Way backend. Defaults to the live service. */
  backendUrl?: string;
  /** The wallet that sends the money (must match the signer). */
  wallet: `0x${string}`;
  /** Sends the step transactions. The SDK never holds a key. */
  signer: Signer;
  /** How often to ask the backend how a send is doing. Default 5000ms. */
  pollIntervalMs?: number;
  /** How long to watch a send before giving up and returning the
   *  last known status. Default 10 minutes. The money may still land
   *  after a timeout: checkStatus tells the truth. */
  pollTimeoutMs?: number;
  /** Injectable fetch, for tests. */
  fetch?: FetchFn;
}

export interface SendRequest {
  /** Dollars to send, e.g. "100". */
  usdAmount: string;
  payChainId: number;
  paySymbol: string;
  /** Dollars per unit of the pay token, e.g. 780 for BNB. */
  payPrice: number;
  destinationChainId: number;
  receiveSymbol: string;
  recipient: `0x${string}`;
}

/** What a send returns: the quote's requestId, the step transaction
 *  hashes, and where the send got to when the watch finished. */
export interface Receipt {
  requestId: string;
  approveTx?: string;
  depositTx: string;
  status: SendStatus;
  txHashes: string[];
  usdAmount: number;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  createdAt: string;
  updatedAt: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PrimeWay {
  private readonly backendUrl: string;
  private readonly wallet: `0x${string}`;
  private readonly signer: Signer;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly fetchFn: FetchFn;

  constructor(config: PrimeWayConfig) {
    if (!isAddress(config.wallet)) {
      throw new InvalidSendError('wallet must be a 0x address');
    }
    if (config.signer.address.toLowerCase() !== config.wallet.toLowerCase()) {
      throw new InvalidSendError('signer address does not match wallet');
    }
    this.backendUrl = config.backendUrl ?? DEFAULT_BACKEND_URL;
    this.wallet = config.wallet;
    this.signer = config.signer;
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
    this.pollTimeoutMs = config.pollTimeoutMs ?? 10 * 60 * 1000;
    this.fetchFn = config.fetch ?? fetch;
  }

  /** A live quote for a send. Read-only: quoting never moves money. */
  async getQuote(req: SendRequest): Promise<Quote> {
    const built = quoteRequestFor(
      req.usdAmount,
      req.payChainId,
      req.paySymbol,
      req.payPrice,
      req.destinationChainId,
      req.receiveSymbol,
      this.wallet,
      req.recipient,
    );
    if (!built) {
      throw new InvalidSendError(
        'unknown chain or token, or an amount that is not a positive dollar number',
      );
    }
    try {
      return await fetchQuote(this.backendUrl, built, this.fetchFn);
    } catch (err) {
      throw new BackendError(
        err instanceof Error ? err.message : 'quote failed',
      );
    }
  }

  /** Check a send by its requestId. */
  async checkStatus(requestId: string): Promise<StatusResult> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) {
      throw new InvalidSendError('requestId must be 0x plus 64 hex characters');
    }
    try {
      return await fetchStatus(this.backendUrl, requestId, this.fetchFn);
    } catch (err) {
      throw new BackendError(
        err instanceof Error ? err.message : 'status check failed',
      );
    }
  }

  /** Send money: get a live quote, run its steps in order with the
   *  signer, then watch until the money lands or is refunded.
   *  Returns the receipt. Throws only for mistakes (bad input, bad
   *  config) and for backend failures. */
  async send(req: SendRequest): Promise<Receipt> {
    const usd = Number(req.usdAmount);
    if (!Number.isFinite(usd) || usd <= 0) {
      throw new InvalidSendError('usdAmount must be a positive dollar number');
    }
    if (!isAddress(req.recipient)) {
      throw new InvalidSendError('recipient must be a 0x address');
    }
    const built = quoteRequestFor(
      req.usdAmount,
      req.payChainId,
      req.paySymbol,
      req.payPrice,
      req.destinationChainId,
      req.receiveSymbol,
      this.wallet,
      req.recipient,
    );
    if (!built) {
      throw new InvalidSendError(
        'unknown chain or token, or an amount that is not a positive dollar number',
      );
    }

    let quote: Quote;
    try {
      quote = await fetchQuote(this.backendUrl, built, this.fetchFn);
    } catch (err) {
      throw new BackendError(
        err instanceof Error ? err.message : 'quote failed',
      );
    }
    if (!quoteCanSend(quote)) throw new QuoteNotSendableError();

    let approveTx: string | undefined;
    let depositTx: string | undefined;
    for (const step of quote.steps) {
      if (!step.tx) throw new QuoteNotSendableError();
      const hash = await this.signer.sendTransaction(step.tx);
      if (step.id === 'approve') approveTx = hash;
      else depositTx = hash;
    }
    if (!depositTx) throw new QuoteNotSendableError();

    // Watch until the money lands, is refunded, or time runs out.
    const now = new Date().toISOString();
    const receipt: Receipt = {
      requestId: quote.requestId,
      approveTx,
      depositTx,
      status: 'pending',
      txHashes: [depositTx],
      usdAmount: usd,
      recipient: req.recipient,
      originChainId: built.originChainId,
      destinationChainId: built.destinationChainId,
      createdAt: now,
      updatedAt: now,
    };
    const finalStatus = await this.watch(quote.requestId);
    receipt.status = finalStatus.status;
    receipt.txHashes = finalStatus.txHashes.length
      ? finalStatus.txHashes
      : [depositTx];
    receipt.updatedAt = new Date().toISOString();

    return receipt;
  }

  /** Poll status until success or refund, or the timeout. A 'failure'
   *  status is not final: the fill can still retry or refund, so it
   *  keeps polling. Backend blips are ignored and retried. */
  private async watch(requestId: string): Promise<StatusResult> {
    const deadline = Date.now() + this.pollTimeoutMs;
    let last: StatusResult = {
      requestId,
      status: 'pending',
      txHashes: [],
    };
    while (Date.now() < deadline) {
      try {
        last = await fetchStatus(this.backendUrl, requestId, this.fetchFn);
        if (last.status === 'success' || last.status === 'refund') {
          return last;
        }
      } catch {
        // Backend blip: keep watching until the timeout.
      }
      await sleep(this.pollIntervalMs);
    }
    return last;
  }
}
