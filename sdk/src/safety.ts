// Safety rules, enforced in code, not in documentation.
//
// 1. One decision = one send. A decision key identifies a single send.
//    The caller supplies one, or supplies a nonce and the key is a hash
//    of recipient + amount + chains + nonce. The same key never sends
//    twice: the store answers a retry with the stored receipt.
// 2. Spending limit. A per-send cap, and an optional daily cap. A send
//    over a cap does not send: it waits for a human to approve it.
// 3. Approved recipients. A send goes only to an address (and chain)
//    the owner put on the list. Anything else is refused.
// 4. Human approval. Approval is an explicit act by the owner: they
//    re-issue the same decision with approved: true, or they write the
//    decision key into the approvals file. There is no approve tool an
//    agent can call, and no timeout that approves on its own.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DecisionRecord } from './store.js';

export interface RecipientRule {
  /** The address the agent may send to (any case). */
  address: `0x${string}`;
  /** When set, only this destination chain is allowed for the address. */
  chainId?: number;
  /** A human name for the list, e.g. "Sarah". Never required. */
  label?: string;
}

export function isAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** The owner-supplied key for a decision, or a hash of the decision
 *  itself plus a caller nonce. The nonce is what makes two identical
 *  sends (same person, same amount) two different decisions. */
export function makeDecisionKey(input: {
  recipient: string;
  amount: string;
  originChainId: number;
  destinationChainId: number;
  nonce: string;
}): string {
  const hash = createHash('sha256');
  hash.update(
    [
      input.recipient.toLowerCase(),
      input.amount,
      String(input.originChainId),
      String(input.destinationChainId),
      input.nonce,
    ].join('|'),
  );
  return `pw_${hash.digest('hex')}`;
}

export function recipientAllowed(
  rules: RecipientRule[],
  recipient: string,
  destinationChainId: number,
): boolean {
  const addr = recipient.toLowerCase();
  return rules.some(
    (r) =>
      r.address.toLowerCase() === addr &&
      (r.chainId === undefined || r.chainId === destinationChainId),
  );
}

export type LimitBreach = 'over-per-send-limit' | 'over-daily-limit';

/** Which limit, if any, a send of this size would breach. */
export function checkLimits(input: {
  usdAmount: number;
  maxSendUsd: number;
  maxDailyUsd?: number;
  spentTodayUsd: number;
}): { breach: LimitBreach; limitUsd: number } | null {
  if (!(input.usdAmount > 0) || !Number.isFinite(input.usdAmount)) {
    return null;
  }
  if (input.usdAmount > input.maxSendUsd) {
    return { breach: 'over-per-send-limit', limitUsd: input.maxSendUsd };
  }
  if (
    input.maxDailyUsd !== undefined &&
    input.spentTodayUsd + input.usdAmount > input.maxDailyUsd
  ) {
    return { breach: 'over-daily-limit', limitUsd: input.maxDailyUsd };
  }
  return null;
}

/** Dollars sent in the last 24 hours, from the store. Refunded sends
 *  do not count: the money came back. */
export async function spentInLastDay(
  store: { list(): Promise<DecisionRecord[]> },
  nowMs: number = Date.now(),
): Promise<number> {
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;
  let total = 0;
  for (const record of await store.list()) {
    const r = record.receipt;
    if (!r) continue;
    if (r.status === 'refund') continue;
    if (Date.parse(r.createdAt) < dayAgo) continue;
    total += r.usdAmount;
  }
  return total;
}

export function defaultApprovalsPath(): string {
  if (process.env.PRIMEWAY_APPROVALS_PATH) {
    return process.env.PRIMEWAY_APPROVALS_PATH;
  }
  return join(homedir(), '.prime-way', 'approvals.json');
}

/** Decision keys the owner has approved, from the approvals file.
 *  The file is written by the owner (or by approve()), never by an
 *  agent tool. A missing file means nothing is approved. */
export async function readApprovals(
  path: string = defaultApprovalsPath(),
): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { approved?: string[] };
    return new Set(parsed.approved ?? []);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw err;
  }
}

export async function writeApproval(
  decisionKey: string,
  path: string = defaultApprovalsPath(),
): Promise<void> {
  const approved = await readApprovals(path);
  approved.add(decisionKey);
  const { dirname } = await import('node:path');
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await fs.writeFile(
    tmp,
    JSON.stringify({ approved: [...approved] }, null, 2),
    'utf8',
  );
  await fs.rename(tmp, path);
}
