// Config for the Prime Way MCP server, from the environment.
//
// The server runs on the owner's own machine. It signs with the
// owner's agent key, which lives only in the environment here: it is
// never printed, never logged, and never put in the repo.
//
// Required:
//   PRIMEWAY_PRIVATE_KEY   the agent wallet's key (0x plus 64 hex)
//   PRIMEWAY_RECIPIENTS    JSON list of who may receive, e.g.
//                          [{"address":"0x...","chainId":42161,"label":"Sarah"}]
//   PRIMEWAY_MAX_SEND_USD  most dollars in one send
// Optional:
//   PRIMEWAY_MAX_DAILY_USD most dollars in a rolling 24 hours
//   PRIMEWAY_BACKEND_URL   default: the live Prime Way backend
//   PRIMEWAY_STORE_PATH    default: ~/.prime-way/decisions.json
//   PRIMEWAY_APPROVALS_PATH default: ~/.prime-way/approvals.json

import { privateKeyToAccount } from 'viem/accounts';
import {
  PrimeWay,
  isAddress,
  type RecipientRule,
} from '@prime-way/sdk';
import { viemSigner, localWalletClient } from '@prime-way/sdk/viem';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function parseRecipients(raw: string): RecipientRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PRIMEWAY_RECIPIENTS is not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('PRIMEWAY_RECIPIENTS must be a JSON array');
  }
  return parsed.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e !== 'object' || e === null || !isAddress(String(e.address ?? ''))) {
      throw new Error(`PRIMEWAY_RECIPIENTS[${i}] has no valid address`);
    }
    const rule: RecipientRule = {
      address: e.address as `0x${string}`,
    };
    if (e.chainId !== undefined) {
      if (typeof e.chainId !== 'number' || !Number.isInteger(e.chainId)) {
        throw new Error(`PRIMEWAY_RECIPIENTS[${i}].chainId must be an integer`);
      }
      rule.chainId = e.chainId;
    }
    if (typeof e.label === 'string') rule.label = e.label;
    return rule;
  });
}

export function configFromEnv(env: NodeJS.ProcessEnv): PrimeWay {
  const key = required(env, 'PRIMEWAY_PRIVATE_KEY');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('PRIMEWAY_PRIVATE_KEY must be 0x plus 64 hex characters');
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  const recipients = parseRecipients(required(env, 'PRIMEWAY_RECIPIENTS'));
  const maxSendUsd = Number(required(env, 'PRIMEWAY_MAX_SEND_USD'));
  if (!Number.isFinite(maxSendUsd) || maxSendUsd <= 0) {
    throw new Error('PRIMEWAY_MAX_SEND_USD must be a positive number');
  }
  let maxDailyUsd: number | undefined;
  if (env.PRIMEWAY_MAX_DAILY_USD !== undefined && env.PRIMEWAY_MAX_DAILY_USD !== '') {
    maxDailyUsd = Number(env.PRIMEWAY_MAX_DAILY_USD);
    if (!Number.isFinite(maxDailyUsd) || maxDailyUsd <= 0) {
      throw new Error('PRIMEWAY_MAX_DAILY_USD must be a positive number');
    }
  }
  // The wallet client is built on Base; each step transaction carries
  // its own chain, so sends from any supported chain work.
  const client = localWalletClient(account, 8453);
  return new PrimeWay({
    backendUrl: env.PRIMEWAY_BACKEND_URL,
    wallet: account.address,
    signer: viemSigner(client, account),
    recipients,
    maxSendUsd,
    maxDailyUsd,
    store: undefined,
    approvalsPath: env.PRIMEWAY_APPROVALS_PATH,
  });
}
