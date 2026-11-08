// Real balances for the connected wallet, read from public RPCs.
// No API keys anywhere. Prices come from CoinGecko's public endpoint
// (no key); when prices cannot be fetched, amounts still show and the
// USD total shows a dash instead of a made-up number.

import { createPublicClient, formatUnits, http, erc20Abi } from 'viem';
import type { PublicClient } from 'viem';
import { SUPPORTED_CHAINS, type SupportedChain } from './chains';

export interface AssetBalance {
  chainId: number;
  chainName: string;
  symbol: string;
  amount: number;
  raw: bigint;
  decimals: number;
  priceUsd: number | null;
  change24h: number | null;
  color: string;
  letter: string;
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

async function fetchPrices(ids: string[]): Promise<Map<string, PriceInfo>> {
  const out = new Map<string, PriceInfo>();
  if (ids.length === 0) return out;
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=' +
      encodeURIComponent(ids.join(',')) +
      '&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url);
    if (!res.ok) return out;
    const json = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    for (const id of ids) {
      const row = json[id];
      out.set(id, {
        usd: typeof row?.usd === 'number' ? row.usd : null,
        change24h:
          typeof row?.usd_24h_change === 'number' ? row.usd_24h_change : null,
      });
    }
  } catch {
    // Prices are a nice-to-have; balances still load without them.
  }
  return out;
}

const LETTERS: Record<string, string> = {
  BNB: 'B',
  ETH: 'Ξ',
  USDC: '$',
  USDT: '₮',
  POL: 'P',
  AVAX: 'A',
};

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
    for (const token of chain.tokens) {
      try {
        let raw: bigint;
        if (token.native) {
          raw = await client.getBalance({ address });
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
          amount: Number(formatUnits(raw, token.decimals)),
          raw,
          decimals: token.decimals,
          priceUsd: price?.usd ?? null,
          change24h: price?.change24h ?? null,
          color: chain.color,
          letter: LETTERS[token.symbol] ?? token.symbol[0],
        });
      } catch {
        // One chain or token failing must not take the rest down.
      }
    }
  });
  await Promise.all(jobs);

  const order: Record<string, number> = { BNB: 0, USDC: 1, ETH: 2 };
  assets.sort((a, b) => {
    const bySym = (order[a.symbol] ?? 9) - (order[b.symbol] ?? 9);
    return bySym !== 0 ? bySym : a.chainId - b.chainId;
  });

  let totalUsd: number | null = 0;
  for (const a of assets) {
    if (a.priceUsd === null) {
      totalUsd = null;
      break;
    }
    totalUsd += a.amount * a.priceUsd;
  }
  return { assets, totalUsd, updatedAt: Date.now() };
}
