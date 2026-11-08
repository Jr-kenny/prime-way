// Config for the Prime Way MCP server, from the environment.
//
// The server runs on the owner's own machine. It signs with the
// owner's agent key, which lives only in the environment here: it is
// never printed, never logged, and never put in the repo.
//
// Required:
//   PRIMEWAY_PRIVATE_KEY   the agent wallet's key (0x plus 64 hex)
// Optional:
//   PRIMEWAY_BACKEND_URL   default: the live Prime Way backend

import { privateKeyToAccount } from 'viem/accounts';
import { PrimeWay } from '@prime-way/sdk';
import { viemSigner, localWalletClient } from '@prime-way/sdk/viem';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function configFromEnv(env: NodeJS.ProcessEnv): PrimeWay {
  const key = required(env, 'PRIMEWAY_PRIVATE_KEY');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('PRIMEWAY_PRIVATE_KEY must be 0x plus 64 hex characters');
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  // The wallet client is built on Base; each step transaction carries
  // its own chain, so sends from any supported chain work.
  const client = localWalletClient(account, 8453);
  return new PrimeWay({
    backendUrl: env.PRIMEWAY_BACKEND_URL,
    wallet: account.address,
    signer: viemSigner(client, account),
  });
}
