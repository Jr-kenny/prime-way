// Token icons: real brand art from listing sources, never a
// letter placeholder, never hidden, never user-imported.
//
// Source order for a held token:
//   1. A supplied iconUrl (e.g. Relay's metadata logoURI, passed
//      through by the backend's /currencies as iconUrl).
//   2. CoinGecko public API (no key) — the listing every real token
//      has: GET /coins/{platform}/contract/{address} for tokens, or
//      GET /coins/{id} for natives, and the returned image.large is
//      the token's own brand icon. CoinGecko is rate-limited on the
//      free tier, so calls are spaced out, de-duplicated in flight,
//      and only made when the supplied icon has already missed.
//   3. CoinMarketCap, via the Prime Way backend only —
//      GET /token-icon on the backend (BACKEND_URL), which calls
//      CoinMarketCap with the key from its own environment. The key
//      NEVER lives in this app: there is no CoinMarketCap key, header
//      or key string anywhere in the app tree. The backend answers
//      { logoUrl } or { logoUrl: null }; when it is down, not
//      configured (no key yet) or rate-limited, this step is skipped
//      and the next source is tried, never an error to the user.
//   4. Trust Wallet assets repo — deterministic URL, no key:
//      blockchains/<folder>/assets/<EIP-55 checksummed address>/logo.png,
//      natives at blockchains/<folder>/info/logo.png. The address
//      folder is case-sensitive, so addresses go through viem
//      getAddress() first; a lower-case address 404s.
//   5. Nothing resolves — the token is mostly unverified, not listed
//      on CoinGecko or CoinMarketCap or in Trust Wallet. The slot
//      then shows "?", a question mark, because there is no verified
//      symbol. There is no user-import flow: a token's icon is not on
//      chain, and a user cannot be expected to have it.
//   Solana Metaplex metadata is NOT a source: it needs an on-chain
//   metadata fetch (a separate careful pass), so Solana tokens use
//   the same sources above.
//
// Resolutions are cached for 24h, including misses, so a 404 is not
// re-fetched on every Home visit. A CoinGecko 429 or network error,
// or a CoinMarketCap/backend failure, is NOT cached as a miss — the
// next visit retries. React Native's <Image> has no guaranteed disk
// cache, so icons may re-download after the app is killed; that is
// accepted for v1.
//
// Icons a user had imported under the old flow are no longer read
// anywhere — that module is deleted — so old user-imported pictures
// can never show. The stored key is inert and never rendered.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress } from 'viem';
import { BACKEND_URL } from '../config';

export const SOLANA_CHAIN_ID = 792703809;

const TRUSTWALLET_BASE =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

/** Trust Wallet folder per chain id. Optimism and Polygon were
 *  verified live 2026-11-12 (their native logo.png returns 200);
 *  the rest were verified earlier. */
export const TRUSTWALLET_FOLDER: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  56: 'smartchain',
  137: 'polygon',
  42161: 'arbitrum',
  8453: 'base',
  43114: 'avalanchec',
  [SOLANA_CHAIN_ID]: 'solana',
};

/** CoinGecko asset-platform id per chain id, for
 *  /coins/{platform}/contract/{address}. */
const COINGECKO_PLATFORM: Record<number, string> = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  56: 'binance-smart-chain',
  137: 'polygon-pos',
  42161: 'arbitrum-one',
  8453: 'base',
  43114: 'avalanche',
  [SOLANA_CHAIN_ID]: 'solana',
};

/** CoinGecko coin id per chain, for natives via /coins/{id}. */
const COINGECKO_NATIVE_ID: Record<number, string> = {
  1: 'ethereum',
  10: 'ethereum',
  56: 'binancecoin',
  137: 'matic-network',
  42161: 'ethereum',
  8453: 'ethereum',
  43114: 'avalanche-2',
  [SOLANA_CHAIN_ID]: 'solana',
};

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const ICON_CACHE_KEY = 'primeway.icons.v1';
const RESOLVED_CACHE_KEY = 'primeway.iconResolved.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Minimum gap between CoinGecko calls (free tier is rate-limited). */
const COINGECKO_MIN_INTERVAL_MS = 2000;
const COINGECKO_TIMEOUT_MS = 8000;

interface UrlCacheEntry {
  ok: boolean;
  checkedAt: number;
}

interface ResolvedCacheEntry {
  /** The resolved icon URL, or null when no source had one. */
  url: string | null;
  checkedAt: number;
}

let urlCache: Record<string, UrlCacheEntry> | null = null;
let urlCacheLoaded = false;
let resolvedCache: Record<string, ResolvedCacheEntry> | null = null;
let resolvedCacheLoaded = false;

async function loadUrlCache(): Promise<Record<string, UrlCacheEntry>> {
  if (urlCache) return urlCache;
  if (urlCacheLoaded) return {};
  urlCacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(ICON_CACHE_KEY);
    urlCache = raw ? (JSON.parse(raw) as Record<string, UrlCacheEntry>) : {};
  } catch {
    urlCache = {};
  }
  return urlCache ?? {};
}

async function saveUrlCache(): Promise<void> {
  if (!urlCache) return;
  try {
    await AsyncStorage.setItem(ICON_CACHE_KEY, JSON.stringify(urlCache));
  } catch {
    // Cache is a nice-to-have; a failed save never breaks icons.
  }
}

async function loadResolvedCache(): Promise<Record<string, ResolvedCacheEntry>> {
  if (resolvedCache) return resolvedCache;
  if (resolvedCacheLoaded) return {};
  resolvedCacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(RESOLVED_CACHE_KEY);
    resolvedCache = raw ? (JSON.parse(raw) as Record<string, ResolvedCacheEntry>) : {};
  } catch {
    resolvedCache = {};
  }
  return resolvedCache ?? {};
}

async function saveResolvedCache(): Promise<void> {
  if (!resolvedCache) return;
  try {
    await AsyncStorage.setItem(RESOLVED_CACHE_KEY, JSON.stringify(resolvedCache));
  } catch {
    // Cache is a nice-to-have; a failed save never breaks icons.
  }
}

export function iconCacheKey(chainId: number, tokenAddress: string): string {
  return `${chainId}:${tokenAddress.toLowerCase()}`;
}

/** The Trust Wallet icon URL for an asset, or null when the chain
 *  has no known folder. Native assets use info/logo.png; tokens use
 *  assets/<checksummed address>/logo.png. Solana mints are base58,
 *  not EVM addresses, and are used as-is. */
export function trustWalletIconUrl(
  chainId: number,
  tokenAddress: string,
  native: boolean,
): string | null {
  const folder = TRUSTWALLET_FOLDER[chainId];
  if (!folder) return null;
  if (native) return `${TRUSTWALLET_BASE}/${folder}/info/logo.png`;
  if (chainId === SOLANA_CHAIN_ID) {
    return `${TRUSTWALLET_BASE}/solana/assets/${tokenAddress}/logo.png`;
  }
  try {
    const checksummed = getAddress(tokenAddress as `0x${string}`);
    return `${TRUSTWALLET_BASE}/${folder}/assets/${checksummed}/logo.png`;
  } catch {
    return null;
  }
}

/** Candidate icon URLs for an asset, best first. Callers try them
 *  in order and fall through to the "?" slot when none loads. */
export function iconCandidates(
  chainId: number,
  tokenAddress: string,
  native: boolean,
): string[] {
  const url = trustWalletIconUrl(chainId, tokenAddress, native);
  return url ? [url] : [];
}

/** Is a candidate URL known-good (or untested)? A cached miss
 *  inside the TTL answers false without a network call. The cache
 *  is keyed by URL, so one bad candidate never poisons another. */
export async function iconUrlUsable(url: string): Promise<boolean> {
  const cache = await loadUrlCache();
  const hit = cache[url];
  if (hit && Date.now() - hit.checkedAt < CACHE_TTL_MS) return hit.ok;
  let ok = false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    ok = res.ok;
  } catch {
    ok = false;
  }
  cache[url] = { ok, checkedAt: Date.now() };
  await saveUrlCache();
  return ok;
}

// --- CoinGecko ---------------------------------------------------------

let lastCoinGeckoCallAt = 0;
let coinGeckoBackoffUntil = 0;
const coinGeckoInflight = new Map<
  string,
  Promise<{ status: 'found' | 'not-found' | 'skipped'; url: string | null }>
>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COINGECKO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return { __notFound: true };
    if (res.status === 429) return { __rateLimited: true };
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function coinGeckoImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const image = (data as { image?: { large?: unknown; small?: unknown } }).image;
  if (!image || typeof image !== 'object') return null;
  const large = image.large;
  if (typeof large === 'string' && large.startsWith('https://')) return large;
  const small = image.small;
  if (typeof small === 'string' && small.startsWith('https://')) return small;
  return null;
}

/**
 * The token's brand icon from its CoinGecko listing, or null.
 * Returns null without a network call when the chain has no
 * CoinGecko platform. A 404 means "not listed" and is a real miss;
 * a 429 or network error is treated as "try again later" by the
 * caller, not as a miss.
 */
async function coinGeckoIconUrl(
  chainId: number,
  tokenAddress: string,
  native: boolean,
): Promise<{ status: 'found' | 'not-found' | 'skipped'; url: string | null }> {
  if (Date.now() < coinGeckoBackoffUntil) return { status: 'skipped', url: null };
  const key = `${chainId}:${tokenAddress.toLowerCase()}:${native ? 'native' : 'token'}`;
  const existing = coinGeckoInflight.get(key);
  if (existing) return existing;
  const job = (async (): Promise<{
    status: 'found' | 'not-found' | 'skipped';
    url: string | null;
  }> => {
    const gap = COINGECKO_MIN_INTERVAL_MS - (Date.now() - lastCoinGeckoCallAt);
    if (gap > 0) await sleep(gap);
    lastCoinGeckoCallAt = Date.now();
    const params =
      'localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false';
    let endpoint: string | null = null;
    if (native) {
      const id = COINGECKO_NATIVE_ID[chainId];
      if (!id) return { status: 'not-found', url: null };
      endpoint = `${COINGECKO_BASE}/coins/${id}?${params}`;
    } else {
      const platform = COINGECKO_PLATFORM[chainId];
      if (!platform) return { status: 'not-found', url: null };
      endpoint = `${COINGECKO_BASE}/coins/${platform}/contract/${tokenAddress}?${params}`;
    }
    const data = await fetchJson(endpoint);
    if (data && typeof data === 'object' && '__rateLimited' in data) {
      coinGeckoBackoffUntil = Date.now() + 60_000;
      return { status: 'skipped', url: null };
    }
    if (data && typeof data === 'object' && '__notFound' in data) {
      return { status: 'not-found', url: null };
    }
    if (data === null) return { status: 'skipped', url: null };
    const url = coinGeckoImageUrl(data);
    return url ? { status: 'found', url } : { status: 'not-found', url: null };
  })();
  coinGeckoInflight.set(key, job);
  try {
    return await job;
  } finally {
    coinGeckoInflight.delete(key);
  }
}

// --- CoinMarketCap (via the backend) ---------------------------------

const BACKEND_ICON_TIMEOUT_MS = 8000;
const backendIconInflight = new Map<
  string,
  Promise<{ status: 'found' | 'not-found' | 'skipped'; url: string | null }>
>();

/**
 * The token's brand icon from CoinMarketCap, asked through the Prime
 * Way backend's GET /token-icon — the app never talks to
 * CoinMarketCap directly and holds no key for it. Returns null
 * without a network call when the address is not an EVM address
 * (the backend only takes 0x + 40 hex, so Solana mints skip this
 * step). A 200 with logoUrl null, or a 400, means "not listed" and
 * is a real miss; anything else — backend down, not configured yet,
 * 503, timeout, network error — is "skipped", so the caller tries
 * the next source and does not cache the miss.
 */
async function coinMarketCapIconUrl(
  chainId: number,
  tokenAddress: string,
  native: boolean,
  symbol?: string | null,
): Promise<{ status: 'found' | 'not-found' | 'skipped'; url: string | null }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
    return { status: 'not-found', url: null };
  }
  const key = `${chainId}:${tokenAddress.toLowerCase()}:${native ? 'native' : 'token'}:${symbol ?? ''}`;
  const existing = backendIconInflight.get(key);
  if (existing) return existing;
  const job = (async (): Promise<{
    status: 'found' | 'not-found' | 'skipped';
    url: string | null;
  }> => {
    const params = new URLSearchParams({
      chainId: String(chainId),
      address: tokenAddress,
      native: native ? '1' : '0',
    });
    if (native && symbol) params.set('symbol', symbol);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BACKEND_ICON_TIMEOUT_MS);
    try {
      const res = await fetch(`${BACKEND_URL}/token-icon?${params.toString()}`, {
        signal: controller.signal,
      });
      if (res.status === 400 || res.status === 404) {
        return { status: 'not-found', url: null };
      }
      if (!res.ok) return { status: 'skipped', url: null };
      const data = (await res.json()) as unknown;
      if (!data || typeof data !== 'object') return { status: 'skipped', url: null };
      const logoUrl = (data as { logoUrl?: unknown }).logoUrl;
      if (typeof logoUrl === 'string' && logoUrl.startsWith('https://')) {
        return { status: 'found', url: logoUrl };
      }
      return { status: 'not-found', url: null };
    } catch {
      return { status: 'skipped', url: null };
    } finally {
      clearTimeout(timer);
    }
  })();
  backendIconInflight.set(key, job);
  try {
    return await job;
  } finally {
    backendIconInflight.delete(key);
  }
}

// --- Resolution --------------------------------------------------------

// Note: iconUrlUsable used to take (url, chainId, tokenAddress);
// it now takes just the URL. The only caller was TokenIcon, which
// now uses resolveIconUrl below.
/**
 * Resolve the brand icon for a held token, best source first:
 * a supplied iconUrl (e.g. from Relay metadata), then the token's
 * CoinGecko listing, then CoinMarketCap via the backend, then Trust
 * Wallet. Returns the URL, or null when no source has one — the
 * caller shows "?" for that token. The outcome is cached for 24h,
 * including real misses. A rate-limited or failed CoinGecko or
 * CoinMarketCap/backend call is not cached as a miss, so the next
 * visit retries it — and a backend that is down or not configured
 * yet never blocks the token row, it just falls through.
 */
export async function resolveIconUrl(
  chainId: number,
  tokenAddress: string,
  native: boolean,
  iconUrl?: string | null,
  symbol?: string | null,
): Promise<string | null> {
  const cache = await loadResolvedCache();
  const key = iconCacheKey(chainId, tokenAddress);
  const hit = cache[key];
  if (hit && Date.now() - hit.checkedAt < CACHE_TTL_MS) return hit.url;

  const store = async (url: string | null, cacheable: boolean): Promise<string | null> => {
    if (!cacheable) return url;
    cache[key] = { url, checkedAt: Date.now() };
    await saveResolvedCache();
    return url;
  };

  const tried = new Set<string>();

  // 1. Supplied icon (e.g. Relay's logoURI).
  if (iconUrl) {
    tried.add(iconUrl);
    if (await iconUrlUsable(iconUrl)) return store(iconUrl, true);
  }

  // A source that was skipped (rate-limited, backend down, backend
  // not configured) means the final miss must not be cached, so the
  // next visit retries it.
  let retryLater = false;

  // 2. CoinGecko listing.
  const gecko = await coinGeckoIconUrl(chainId, tokenAddress, native);
  if (gecko.status === 'found' && gecko.url) {
    tried.add(gecko.url);
    if (await iconUrlUsable(gecko.url)) return store(gecko.url, true);
  } else if (gecko.status === 'skipped') {
    retryLater = true;
  }

  // 3. CoinMarketCap, via the backend. Fails soft by design.
  const cmc = await coinMarketCapIconUrl(chainId, tokenAddress, native, symbol);
  if (cmc.status === 'found' && cmc.url) {
    tried.add(cmc.url);
    if (await iconUrlUsable(cmc.url)) return store(cmc.url, true);
  } else if (cmc.status === 'skipped') {
    retryLater = true;
  }

  // 4. Trust Wallet assets repo.
  for (const url of iconCandidates(chainId, tokenAddress, native)) {
    if (tried.has(url)) continue;
    tried.add(url);
    if (await iconUrlUsable(url)) return store(url, true);
  }

  // 5. Nothing resolved: "?" this time. Cache the miss only when
  // every source gave a real answer; a skipped source retries later.
  return store(null, !retryLater);
}
