// Real balances for the connected wallet, read from public RPCs.
// No API keys anywhere. Prices come from CoinGecko's public endpoint
// (no key); when prices cannot be fetched, amounts still show and the
// USD total shows a dash instead of a made-up number.
//
// ERC-20 balances go through Multicall3 where the chain has one,
// with a fallback to one balanceOf call per token when the batch
// fails. Native balances are single calls. Icons are real brand art
// resolved from Trust Wallet, then the token's CoinGecko listing
// (see lib/tokenIcons); a token no source can resolve shows "?".
// There is no letter placeholder anywhere in the UI.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPublicClient, formatUnits, http, erc20Abi } from 'viem';
import type { PublicClient } from 'viem';
import { SUPPORTED_CHAINS, ZERO_ADDRESS, type SupportedChain } from './chains';
import { trustWalletIconUrl } from './tokenIcons';

export interface AssetBalance {
  chainId: number;
  chainName: string;
  symbol: string;
  /** Display name, when known. Unknown tokens fall back to the symbol. */
  name?: string;
  amount: number;
  raw: bigint;
  decimals: number;
  priceUsd: number | null;
  change24h: number | null;
  color: string;
  /** Address of the asset, the zero address for a native asset, or
   *  a Solana mint for Solana assets. */
  tokenAddress: string;
  /** 'evm' for EVM chains, 'svm' for Solana. */
  vmType: 'evm' | 'svm';
  native: boolean;
  /** Resolved brand-icon URL, when one is known. */
  iconUrl: string | null;
}

export interface BalancesResult {
  assets: AssetBalance[];
  totalUsd: number | null;
  updatedAt: number;
}

const clients = new Map<number, PublicClient>();

export function publicClientFor(chain: SupportedChain): PublicClient {
  let client = clients.get(chain.id);
  if (!client) {
    client = createPublicClient({
      chain: chain.viemChain,
      transport: http(chain.rpc),
    });
    clients.set(chain.id, client);
  }
  return client;
}

interface PriceInfo {
  usd: number | null;
  change24h: number | null;
}

const PRICES_CACHE_KEY = 'primeway.prices.v1';
const PRICES_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedPrices {
  updatedAt: number;
  ids: string[];
  values: Record<string, PriceInfo>;
}

export async function fetchPrices(ids: string[]): Promise<Map<string, PriceInfo>> {
  const out = new Map<string, PriceInfo>();
  if (ids.length === 0) return out;
  const sorted = [...new Set(ids)].sort();
  try {
    const raw = await AsyncStorage.getItem(PRICES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CachedPrices;
      if (
        cached &&
        Date.now() - cached.updatedAt < PRICES_CACHE_TTL_MS &&
        sorted.every((id) => cached.ids.includes(id))
      ) {
        for (const id of sorted) {
          const row = cached.values[id];
          if (row) out.set(id, row);
        }
        if (out.size === sorted.length) return out;
      }
    }
  } catch {
    // A bad cache never blocks a live fetch.
  }
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=' +
      encodeURIComponent(sorted.join(',')) +
      '&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url);
    if (!res.ok) return out;
    const json = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    const values: Record<string, PriceInfo> = {};
    for (const id of sorted) {
      const row = json[id];
      const info: PriceInfo = {
        usd: typeof row?.usd === 'number' ? row.usd : null,
        change24h:
          typeof row?.usd_24h_change === 'number' ? row.usd_24h_change : null,
      };
      out.set(id, info);
      values[id] = info;
    }
    try {
      const payload: CachedPrices = { updatedAt: Date.now(), ids: sorted, values };
      await AsyncStorage.setItem(PRICES_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Cache is a nice-to-have.
    }
  } catch {
    // Prices are a nice-to-have; balances still load without them.
  }
  return out;
}

/** Read every ERC-20 balance on one chain in a single Multicall3
 *  call. Returns null when the batch fails, so the caller falls
 *  back to one balanceOf per token. */
async function multicallBalances(
  client: PublicClient,
  tokens: { address: `0x${string}` }[],
  address: `0x${string}`,
): Promise<bigint[] | null> {
  try {
    const results = await client.multicall({
      contracts: tokens.map((t) => ({
        address: t.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      })),
    });
    const out: bigint[] = [];
    for (const r of results) {
      if (r.status !== 'success' || typeof r.result !== 'bigint') return null;
      out.push(r.result);
    }
    return out;
  } catch {
    return null;
  }
}

/** All non-zero balances for an address across every supported chain. */
export async function fetchBalances(
  address: `0x${string}`,
): Promise<BalancesResult> {
  const priceIds = Array.from(
    new Set(SUPPORTED_CHAINS.flatMap((c) => c.tokens.map((t) => t.coingeckoId))),
  );
  const prices = await fetchPrices(priceIds);

  const assets: AssetBalance[] = [];
  const jobs = SUPPORTED_CHAINS.map(async (chain) => {
    const client = publicClientFor(chain);
    const erc20 = chain.tokens.filter((t) => !t.native);
    const batched = await multicallBalances(client, erc20, address);
    const batchedByAddress = new Map<string, bigint>();
    if (batched) {
      erc20.forEach((t, i) => batchedByAddress.set(t.address.toLowerCase(), batched[i]));
    }
    for (const token of chain.tokens) {
      try {
        let raw: bigint;
        if (token.native) {
          raw = await client.getBalance({ address });
        } else if (batchedByAddress.has(token.address.toLowerCase())) {
          raw = batchedByAddress.get(token.address.toLowerCase()) as bigint;
        } else {
          raw = await client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          });
        }
        if (raw === 0n) continue;
        const price = prices.get(token.coingeckoId);
        assets.push({
          chainId: chain.id,
          chainName: chain.name,
          symbol: token.symbol,
          name: token.symbol,
          amount: Number(formatUnits(raw, token.decimals)),
          raw,
          decimals: token.decimals,
          priceUsd: price?.usd ?? null,
          change24h: price?.change24h ?? null,
          color: chain.color,
          tokenAddress: token.address,
          vmType: 'evm',
          native: token.native,
          iconUrl: trustWalletIconUrl(chain.id, token.address, token.native),
        });
      } catch {
        // One chain or token failing must not take the rest down.
      }
    }
  });
  await Promise.all(jobs);

  sortAssetsInPlace(assets);
  return { assets, totalUsd: totalUsdFor(assets), updatedAt: Date.now() };
}

/** One total across a list of assets. Null when any asset has no
 *  known price, so the app shows a dash instead of a made-up number.
 *  An empty list totals zero. */
export function totalUsdFor(assets: AssetBalance[]): number | null {
  let total: number | null = 0;
  for (const a of assets) {
    if (a.priceUsd === null) {
      total = null;
      break;
    }
    total += a.amount * a.priceUsd;
  }
  return total;
}

function usdValue(a: AssetBalance): number | null {
  return a.priceUsd === null ? null : a.amount * a.priceUsd;
}

/** Shared sort: by USD value, highest first; unpriced assets last,
 *  then by symbol so the order is stable. */
export function sortAssets(assets: AssetBalance[]): AssetBalance[] {
  const out = [...assets];
  sortAssetsInPlace(out);
  return out;
}

function sortAssetsInPlace(assets: AssetBalance[]): void {
  assets.sort((a, b) => {
    const av = usdValue(a);
    const bv = usdValue(b);
    if (av !== null && bv !== null && av !== bv) return bv - av;
    if (av !== null && bv === null) return -1;
    if (av === null && bv !== null) return 1;
    if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
    return a.chainId - b.chainId;
  });
}

export { ZERO_ADDRESS };
