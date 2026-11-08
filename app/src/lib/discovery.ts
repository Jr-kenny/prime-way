// Automatic balance discovery: assets appear on their own.
//
// How it works, in two passes so Home never waits on a long scan:
//
// Fast path (existing): fetchBalances checks the 7 chains the app
// already knows, with their native asset plus USDC and USDT. Home
// shows that result straight away.
//
// Background scan (this file): for every other EVM chain in the
// backend's chain list, check the native balance plus balanceOf for
// each asset in the backend's /currencies list for that chain. Only
// non-zero balances come back. Chains are checked a few at a time,
// results are cached on the device for 10 minutes, and Home merges
// them in as they arrive.
//
// Key-free by design: the chain and asset lists come from the Prime
// Way backend (which holds the Relay key server-side), balances come
// from public RPCs, prices from CoinGecko's public endpoint. No key
// is added to the app anywhere. An asset with no known price still
// shows its amount, with priceUsd null; the total then shows a dash,
// never a made-up number.
//
// What this does NOT do: non-EVM chains (Solana, Bitcoin, Tron) are
// skipped, because balanceOf is an EVM call. A chain with no usable
// public RPC in the backend's list is skipped too. Money that arrives
// without going through the app is not found here either; this only
// finds balances for assets the backend lists.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPublicClient, defineChain, formatUnits, http, erc20Abi } from 'viem';
import type { Chain, PublicClient } from 'viem';
import { BACKEND_URL } from '../config';
import { SUPPORTED_CHAINS, ZERO_ADDRESS } from './chains';
import { fetchPrices, totalUsdFor, sortAssets, type AssetBalance } from './balances';

export const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_KEY = 'primeway.discovery.v1';
/** Chains checked at once, so a phone never fires off 85 calls. */
const CHAIN_BATCH_SIZE = 4;
const BACKEND_TIMEOUT_MS = 10_000;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface BackendChain {
  id: number;
  name: string;
  /** Public RPC for this chain, when the backend list carries one. */
  rpc: string | null;
  nativeSymbol: string | null;
  nativeDecimals: number;
}

export interface BackendCurrency {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name: string;
}

/** CoinGecko ids for symbols we can price. Anything not listed here
 *  gets priceUsd null and still shows its amount. A symbol alone can
 *  misprice a lookalike asset, so this list stays short and only
 *  covers widely used assets. */
const COINGECKO_BY_SYMBOL: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'ethereum',
  BNB: 'binancecoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  POL: 'matic-network',
  AVAX: 'avalanche-2',
  ARB: 'arbitrum',
  OP: 'optimism',
  LINK: 'chainlink',
  WBTC: 'bitcoin',
  SOL: 'solana',
};

const CHAIN_COLORS: Record<number, string> = {
  56: '#D9A40F',
  8453: '#2E6BE6',
  42161: '#3E7CB1',
  1: '#627EEA',
  10: '#E0332B',
  137: '#8B5CF6',
  43114: '#D64545',
};
const DEFAULT_CHAIN_COLOR = '#5B6470';

const LETTERS: Record<string, string> = {
  BNB: 'B',
  ETH: 'Ξ',
  USDC: '$',
  USDT: '₮',
  POL: 'P',
  AVAX: 'A',
};

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface DiscoveryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface BalanceReader {
  (chain: BackendChain, address: `0x${string}`, currency: BackendCurrency): Promise<bigint>;
}

export interface DiscoverOptions {
  fetchFn?: FetchFn;
  balanceReader?: BalanceReader;
  storage?: DiscoveryStorage;
  /** Chain ids the fast path already covers; skipped here. */
  knownChainIds?: number[];
  now?: () => number;
}

export interface DiscoverResult {
  assets: AssetBalance[];
  /** Chains actually checked (had a usable RPC and were EVM). */
  scannedChainIds: number[];
  /** Chains in the backend list we could not check, with the reason. */
  skipped: { chainId: number; reason: string }[];
  updatedAt: number;
}

/** Parse the backend's GET /chains body. Accepts a bare array or an
 *  object with a chains array. Malformed rows are dropped, never
 *  allowed to crash the scan. */
export function parseBackendChains(json: unknown): BackendChain[] {
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { chains?: unknown }).chains)
      ? (json as { chains: unknown[] }).chains
      : [];
  const out: BackendChain[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) continue;
    const name = typeof r.name === 'string' && r.name.length > 0 ? r.name : `Chain ${id}`;
    out.push({
      id,
      name,
      rpc: pickRpc(r),
      nativeSymbol:
        typeof r.nativeSymbol === 'string'
          ? r.nativeSymbol
          : typeof (r.nativeCurrency as Record<string, unknown> | undefined)?.symbol === 'string'
            ? ((r.nativeCurrency as Record<string, unknown>).symbol as string)
            : null,
      nativeDecimals:
        typeof (r.nativeCurrency as Record<string, unknown> | undefined)?.decimals === 'number'
          ? ((r.nativeCurrency as Record<string, unknown>).decimals as number)
          : 18,
    });
  }
  return out;
}

function pickRpc(r: Record<string, unknown>): string | null {
  // The Prime Way backend returns the Relay RPC URL as `rpcUrl`
  // (see backend/CHAINS.md). Accept that first, then the other shapes.
  if (typeof r.rpcUrl === 'string' && r.rpcUrl.startsWith('http')) return r.rpcUrl;
  if (typeof r.rpc === 'string' && r.rpc.startsWith('http')) return r.rpc;
  const urls = r.rpcUrls as Record<string, unknown> | undefined;
  const def = urls?.default as Record<string, unknown> | undefined;
  const httpList = def?.http as unknown;
  if (Array.isArray(httpList) && typeof httpList[0] === 'string' && httpList[0].startsWith('http')) {
    return httpList[0] as string;
  }
  if (Array.isArray(urls) && typeof urls[0] === 'string' && urls[0].startsWith('http')) {
    return urls[0] as string;
  }
  return null;
}

/** Parse the backend's GET /currencies?chainId=<id> body:
 *  {chainId, currencies: [{address, symbol, decimals, name}]}.
 *  A bare array is also accepted. Bad rows are dropped. */
export function parseCurrencies(json: unknown): BackendCurrency[] {
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { currencies?: unknown }).currencies)
      ? (json as { currencies: unknown[] }).currencies
      : [];
  if (!Array.isArray(list)) return [];
  const out: BackendCurrency[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.address !== 'string' || !ADDRESS_RE.test(r.address)) continue;
    if (typeof r.symbol !== 'string' || r.symbol.length === 0 || r.symbol.length > 12) continue;
    if (typeof r.decimals !== 'number' || !Number.isInteger(r.decimals) || r.decimals < 0 || r.decimals > 255) {
      continue;
    }
    const key = r.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      address: r.address as `0x${string}`,
      symbol: r.symbol,
      decimals: r.decimals,
      name: typeof r.name === 'string' ? r.name : r.symbol,
    });
  }
  return out;
}

async function fetchJsonWithTimeout(fetchFn: FetchFn, url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BACKEND_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBackendChains(fetchFn: FetchFn = fetch): Promise<BackendChain[]> {
  const json = await fetchJsonWithTimeout(fetchFn, `${BACKEND_URL}/chains`);
  return parseBackendChains(json);
}

export async function fetchCurrencies(
  chainId: number,
  fetchFn: FetchFn = fetch,
): Promise<BackendCurrency[]> {
  const json = await fetchJsonWithTimeout(
    fetchFn,
    `${BACKEND_URL}/currencies?chainId=${encodeURIComponent(String(chainId))}`,
  );
  return parseCurrencies(json);
}

const rpcClients = new Map<string, PublicClient>();

function clientForRpc(chain: BackendChain): PublicClient | null {
  if (!chain.rpc) return null;
  const key = `${chain.id}:${chain.rpc}`;
  let client = rpcClients.get(key);
  if (client) return client;
  let viemChain: Chain;
  try {
    viemChain = defineChain({
      id: chain.id,
      name: chain.name,
      nativeCurrency: {
        name: chain.nativeSymbol ?? chain.name,
        symbol: chain.nativeSymbol ?? 'ETH',
        decimals: chain.nativeDecimals,
      },
      rpcUrls: { default: { http: [chain.rpc] } },
    });
  } catch {
    return null;
  }
  client = createPublicClient({ chain: viemChain, transport: http(chain.rpc) });
  rpcClients.set(key, client);
  return client;
}

/** Default on-chain read: native balance for the zero address, else
 *  balanceOf. One failing asset never takes the rest down. */
export async function defaultBalanceReader(
  chain: BackendChain,
  address: `0x${string}`,
  currency: BackendCurrency,
): Promise<bigint> {
  const client = clientForRpc(chain);
  if (!client) return 0n;
  if (currency.address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    return client.getBalance({ address });
  }
  return client.readContract({
    address: currency.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

function isEvmChainId(id: number): boolean {
  // Relay's non-EVM ids (Solana, Bitcoin, Tron) are far above the
  // EVM range and have no EVM RPC; without an RPC we skip anyway.
  // This guard keeps the scan from ever treating one as EVM.
  return id > 0 && id < 1_000_000_000;
}

/** Merge fast-path and discovered assets: dedupe by chain + asset
 *  address, fast path wins on a clash, then sort. */
export function mergeBalances(fast: AssetBalance[], discovered: AssetBalance[]): AssetBalance[] {
  const seen = new Set<string>();
  const out: AssetBalance[] = [];
  for (const a of [...fast, ...discovered]) {
    const key = `${a.chainId}:${a.tokenAddress.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return sortAssets(out);
}

/** One total across fast-path and discovered assets. */
export function totalUsdForMerged(fast: AssetBalance[], discovered: AssetBalance[]): number | null {
  return totalUsdFor(mergeBalances(fast, discovered));
}

interface CachedDiscovery {
  updatedAt: number;
  assets: Array<Omit<AssetBalance, 'raw'> & { raw: string }>;
  scannedChainIds: number[];
}

function defaultStorage(): DiscoveryStorage {
  return AsyncStorage;
}

export async function loadCachedDiscovery(
  storage: DiscoveryStorage = defaultStorage(),
  now: () => number = Date.now,
): Promise<AssetBalance[] | null> {
  try {
    const raw = await storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDiscovery;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    if (now() - parsed.updatedAt > DISCOVERY_CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.assets)) return null;
    return parsed.assets.map((a) => ({ ...a, raw: BigInt(a.raw) }));
  } catch {
    return null;
  }
}

export async function saveCachedDiscovery(
  result: DiscoverResult,
  storage: DiscoveryStorage = defaultStorage(),
): Promise<void> {
  try {
    const payload: CachedDiscovery = {
      updatedAt: result.updatedAt,
      scannedChainIds: result.scannedChainIds,
      assets: result.assets.map((a) => ({ ...a, raw: a.raw.toString() })),
    };
    await storage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache is a nice-to-have; a failed save never breaks balances.
  }
}

/** Background scan. Never throws: on any failure it returns what it
 *  found so far (possibly nothing) plus the skipped list. */
export async function discoverBalances(
  address: `0x${string}`,
  opts: DiscoverOptions = {},
): Promise<DiscoverResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const readBalance = opts.balanceReader ?? defaultBalanceReader;
  const now = opts.now ?? Date.now;
  const known = new Set(opts.knownChainIds ?? SUPPORTED_CHAINS.map((c) => c.id));
  const updatedAt = now();
  const result: DiscoverResult = { assets: [], scannedChainIds: [], skipped: [], updatedAt };

  const chains = await fetchBackendChains(fetchFn);
  if (chains.length === 0) {
    result.skipped.push({ chainId: -1, reason: 'chain list unavailable' });
    return result;
  }

  const toScan = chains.filter((c) => !known.has(c.id));
  for (let i = 0; i < toScan.length; i += CHAIN_BATCH_SIZE) {
    const batch = toScan.slice(i, i + CHAIN_BATCH_SIZE);
    await Promise.all(
      batch.map(async (chain) => {
        if (!isEvmChainId(chain.id)) {
          result.skipped.push({ chainId: chain.id, reason: 'not an EVM chain' });
          return;
        }
        if (!chain.rpc) {
          result.skipped.push({ chainId: chain.id, reason: 'no public RPC listed' });
          return;
        }
        const currencies = await fetchCurrencies(chain.id, fetchFn);
        if (currencies.length === 0) {
          result.skipped.push({ chainId: chain.id, reason: 'no asset list' });
          return;
        }
        const priceIds = Array.from(
          new Set(
            currencies
              .map((c) => COINGECKO_BY_SYMBOL[c.symbol.toUpperCase()])
              .filter((id): id is string => typeof id === 'string'),
          ),
        );
        const prices = await fetchPrices(priceIds);
        result.scannedChainIds.push(chain.id);
        for (const currency of currencies) {
          try {
            const raw = await readBalance(chain, address, currency);
            if (raw === 0n) continue;
            const coingeckoId = COINGECKO_BY_SYMBOL[currency.symbol.toUpperCase()];
            const price = coingeckoId ? prices.get(coingeckoId) : undefined;
            result.assets.push({
              chainId: chain.id,
              chainName: chain.name,
              symbol: currency.symbol,
              amount: Number(formatUnits(raw, currency.decimals)),
              raw,
              decimals: currency.decimals,
              priceUsd: price?.usd ?? null,
              change24h: price?.change24h ?? null,
              color: CHAIN_COLORS[chain.id] ?? DEFAULT_CHAIN_COLOR,
              letter: LETTERS[currency.symbol] ?? currency.symbol[0],
              tokenAddress: currency.address,
            });
          } catch {
            // One asset failing must not take the rest down.
          }
        }
      }),
    );
  }
  return result;
}
