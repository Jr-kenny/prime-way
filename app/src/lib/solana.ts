// Solana, watch-only.
//
// Prime Way holds no Solana key: the user pastes a Solana address
// in Settings, it is stored as a public address in AsyncStorage
// (never SecureStore, it is not a secret), and balances are read
// over plain JSON-RPC with no SDK and no key: getBalance for SOL
// plus getTokenAccountsByOwner for SPL tokens, three calls per scan.
//
// Token program ids are the well-known ones: the original Token
// program and Token-2022. Known mints are hardcoded (SOL, USDC,
// USDT); an unknown mint is never hidden, it shows its truncated
// mint as the label with no price until it is known.

import { ZERO_ADDRESS } from './chains';
import { SOLANA_CHAIN_ID, trustWalletIconUrl } from './tokenIcons';
import type { AssetBalance } from './balances';

export const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
export const SOLANA_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SOLANA_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const SOL_MINT = '11111111111111111111111111111111';
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True for a plausible Solana address: base58, 32 to 44 chars.
 *  This is a shape check, not proof the address exists on chain. */
export function isSolanaAddress(value: string): boolean {
  return SOLANA_BASE58_RE.test(value.trim());
}

export function shortMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

interface KnownSolanaToken {
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId: string | null;
}

const KNOWN_MINTS: Record<string, KnownSolanaToken> = {
  [SOL_MINT]: { symbol: 'SOL', name: 'Solana', decimals: 9, coingeckoId: 'solana' },
  [SOLANA_USDC_MINT]: { symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
  [SOLANA_USDT_MINT]: { symbol: 'USDT', name: 'Tether', decimals: 6, coingeckoId: 'tether' },
};

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`solana rpc failed (${res.status})`);
  return (await res.json()) as unknown;
}

interface TokenAccountRow {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { amount: string; decimals: number; uiAmount: number | null };
        };
      };
    };
  };
}

function solanaAsset(
  mint: string,
  amount: number,
  raw: bigint,
  decimals: number,
  priceUsd: number | null,
): AssetBalance {
  const known = KNOWN_MINTS[mint];
  const symbol = known?.symbol ?? shortMint(mint);
  const native = mint === SOL_MINT;
  return {
    chainId: SOLANA_CHAIN_ID,
    chainName: 'Solana',
    symbol,
    name: known?.name ?? 'Solana token',
    amount,
    raw,
    decimals,
    priceUsd,
    change24h: null,
    color: '#9945FF',
    tokenAddress: mint,
    vmType: 'svm',
    native,
    iconUrl: trustWalletIconUrl(SOLANA_CHAIN_ID, mint, native),
  };
}

/** All non-zero Solana balances for a watch-only address: SOL plus
 *  every SPL token account under both token programs. Never throws:
 *  on any failure it returns what it found so far. */
export async function fetchSolanaBalances(
  address: string,
  fetchPrices?: (ids: string[]) => Promise<Map<string, { usd: number | null; change24h: number | null }>>,
): Promise<AssetBalance[]> {
  const out: AssetBalance[] = [];
  const priceIds = ['solana', 'usd-coin', 'tether'];
  let prices = new Map<string, { usd: number | null; change24h: number | null }>();
  try {
    if (fetchPrices) prices = await fetchPrices(priceIds);
  } catch {
    // Prices are a nice-to-have; balances still load without them.
  }
  const priceFor = (mint: string): number | null => {
    const id = KNOWN_MINTS[mint]?.coingeckoId;
    return id ? (prices.get(id)?.usd ?? null) : null;
  };

  try {
    const bal = (await solanaRpc('getBalance', [address])) as {
      result?: { value?: number };
    };
    const lamports = bal.result?.value ?? 0;
    if (lamports > 0) {
      out.push(
        solanaAsset(SOL_MINT, lamports / 1e9, BigInt(lamports), 9, priceFor(SOL_MINT)),
      );
    }
  } catch {
    // One call failing must not take the rest down.
  }

  for (const programId of [SOLANA_TOKEN_PROGRAM, SOLANA_TOKEN_2022_PROGRAM]) {
    try {
      const res = (await solanaRpc('getTokenAccountsByOwner', [
        address,
        { programId },
        { encoding: 'jsonParsed' },
      ])) as { result?: { value?: TokenAccountRow[] } };
      for (const row of res.result?.value ?? []) {
        const info = row.account.data.parsed.info;
        const rawAmount = BigInt(info.tokenAmount.amount || '0');
        if (rawAmount === 0n) continue;
        const decimals = info.tokenAmount.decimals;
        const amount = Number(rawAmount) / 10 ** decimals;
        out.push(
          solanaAsset(info.mint, amount, rawAmount, decimals, priceFor(info.mint)),
        );
      }
    } catch {
      // One program failing must not take the other down.
    }
  }
  return out;
}

// Re-exported so callers do not need a second import for the
// zero-address sentinel used as the native marker elsewhere.
export { ZERO_ADDRESS };
