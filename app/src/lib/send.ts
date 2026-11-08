// Sending through Relay: run the quote's steps with the connected
// wallet, then watch the send until it lands.
//
// A quote's steps are the approve step, then the deposit step. Each
// step carries its own transaction (to, data, value, chain id). This
// code only ever sends what the quote itself describes, one step at a
// time, in order. It never signs anything else.
//
// NOTE: this module is never called by the app itself and no live send
// is ever made from this machine. The Confirm screen calls it only
// after the user taps Send, and only when the quote carries full step
// data (see quoteCanSend in relay.ts).

import {
  createWalletClient,
  http,
  type Account,
  type Chain,
  type WalletClient,
} from 'viem';
import type { Quote } from './relay';
import { chainById } from './chains';

export class StepsNotExecutableError extends Error {
  constructor() {
    super('quote has no send details');
    this.name = 'StepsNotExecutableError';
  }
}

/** A step failed after an earlier step already landed. The hashes
 *  of what did go out ride on the error, so the caller can record
 *  them and tell the user honestly instead of discarding them. */
export class PartialExecutionError extends Error {
  approveTx?: `0x${string}`;
  depositTx?: `0x${string}`;
  constructor(message: string, approveTx?: `0x${string}`, depositTx?: `0x${string}`) {
    super(message);
    this.name = 'PartialExecutionError';
    this.approveTx = approveTx;
    this.depositTx = depositTx;
  }
}

export interface SendExecutor {
  /** Send one transaction described by a quote step. */
  sendStep: (step: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
  }) => Promise<`0x${string}`>;
}

/** Build an executor around a viem wallet client for one account. */
export function executorFromWalletClient(
  client: WalletClient,
  account: Account | `0x${string}`,
): SendExecutor {
  return {
    async sendStep(step) {
      const chain = chainById(step.chainId);
      if (!chain) throw new Error(`unsupported chain ${step.chainId}`);
      return client.sendTransaction({
        account,
        chain: chain.viemChain,
        to: step.to,
        data: step.data,
        value: BigInt(step.value || '0'),
      } as never);
    },
  };
}

/** Quotes already started, by requestId. A quote that already
 *  started never executes a second deposit: running the same quote
 *  again (for example, going back from PinGate and tapping Send
 *  again, which remounts Sending) returns the first run's result
 *  instead of sending again. The entry stays even when the run
 *  failed: a failed quote is retried with a fresh quote from
 *  Confirm, never by re-running the old one. */
const startedQuotes = new Map<
  string,
  Promise<{ approveTx?: `0x${string}`; depositTx: `0x${string}` }>
>();

/** Run a quote's steps in order. Returns the deposit tx hash.
 *  When a step fails after an earlier step already went out, the
 *  error is a PartialExecutionError carrying the hashes of what
 *  landed, so the approval is never silently lost. */
export async function executeQuoteSteps(
  quote: Quote,
  executor: SendExecutor,
): Promise<{ approveTx?: `0x${string}`; depositTx: `0x${string}` }> {
  const existing = startedQuotes.get(quote.requestId);
  if (existing) return existing;
  const run = runSteps(quote, executor);
  startedQuotes.set(quote.requestId, run);
  return run;
}

/** The step runner, without the idempotency guard. */
async function runSteps(
  quote: Quote,
  executor: SendExecutor,
): Promise<{ approveTx?: `0x${string}`; depositTx: `0x${string}` }> {
  if (!quote.steps.length) throw new StepsNotExecutableError();
  let approveTx: `0x${string}` | undefined;
  let depositTx: `0x${string}` | undefined;
  try {
    for (const step of quote.steps) {
      if (!step.tx) throw new StepsNotExecutableError();
      const hash = await executor.sendStep(step.tx);
      if (step.id === 'approve') approveTx = hash;
      else depositTx = hash;
    }
  } catch (err) {
    if (approveTx || depositTx) {
      throw new PartialExecutionError(
        err instanceof Error ? err.message : 'a step failed',
        approveTx,
        depositTx,
      );
    }
    throw err;
  }
  if (!depositTx) throw new Error('quote had no deposit step');
  return { approveTx, depositTx };
}

/** A viem wallet client for an account that signs with a local key. */
export function localWalletClient(
  account: Account,
  chain: Chain,
  rpcUrl: string,
): WalletClient {
  return createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
}
