// Prime Way backend: Relay quote service + Prime Way Web host.
//
// Small Node service using only Node built-ins (no npm install needed).
// POST /quote takes a send request from the Prime Way app, asks Relay for
// a cross-chain quote and returns a small clean JSON; GET /status?requestId=...
// asks Relay how far a quoted send has got (waiting, pending, success,
// refund) so the app can show it landing. GET /chains returns Relay's
// chain list (cached 1 hour, no API key needed) and
// GET /currencies?chainId=... returns that chain's currencies (cached
// 1 hour per chain) for token discovery. GET /token-icon?chainId=...
// &address=...&native=0|1 returns a token's brand icon from
// CoinMarketCap (cached 24 hours, misses included), so the app can
// show a real icon for tokens no earlier source resolves.
//
// The same service also serves the Prime Way Web bridge UI (the built
// frontend in ../web/dist) at / /bridge /activity, and
// GET /requests?user=... proxies Relay's /requests/v3 so the web UI
// can show real history. Web quotes carry referrer "prime-way-web"
// only when the caller marks source: "web" in its /quote body; the
// mobile app sends no source, so its quotes carry no referrer and
// stay exactly as before. /quote also returns a fee breakdown.
//
// The Relay API key is read from the RELAY_API_KEY environment variable at
// runtime. It never lives in this repo, in code, or in logs. The
// CoinMarketCap key is likewise read from CMC_API_KEY at runtime, is
// optional (the service starts and quotes fine without it), and is
// never sent to the app: only the backend calls CoinMarketCap, and the
// app only ever asks this backend for a logo URL.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// Relay base URL. RELAY_API_BASE exists only so tests can point the
// service at a local mock Relay; in production it stays unset and the
// default below is used. It never carries a key.
const RELAY_API_BASE = (process.env.RELAY_API_BASE || "https://api.relay.link").replace(
  /\/+$/,
  ""
);
const RELAY_URL = `${RELAY_API_BASE}/quote/v2`;
const RELAY_STATUS_URL = `${RELAY_API_BASE}/intents/status/v3`;
const RELAY_REQUESTS_URL = `${RELAY_API_BASE}/requests/v3`;
const RELAY_CHAINS_URL = `${RELAY_API_BASE}/chains`;
const RELAY_CURRENCIES_URL = `${RELAY_API_BASE}/currencies/v2`;
// CoinMarketCap base URL. CMC_API_BASE exists only so tests can point
// the service at a local mock CoinMarketCap; in production it stays
// unset and the default below is used. It never carries a key.
const CMC_API_BASE = (process.env.CMC_API_BASE || "https://pro-api.coinmarketcap.com").replace(
  /\/+$/,
  ""
);
const CMC_INFO_URL = `${CMC_API_BASE}/v2/cryptocurrency/info`;
const PORT = Number(process.env.PORT || 3000);
// Referrer tag for web quotes only: the web client sends
// source: "web" in its /quote body; the mobile app sends no source,
// so its quotes carry no referrer and stay exactly as before.
// Attribution itself comes from the x-api-key header either way.
const REFERRER = "prime-way-web";
// Built web frontend, served at / /bridge /activity when present
// (built by the Render build step from ../web). Absent locally until
// the frontend is built; the API works without it.
const DIST_DIR = path.join(__dirname, "..", "web", "dist");
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const REQUEST_ID_RE = /^0x[0-9a-fA-F]{64}$/;
// The EVM native-currency sentinel: every EVM chain Relay lists uses the
// zero address for its native currency (verified live 2026-11-08, 48/48
// EVM chains). Non-EVM chains use their own address formats instead.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// List caches: Relay's chain and currency lists change rarely, so each is
// cached in memory for one hour (per chain for currencies). A failed
// refresh keeps serving the previous (stale) list rather than failing
// reads; only a service with no list at all answers 502.
const CACHE_TTL_MS = 60 * 60 * 1000;

// Fee lines summed into feesUsd. Relay's `relayer` line already contains
// `relayerGas` + `relayerService`, so neither is added again.
const FEE_LINES = ["gas", "relayer", "app", "subsidized"];

function sumFeesUsd(fees) {
  let total = 0;
  for (const line of FEE_LINES) {
    const entry = fees && fees[line];
    if (entry && entry.amountUsd !== undefined) {
      // A non-numeric fee line (e.g. "oops") must be skipped, never
      // allowed to poison the total: Number("oops") is NaN, and NaN
      // would turn feesUsd into null in JSON, which the app then
      // reads as "no fee". A missing line still counts as zero.
      const n = Number(entry.amountUsd);
      if (Number.isFinite(n)) total += n;
    }
  }
  return Math.round(total * 1e6) / 1e6;
}

const FEE_LABELS = {
  app: "App",
  gas: "Gas",
  relayer: "Relayer",
  subsidized: "Subsidized",
};

// Relay's `relayer` line already contains relayerGas + relayerService,
// so the breakdown lists gas / relayer / app / subsidized only.
function feeBreakdown(fees) {
  const out = [];
  for (const line of FEE_LINES) {
    const entry = fees && fees[line];
    if (!entry || entry.amountUsd === undefined) continue;
    const n = Number(entry.amountUsd);
    if (!Number.isFinite(n)) continue;
    out.push({
      amountUsd: Math.round(n * 1e6) / 1e6,
      label: FEE_LABELS[line] || line,
      symbol:
        entry.currency && typeof entry.currency.symbol === "string"
          ? entry.currency.symbol
          : undefined,
    });
  }
  return out;
}

function validateQuoteInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "request body must be a JSON object";
  }
  for (const field of ["user", "recipient", "originCurrency", "destinationCurrency"]) {
    if (typeof body[field] !== "string" || !ADDRESS_RE.test(body[field])) {
      return `${field} must be an address like 0x followed by 40 hex characters`;
    }
  }
  // The zero address is never a recipient: money sent there is
  // unrecoverable. (It stays valid for originCurrency and
  // destinationCurrency, where it is the native-currency sentinel.)
  if (body.recipient.toLowerCase() === ZERO_ADDRESS) {
    return "recipient must not be the zero address";
  }
  for (const field of ["originChainId", "destinationChainId"]) {
    if (!Number.isInteger(body[field]) || body[field] <= 0) {
      return `${field} must be a positive integer chain id`;
    }
  }
  if (typeof body.amount !== "string" || !/^[0-9]+$/.test(body.amount)) {
    return "amount must be a positive integer string in the token's smallest units";
  }
  if (BigInt(body.amount) <= 0n) {
    return "amount must be greater than zero";
  }
  if (body.topupGas !== undefined && typeof body.topupGas !== "boolean") {
    return "topupGas must be a boolean when present";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Chains and currencies (GET /chains, GET /currencies)
// ---------------------------------------------------------------------------

// Shape one Relay chain into the clean form the app uses, or null when the
// entry is missing a field the app needs (a malformed entry is skipped,
// never trusted blindly and never allowed to break the whole list).
// Relay includes an HTTP RPC URL per chain (httpRpcUrl, present on all 57
// chains live 2026-11-08); it is returned as rpcUrl when non-empty.
// vmType is what identifies a chain as EVM ("evm") or not ("svm", "bvm",
// "tvm", "lvm", "hypevm", "xrpvm", "tonvm"); there is no separate flag.
function shapeChain(chain) {
  if (!chain || typeof chain !== "object" || Array.isArray(chain)) return null;
  if (!Number.isInteger(chain.id) || chain.id <= 0) return null;
  if (typeof chain.name !== "string" || !chain.name) return null;
  const currency = chain.currency;
  if (!currency || typeof currency !== "object") return null;
  if (typeof currency.symbol !== "string" || !currency.symbol) return null;
  if (!Number.isInteger(currency.decimals) || currency.decimals < 0) return null;
  const shaped = {
    id: chain.id,
    name: chain.name,
    displayName:
      typeof chain.displayName === "string" && chain.displayName
        ? chain.displayName
        : chain.name,
    nativeCurrency: { symbol: currency.symbol, decimals: currency.decimals },
    evm: chain.vmType === "evm",
    disabled: chain.disabled === true,
  };
  if (typeof chain.explorerUrl === "string" && chain.explorerUrl) {
    shaped.explorerUrl = chain.explorerUrl;
  }
  if (typeof chain.iconUrl === "string" && chain.iconUrl) {
    shaped.iconUrl = chain.iconUrl;
  }
  if (typeof chain.httpRpcUrl === "string" && chain.httpRpcUrl) {
    shaped.rpcUrl = chain.httpRpcUrl;
  }
  return shaped;
}

// Shape one Relay currency into the clean form token discovery uses, or
// null when a required field is missing. Addresses are NOT checked
// against the 0x+40-hex pattern here: non-EVM currencies use their own
// formats (Solana base58, Tron base58, Bitcoin bech32, ...).
function shapeCurrency(currency) {
  if (!currency || typeof currency !== "object" || Array.isArray(currency)) {
    return null;
  }
  if (typeof currency.address !== "string" || !currency.address) return null;
  if (typeof currency.symbol !== "string" || !currency.symbol) return null;
  if (!Number.isInteger(currency.decimals) || currency.decimals < 0) {
    return null;
  }
  const shaped = {
    address: currency.address,
    symbol: currency.symbol,
    decimals: currency.decimals,
    name: typeof currency.name === "string" ? currency.name : "",
  };
  // Relay's metadata carries the token's own brand icon as logoURI
  // (verified live shape, see CHAINS.md). Pass it through as iconUrl
  // so the app can use it as the supplied icon for that token. Only
  // a plain http(s) URL is passed on; anything else (ipfs://, an
  // empty string, a non-string) is dropped, and the app falls through
  // to its other icon sources.
  const metadata = currency.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const logoURI = metadata.logoURI;
    if (typeof logoURI === "string" && /^https?:\/\//.test(logoURI)) {
      shaped.iconUrl = logoURI;
    }
  }
  return shaped;
}

const chainsCache = { data: null, fetchedAt: 0, inflight: null };
const currenciesCache = new Map(); // chainId -> { data, fetchedAt, inflight }

function cacheIsFresh(entry) {
  return entry.data !== null && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function fetchChainsFromRelay() {
  const res = await fetch(RELAY_CHAINS_URL);
  if (!res.ok) return null;
  let relay;
  try {
    relay = await res.json();
  } catch {
    return null;
  }
  if (!relay || !Array.isArray(relay.chains)) return null;
  const chains = [];
  const rawById = new Map();
  for (const chain of relay.chains) {
    const shaped = shapeChain(chain);
    if (shaped) {
      chains.push(shaped);
      rawById.set(chain.id, chain);
    }
  }
  if (chains.length === 0) return null;
  return { chains, rawById };
}

// Returns { chains, rawById } or null when Relay cannot be reached and no
// list has ever been fetched. Concurrent callers share one in-flight
// fetch instead of each hitting Relay (no stampede on a cold cache).
async function getChains() {
  if (cacheIsFresh(chainsCache)) return chainsCache.data;
  if (chainsCache.inflight) return chainsCache.inflight;
  chainsCache.inflight = (async () => {
    try {
      const fresh = await fetchChainsFromRelay();
      if (fresh) {
        chainsCache.data = fresh;
        chainsCache.fetchedAt = Date.now();
      }
    } catch {
      // Network failure: fall through to the stale list below, if any.
    } finally {
      chainsCache.inflight = null;
    }
    return chainsCache.data;
  })();
  return chainsCache.inflight;
}

// Relay's currencies endpoint is POST /currencies/v2 (GET /currencies/v2
// does not exist: it answers 404). It takes { chainIds: [id], limit } and
// returns a flat Currency[] ranked verified-first. limit defaults to 20
// and caps at 100, so 100 is requested: token discovery wants the fullest
// list Relay will give. The x-api-key header is optional here (verified
// live 2026-11-08: the call succeeds with no key and with a dummy key),
// but the backend sends its key when it has one, in case Relay tightens
// that later. Relay returns [] for an unknown chain id (HTTP 200).
async function fetchCurrenciesFromRelay(chainId) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.RELAY_API_KEY) headers["x-api-key"] = process.env.RELAY_API_KEY;
  const res = await fetch(RELAY_CURRENCIES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ chainIds: [chainId], limit: 100 }),
  });
  if (!res.ok) return null;
  let relay;
  try {
    relay = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(relay)) return null;
  const seen = new Set();
  const currencies = [];
  for (const currency of relay) {
    const shaped = shapeCurrency(currency);
    // Relay's list can contain the same address twice (seen live on Base:
    // HOTMOM and RDAC each appear twice in the top 100), so dedupe.
    if (shaped && !seen.has(shaped.address)) {
      seen.add(shaped.address);
      currencies.push(shaped);
    }
  }
  return currencies;
}

async function getCurrencies(chainId) {
  let entry = currenciesCache.get(chainId);
  if (!entry) {
    entry = { data: null, fetchedAt: 0, inflight: null };
    currenciesCache.set(chainId, entry);
  }
  if (cacheIsFresh(entry)) return entry.data;
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    try {
      const fresh = await fetchCurrenciesFromRelay(chainId);
      if (fresh !== null) {
        entry.data = fresh;
        entry.fetchedAt = Date.now();
      }
    } catch {
      // Network failure: fall through to the stale list below, if any.
    } finally {
      entry.inflight = null;
    }
    return entry.data;
  })();
  return entry.inflight;
}

// Parse a chainId query value: plain positive decimal integer only.
// "8453.0", "0x2105", "+8453", " 8453" and "" are all rejected.
function parseChainIdParam(raw) {
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

async function handleChains(req, res) {
  const data = await getChains();
  if (!data) {
    sendJson(res, 502, { error: "could not reach Relay" });
    return;
  }
  sendJson(res, 200, { chains: data.chains });
}

async function handleCurrencies(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/currencies") {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const chainId = parseChainIdParam(url.searchParams.get("chainId"));
  if (chainId === null) {
    sendJson(res, 400, { error: "chainId must be a positive integer chain id" });
    return;
  }
  const currencies = await getCurrencies(chainId);
  if (currencies === null) {
    sendJson(res, 502, { error: "could not reach Relay" });
    return;
  }
  sendJson(res, 200, { chainId, currencies });
}

// ---------------------------------------------------------------------------
// Token icons from CoinMarketCap (GET /token-icon)
// ---------------------------------------------------------------------------

// CoinMarketCap's free Basic plan allows 50 requests/minute, so calls
// are spaced at least 1.2s apart. Results are cached in memory for
// 24 hours, misses included, so a token CoinMarketCap does not know is
// not re-asked on every Home visit. A 429 or 5xx (or a network failure)
// is NEVER cached as a miss — the next visit retries — and a 429 also
// backs the caller off for 60 seconds. The key is read from the
// CMC_API_KEY environment variable at call time and is never logged
// or returned; when it is unset the endpoint answers 503 and the app
// falls through to its other icon sources.
const CMC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CMC_MIN_INTERVAL_MS = 1200;
const CMC_TIMEOUT_MS = 8000;
// Backoff after a 429. CMC_BACKOFF_MS exists only so tests can retry
// quickly; in production it stays unset and the default 60s applies.
const CMC_BACKOFF_MS = (() => {
  const n = Number(process.env.CMC_BACKOFF_MS);
  return Number.isFinite(n) && n > 0 ? n : 60 * 1000;
})();
const CMC_LOGO_RE = /^https:\/\/s2\.coinmarketcap\.com\/static\/img\/coins\/\d+x\d+\/[0-9]+\.png$/;
const cmcCache = new Map(); // key -> { logoUrl, cmcId, fetchedAt }
const cmcInflight = new Map(); // key -> Promise<result>
let lastCmcCallAt = 0;
let cmcBackoffUntil = 0;

/** CoinMarketCap platform slug per chain id, used only to pick the
 *  right entry when one contract address maps to several listings. */
const CMC_PLATFORM_SLUG = {
  1: "ethereum",
  10: "optimism",
  56: "bnb",
  137: "polygon",
  42161: "arbitrum",
  8453: "base",
  43114: "avalanche",
  792703809: "solana",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Parse the native flag: "0"/"1" only, default false. Anything else
// (including "true") is rejected so a bad caller cannot silently get
// the wrong lookup.
function parseNativeParam(raw) {
  if (raw === null) return false;
  if (raw === "0") return false;
  if (raw === "1") return true;
  return null;
}

// A token symbol for the native lookup: short, plain letters/digits.
function parseSymbolParam(raw) {
  if (raw === null) return null;
  if (typeof raw !== "string" || !/^[A-Za-z0-9]{1,12}$/.test(raw)) return undefined;
  return raw.toUpperCase();
}

// Pick the logo URL out of a CoinMarketCap /v2/cryptocurrency/info
// `data` object (keyed by CoinMarketCap id). The response carries one
// entry per listing, each with a `logo` like
// https://s2.coinmarketcap.com/static/img/coins/64x64/{id}.png and,
// for tokens, a `platform` with the contract address it was found
// under. When several entries come back, the one whose platform
// contract address matches the requested address wins; among those,
// the one whose platform slug matches the chain wins; otherwise the
// first entry with a usable logo wins. Only a CoinMarketCap static
// logo URL is ever returned — anything else is treated as no logo.
// Returns { logoUrl, cmcId } with logoUrl null when nothing matches.
function extractCmcLogo(data, address, chainId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { logoUrl: null, cmcId: null };
  }
  const entries = Object.values(data).filter(
    (e) => e && typeof e === "object" && !Array.isArray(e)
  );
  const withLogo = entries.filter(
    (e) => typeof e.logo === "string" && CMC_LOGO_RE.test(e.logo)
  );
  if (withLogo.length === 0) return { logoUrl: null, cmcId: null };
  const wanted = typeof address === "string" ? address.toLowerCase() : "";
  const addressMatch = withLogo.filter((e) => {
    const platform = e.platform;
    return (
      platform &&
      typeof platform === "object" &&
      typeof platform.token_address === "string" &&
      platform.token_address.toLowerCase() === wanted
    );
  });
  const pool = addressMatch.length > 0 ? addressMatch : withLogo;
  const slug = CMC_PLATFORM_SLUG[chainId];
  const chainMatch = slug
    ? pool.filter((e) => {
        const platform = e.platform;
        return (
          platform &&
          typeof platform === "object" &&
          typeof platform.slug === "string" &&
          platform.slug.toLowerCase() === slug
        );
      })
    : [];
  const picked = chainMatch.length > 0 ? chainMatch[0] : pool[0];
  // Live 2026-11-12: an address lookup for USDC on Ethereum
  // returned the USDC asset (id 3408, correct logo) but with the
  // platform of a different deployment (ZKsync), so the
  // address/chain match above is only a preference — the first
  // entry with a logo is what actually answers, and that logo is
  // still the token's own brand icon.
  return {
    logoUrl: picked.logo,
    cmcId: Number.isInteger(picked.id) ? picked.id : null,
  };
}

// One CoinMarketCap info lookup, with spacing, backoff and the cache
// above. `query` is the already-encoded query string (address=... or
// symbol=...). Returns { status, logoUrl, cmcId } where status is
// "found", "not-found" or "unavailable". Only "found" and "not-found"
// are cached; "unavailable" (429, 5xx, bad key, network failure,
// timeout) is never cached, so the next call retries.
async function fetchCmcInfo(query, cacheKey, address, chainId) {
  const cached = cmcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CMC_CACHE_TTL_MS) {
    return { status: cached.logoUrl ? "found" : "not-found", logoUrl: cached.logoUrl, cmcId: cached.cmcId };
  }
  const existing = cmcInflight.get(cacheKey);
  if (existing) return existing;
  const job = (async () => {
    if (Date.now() < cmcBackoffUntil) {
      return { status: "unavailable", logoUrl: null, cmcId: null };
    }
    const gap = CMC_MIN_INTERVAL_MS - (Date.now() - lastCmcCallAt);
    if (gap > 0) await sleep(gap);
    lastCmcCallAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CMC_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${CMC_INFO_URL}?${query}`, {
        headers: {
          "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch {
      return { status: "unavailable", logoUrl: null, cmcId: null };
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      cmcBackoffUntil = Date.now() + CMC_BACKOFF_MS;
      return { status: "unavailable", logoUrl: null, cmcId: null };
    }
    if (res.status === 401 || res.status === 403 || res.status >= 500) {
      // A bad key or a CoinMarketCap outage: not a miss, retry later.
      // The status is logged without the key, which is never logged.
      console.error(`CoinMarketCap info request failed with status ${res.status}`);
      return { status: "unavailable", logoUrl: null, cmcId: null };
    }
    if (res.status === 400 || res.status === 404) {
      // CoinMarketCap does not know this address/symbol: a real miss.
      // Live 2026-11-12 this also happens for addresses its index
      // does not cover (USDC on Base 400s while USDC on Ethereum
      // answers), so a 400 is a miss, never an error to the caller —
      // the app falls through to Trust Wallet / CoinGecko.
      const result = { status: "not-found", logoUrl: null, cmcId: null };
      cmcCache.set(cacheKey, { logoUrl: null, cmcId: null, fetchedAt: Date.now() });
      return result;
    }
    if (!res.ok) {
      return { status: "unavailable", logoUrl: null, cmcId: null };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return { status: "unavailable", logoUrl: null, cmcId: null };
    }
    const extracted = extractCmcLogo(body && body.data, address, chainId);
    const result = extracted.logoUrl
      ? { status: "found", logoUrl: extracted.logoUrl, cmcId: extracted.cmcId }
      : { status: "not-found", logoUrl: null, cmcId: null };
    cmcCache.set(cacheKey, { logoUrl: result.logoUrl, cmcId: result.cmcId, fetchedAt: Date.now() });
    return result;
  })();
  cmcInflight.set(cacheKey, job);
  try {
    return await job;
  } finally {
    cmcInflight.delete(cacheKey);
  }
}

async function handleTokenIcon(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/token-icon") {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const chainId = parseChainIdParam(url.searchParams.get("chainId"));
  if (chainId === null) {
    sendJson(res, 400, { error: "chainId must be a positive integer chain id" });
    return;
  }
  const address = url.searchParams.get("address") || "";
  if (!ADDRESS_RE.test(address)) {
    sendJson(res, 400, { error: "address must be 0x followed by 40 hex characters" });
    return;
  }
  const native = parseNativeParam(url.searchParams.get("native"));
  if (native === null) {
    sendJson(res, 400, { error: "native must be 0 or 1 when present" });
    return;
  }
  const symbol = parseSymbolParam(url.searchParams.get("symbol"));
  if (symbol === undefined) {
    sendJson(res, 400, { error: "symbol must be 1-12 letters or digits when present" });
    return;
  }
  if (native && address.toLowerCase() !== ZERO_ADDRESS) {
    sendJson(res, 400, { error: "native must be 1 only for the zero address" });
    return;
  }
  // A native currency has no contract address for CoinMarketCap to
  // look up by address, so without a symbol there is nothing to ask
  // it for — answer null without spending a call. The app's other
  // sources (Trust Wallet, CoinGecko) already cover natives.
  if (native && !symbol) {
    sendJson(res, 200, { logoUrl: null, cmcId: null });
    return;
  }
  if (!process.env.CMC_API_KEY) {
    sendJson(res, 503, {
      error: "coinmarketcap not configured",
      logoUrl: null,
    });
    return;
  }
  const query = native
    ? `symbol=${encodeURIComponent(symbol)}`
    // CoinMarketCap's address lookup only accepts a lower-case
    // address: a checksummed (mixed-case) address answers 400
    // "Invalid value for 'slug': 'null'" (verified live 2026-11-12
    // for USDC on Ethereum), so the address is lower-cased here.
    : `address=${encodeURIComponent(address.toLowerCase())}`;
  const cacheKey = native
    ? `native:${chainId}:${symbol}`
    : `${chainId}:${address.toLowerCase()}`;
  const result = await fetchCmcInfo(query, cacheKey, address, chainId);
  if (result.status === "unavailable") {
    sendJson(res, 503, { error: "coinmarketcap unavailable", logoUrl: null });
    return;
  }
  sendJson(res, 200, { logoUrl: result.logoUrl, cmcId: result.cmcId });
}

// Gas top-up gate (Relay docs: https://docs.relay.link/features/gas-top-up).
// The flag may only go to Relay when ALL of these hold:
//   - the caller asked for it (topupGas === true), and
//   - both the origin and destination chains are EVM (vmType "evm"), and
//   - the origin currency is not the origin chain's native token.
// Anything else fails closed: the flag is left out and the quote proceeds
// as a normal quote (Relay would enforce the same rules, but a rejected
// flag must never turn into a rejected quote, and a Solana route must
// never receive the flag). When the chain list cannot be fetched at all,
// the route cannot be proven EVM-to-EVM, so the flag is also left out.
function shouldTopUpGas(body, chainsData) {
  if (body.topupGas !== true) return false;
  if (!chainsData) return false;
  const origin = chainsData.rawById.get(body.originChainId);
  const destination = chainsData.rawById.get(body.destinationChainId);
  if (!origin || !destination) return false;
  if (origin.vmType !== "evm" || destination.vmType !== "evm") return false;
  const originCurrency = String(body.originCurrency).toLowerCase();
  const nativeAddress =
    origin.currency && typeof origin.currency.address === "string"
      ? origin.currency.address.toLowerCase()
      : "";
  if (nativeAddress && originCurrency === nativeAddress) return false;
  if (originCurrency === ZERO_ADDRESS) return false;
  return true;
}

function shapeQuote(relay, body) {
  const out = relay.details && relay.details.currencyOut;
  const currency = out && out.currency;
  return {
    requestId: relay.requestId,
    outputAmount: out ? out.amount : null,
    outputAmountFormatted: out ? out.amountFormatted : null,
    outputCurrency: (currency && currency.symbol) || body.destinationCurrency,
    feesUsd: sumFeesUsd(relay.fees),
    // Fee breakdown (gas / relayer / app / subsidized), for the web
    // UI's quote panel. Additive only: the existing fields above are
    // unchanged, so the mobile app reads exactly what it always did.
    fees: feeBreakdown(relay.fees),
    // Each step carries the transaction the wallet must send (to, data,
    // value, chainId), taken from the step's first item. The Prime Way
    // app sends exactly what the quote describes, one step at a time.
    // A step with no transaction data gets tx: null, and the app keeps
    // its Send button off for that quote.
    steps: (relay.steps || []).map((step) => {
      const item = step.items && step.items[0];
      const d = item && item.data;
      return {
        id: step.id,
        action: step.action,
        description: step.description,
        tx:
          d && d.to && d.data
            ? {
                to: d.to,
                data: d.data,
                value: String(d.value ?? "0"),
                chainId: Number(d.chainId),
              }
            : null,
      };
    }),
    timeEstimate: relay.details ? relay.details.timeEstimate : null,
  };
}

function sendJson(res, status, obj) {
  const data = JSON.stringify(obj);
  // The Prime Way app calls this service from the browser, from another
  // origin, so every response allows cross-origin reads. The service takes
  // no cookies or credentials, so "*" is safe here.
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleQuote(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "request body must be valid JSON" });
    return;
  }

  const problem = validateQuoteInput(body);
  if (problem) {
    sendJson(res, 400, { error: problem });
    return;
  }

  // Gas top-up is only ever sent when the gate above allows it. The chain
  // list is only fetched when the caller actually asked for a top-up, so a
  // normal quote never pays that cost or inherits its failure mode.
  let topUpGas = false;
  if (body.topupGas === true) {
    const chainsData = await getChains();
    topUpGas = shouldTopUpGas(body, chainsData);
  }

  let relayRes;
  try {
    relayRes = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.RELAY_API_KEY,
      },
      body: JSON.stringify({
        user: body.user,
        recipient: body.recipient,
        originChainId: body.originChainId,
        destinationChainId: body.destinationChainId,
        originCurrency: body.originCurrency,
        destinationCurrency: body.destinationCurrency,
        amount: body.amount,
        tradeType: "EXACT_INPUT",
        // Referrer only for web quotes (the web client sends
        // source: "web"); the mobile app sends no source, so its
        // quotes go to Relay exactly as they always have.
        ...(body.source === "web" ? { referrer: REFERRER } : {}),
        ...(topUpGas ? { topupGas: true } : {}),
      }),
    });
  } catch {
    sendJson(res, 502, { error: "could not reach Relay" });
    return;
  }

  if (!relayRes.ok) {
    sendJson(res, 502, { error: "Relay quote failed", relayStatus: relayRes.status });
    return;
  }

  const relay = await relayRes.json();
  sendJson(res, 200, shapeQuote(relay, body));
}

// Relay's status shape was verified live 2026-11-08 for a quote that was
// never executed: {"status": "waiting", "quoteCreatedAt": ...}. The tx-hash
// fields below are collected defensively; only "waiting" has been seen
// live, so a finished send may carry hashes in places this does not know
// yet. Statuses: waiting, depositing, pending, success, refund are final;
// failure is not final, the fill can still retry or move to refund.
function shapeStatus(relay, requestId) {
  const hashes = [];
  const collect = (v) => {
    if (typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)) hashes.push(v);
    if (Array.isArray(v)) v.forEach(collect);
  };
  collect(relay.txHashes);
  if (relay.details) {
    collect(relay.details.txHashes);
    collect(relay.details.destinationTxHash);
    collect(relay.details.destinationTxHashes);
    collect(relay.details.inTxHashes);
    collect(relay.details.outTxHashes);
  }
  return { requestId, status: relay.status || null, txHashes: [...new Set(hashes)] };
}

async function handleStatus(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requestId = url.searchParams.get("requestId") || "";
  if (!REQUEST_ID_RE.test(requestId)) {
    sendJson(res, 400, { error: "requestId must be 0x followed by 64 hex characters" });
    return;
  }

  let relayRes;
  try {
    relayRes = await fetch(
      `${RELAY_STATUS_URL}?requestId=${encodeURIComponent(requestId)}`,
      { headers: { "x-api-key": process.env.RELAY_API_KEY } }
    );
  } catch {
    sendJson(res, 502, { error: "could not reach Relay" });
    return;
  }

  if (!relayRes.ok) {
    sendJson(res, 502, { error: "Relay status failed", relayStatus: relayRes.status });
    return;
  }

  const relay = await relayRes.json();
  sendJson(res, 200, shapeStatus(relay, requestId));
}

// ---------------------------------------------------------------------------
// Relay request history (GET /requests) + static web UI
// ---------------------------------------------------------------------------

// Map one Relay /requests/v3 row to the app's history shape. The API
// nests most fields under `data` and names the id differently across
// versions, so every field is read defensively; a row without a
// requestId is dropped, never guessed.
function shapeRequest(row) {
  if (!row || typeof row !== "object") return null;
  const data = row.data && typeof row.data === "object" ? row.data : {};
  const pick = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null) return row[k];
      if (data[k] !== undefined && data[k] !== null) return data[k];
    }
    return null;
  };
  const requestId = pick("requestId", "id");
  if (typeof requestId !== "string" || !REQUEST_ID_RE.test(requestId)) {
    return null;
  }
  const txHashes = [];
  const collect = (v) => {
    if (typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)) txHashes.push(v);
    if (Array.isArray(v)) v.forEach(collect);
  };
  collect(pick("txHashes"));
  collect(data.txHashes);
  collect(data.outTxs);
  collect(data.inTxs);
  const entry = {
    requestId,
    status: pick("status") || "pending",
    user: pick("user") || "",
    recipient: pick("recipient") || "",
    originChainId: Number(pick("originChainId")) || 0,
    destinationChainId: Number(pick("destinationChainId")) || 0,
    originSymbol: pick("originCurrencySymbol", "originSymbol") || "",
    destinationSymbol: pick("destinationCurrencySymbol", "destinationSymbol") || "",
    amountIn: pick("amountInFormatted", "amountIn") || "",
    amountOut: pick("amountOutFormatted", "amountOut") || null,
    createdAt: pick("createdAt") || new Date().toISOString(),
    txHashes: [...new Set(txHashes)],
    source: "relay",
  };
  if (typeof entry.amountIn !== "string") entry.amountIn = String(entry.amountIn);
  if (entry.amountOut !== null && typeof entry.amountOut !== "string") {
    entry.amountOut = String(entry.amountOut);
  }
  return entry;
}

async function handleRequests(req, res) {
  const url = new URL(req.url, "http://localhost");
  const user = (url.searchParams.get("user") || "").toLowerCase();
  if (!ADDRESS_RE.test(user)) {
    sendJson(res, 400, { error: "user must be a wallet address" });
    return;
  }
  const limitRaw = Number(url.searchParams.get("limit") || 25);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;
  let relayRes;
  try {
    relayRes = await fetch(
      `${RELAY_REQUESTS_URL}?limit=${limit}&includePendingRequests=true&includeAuthenticatedData=true`,
      { headers: { "x-api-key": process.env.RELAY_API_KEY } },
    );
  } catch {
    sendJson(res, 502, { error: "could not reach Relay" });
    return;
  }
  if (!relayRes.ok) {
    sendJson(res, 502, { error: "Relay history failed", relayStatus: relayRes.status });
    return;
  }
  let relay;
  try {
    relay = await relayRes.json();
  } catch {
    sendJson(res, 502, { error: "Relay history failed" });
    return;
  }
  const rows = Array.isArray(relay)
    ? relay
    : Array.isArray(relay.requests)
      ? relay.requests
      : [];
  const entries = [];
  for (const row of rows) {
    const shaped = shapeRequest(row);
    if (!shaped) continue;
    if (
      shaped.user.toLowerCase() !== user &&
      shaped.recipient.toLowerCase() !== user
    ) {
      continue;
    }
    entries.push(shaped);
  }
  sendJson(res, 200, { entries: entries.slice(0, limit) });
}

const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "/bridge" || pathname === "/activity") {
    pathname = "/index.html";
  }
  const file = path.join(DIST_DIR, pathname);
  if (!file.startsWith(DIST_DIR)) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    // Browser preflight for cross-origin POST /quote.
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && req.url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && req.url === "/chains") {
      handleChains(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/currencies")) {
      handleCurrencies(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/token-icon")) {
      handleTokenIcon(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      });
      return;
    }
    if (req.method === "POST" && req.url === "/quote") {
      handleQuote(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/status")) {
      handleStatus(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/requests")) {
      handleRequests(req, res).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      });
      return;
    }
    if (req.method === "GET" && fs.existsSync(DIST_DIR)) {
      handleStatic(req, res);
      return;
    }
    sendJson(res, 404, { error: "not found" });
  });
}

function main() {
  if (!process.env.RELAY_API_KEY) {
    console.error(
      "Prime Way quote service cannot start: RELAY_API_KEY is not set. " +
        "Set RELAY_API_KEY to your Relay API key and start the service again. " +
        "The key never belongs in this repo."
    );
    process.exit(1);
  }
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Prime Way quote service listening on port ${PORT}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  createServer,
  validateQuoteInput,
  shapeQuote,
  shapeStatus,
  shapeRequest,
  sumFeesUsd,
  feeBreakdown,
  shapeChain,
  shapeCurrency,
  parseChainIdParam,
  parseNativeParam,
  extractCmcLogo,
  shouldTopUpGas,
  CACHE_TTL_MS,
  CMC_CACHE_TTL_MS,
};
