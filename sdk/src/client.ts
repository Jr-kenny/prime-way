// The Prime Way agent client.
//
// One client, three abilities: get a live quote, send money through
// a quote's steps, and check a send. Every send runs the safety rules
// in safety.ts first: the recipient must be on the owner's list, the
// amount must fit the limits (or a human must have approved it), and
// the decision key must not have sent already.
//
// A send never throws for being refused or for needing approval: it
// returns a SendOutcome, and TypeScript makes the caller handle each
// case. It throws only for mistakes (bad input, bad config) and for
// backend failures.

import {
  DEFAULT_BACKEND_URL,
  fetchQuote,
  fetchStatus,
  quoteCanSend,
  quoteRequestFor,
  type FetchFn,
  type Quote,
  type StatusResult,
} from './quote.js';
import {
  FileDecisionStore,
  type DecisionStore,
  type PendingDecision,
  type Receipt,
} from './store.js';
import {
  checkLimits,
  defaultApprovalsPath,
  isAddress,
  makeDecisionKey,
  readApprovals,
  recipientAllowed,
  spentInLastDay,
  writeApproval,
  type RecipientRule,
} from './safety.js';
import {
  BackendError,
  InvalidSendError,
  QuoteNotSendableError,
} from './errors.js';
import type { Signer } from './signer.js';

export interface PrimeWayConfig {
  /** The Prime Way backend. Defaults to the live service. */
  backendUrl?: string;
  /** The wallet that sends the money (must match the signer). */
  wallet: `0x${string}`;
  /** Sends the step transactions. The SDK never holds a key. */
  signer: Signer;
  /** Who the agent may send to. Empty means nobody: fail closed. */
  recipients: RecipientRule[];
  /** Most dollars in a single send. Required: there is no default. */
  maxSendUsd: number;
  /** Most dollars in a rolling 24 hours. Optional. */
  maxDailyUsd?: number;
  /** Where executed decisions are recorded. Defaults to a JSON file
   *  at ~/.prime-way/decisions.json so retries survive restarts. */
  store?: DecisionStore;
  /** Where owner approvals live. Defaults to ~/.prime-way/approvals.json. */
  approvalsPath?: string;
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
  /** Identifies this one decision. Supply it, or supply a nonce and
   *  the key is derived from the decision itself. */
  decisionKey?: string;
  /** Makes two identical sends two different decisions. */
  nonce?: string;
  /** The owner already approved this decision (re-issue after a
   *  needs-approval result, or the key is in the approvals file). */
  approved?: boolean;
}

export type SendOutcome =
  | { outcome: 'sent'; receipt: Receipt }
  | { outcome: 'already-sent'; receipt: Receipt }
  | { outcome: 'needs-approval'; decision: PendingDecision }
  | {
      outcome: 'refused';
      reason: 'recipient-not-allowed';
      recipient: string;
      destinationChainId: number;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PrimeWay {
  private readonly backendUrl: string;
  private readonly wallet: `0x${string}`;
  private readonly signer: Signer;
  private readonly recipients: RecipientRule[];
  private readonly maxSendUsd: number;
  private readonly maxDailyUsd?: number;
  private readonly store: DecisionStore;
  private readonly approvalsPath: string;
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
    if (!(config.maxSendUsd > 0) || !Number.isFinite(config.maxSendUsd)) {
      throw new InvalidSendError('maxSendUsd must be a positive number');
    }
    if (
      config.maxDailyUsd !== undefined &&
      (!(config.maxDailyUsd > 0) || !Number.isFinite(config.maxDailyUsd))
    ) {
      throw new InvalidSendError('maxDailyUsd must be a positive number');
    }
    this.backendUrl = config.backendUrl ?? DEFAULT_BACKEND_URL;
    this.wallet = config.wallet;
    this.signer = config.signer;
    this.recipients = config.recipients;
    this.maxSendUsd = config.maxSendUsd;
    this.maxDailyUsd = config.maxDailyUsd;
    this.store = config.store ?? new FileDecisionStore();
    this.approvalsPath = config.approvalsPath ?? defaultApprovalsPath();
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
    this.pollTimeoutMs = config.pollTimeoutMs ?? 10 * 60 * 1000;
    this.fetchFn = config.fetch ?? fetch;
  }

  /** A live quote for a send. Read-only: quoting never moves money
   *  and never checks the recipient list. The send enforces that. */
  async getQuote(req: Omit<SendRequest, 'decisionKey' | 'nonce' | 'approved'>): Promise<Quote> {
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

  /** The owner approves a waiting decision. This is a human act: it
   *  writes the decision key into the approvals file. There is no
   *  agent tool that calls this. */
  async approve(decisionKey: string): Promise<void> {
    await writeApproval(decisionKey, this.approvalsPath);
  }

  /** Every recorded decision and receipt, for audit. */
  async listDecisions() {
    return this.store.list();
  }

  /** Send money. Returns a SendOutcome: sent, already-sent (a retry
   *  of an executed decision, with the stored receipt), needs-approval
   *  (nothing sent), or refused (nothing sent). */
  async send(req: SendRequest): Promise<SendOutcome> {
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

    const decisionKey =
      req.decisionKey ??
      (req.nonce
        ? makeDecisionKey({
            recipient: req.recipient,
            amount: built.amount,
            originChainId: built.originChainId,
            destinationChainId: built.destinationChainId,
            nonce: req.nonce,
          })
        : undefined);
    if (!decisionKey) {
      throw new InvalidSendError(
        'supply decisionKey, or supply a nonce so one can be derived',
      );
    }

    // One decision = one send. An executed decision answers with its
    // receipt, whatever the config says now.
    const existing = await this.store.get(decisionKey);
    if (existing?.receipt) {
      return { outcome: 'already-sent', receipt: existing.receipt };
    }

    const approved =
      req.approved === true ||
      (await readApprovals(this.approvalsPath)).has(decisionKey);
    if (existing?.pending && !approved) {
      return { outcome: 'needs-approval', decision: existing.pending };
    }

    // Approved recipients only. A stranger is refused, not sent.
    if (!recipientAllowed(this.recipients, req.recipient, req.destinationChainId)) {
      return {
        outcome: 'refused',
        reason: 'recipient-not-allowed',
        recipient: req.recipient,
        destinationChainId: req.destinationChainId,
      };
    }

    // Spending limits. Over a limit, the decision waits for a human.
    const spentToday = await spentInLastDay(this.store);
    const breach = checkLimits({
      usdAmount: usd,
      maxSendUsd: this.maxSendUsd,
      maxDailyUsd: this.maxDailyUsd,
      spentTodayUsd: spentToday,
    });
    if (breach && !approved) {
      const pending: PendingDecision = {
        decisionKey,
        usdAmount: usd,
        recipient: req.recipient,
        originChainId: built.originChainId,
        destinationChainId: built.destinationChainId,
        reason: breach.breach,
        limitUsd: breach.limitUsd,
        spentTodayUsd: spentToday,
        createdAt: new Date().toISOString(),
      };
      await this.store.put({ key: decisionKey, pending });
      return { outcome: 'needs-approval', decision: pending };
    }

    // Live quote, then the steps, in order, with the signer's wallet.
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

    // Record the receipt the moment the deposit is sent, before
    // watching: a retry after this point must find it, not re-send.
    const now = new Date().toISOString();
    const receipt: Receipt = {
      decisionKey,
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
    await this.store.put({ key: decisionKey, receipt });

    // Watch until the money lands, is refunded, or time runs out.
    const finalStatus = await this.watch(quote.requestId);
    receipt.status = finalStatus.status;
    receipt.txHashes = finalStatus.txHashes.length
      ? finalStatus.txHashes
      : [depositTx];
    receipt.updatedAt = new Date().toISOString();
    await this.store.put({ key: decisionKey, receipt });

    return { outcome: 'sent', receipt };
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
