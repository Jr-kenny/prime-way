// Prime Way backend: Relay quote service.
//
// Small Node service using only Node built-ins (no npm install needed).
// POST /quote takes a send request from the Prime Way app, asks Relay for
// a cross-chain quote and returns a small clean JSON; GET /status?requestId=...
// asks Relay how far a quoted send has got (waiting, pending, success,
// refund) so the app can show it landing. GET /chains returns Relay's
// chain list (cached 1 hour, no API key needed) and
// GET /currencies?chainId=... returns that chain's currencies (cached
// 1 hour per chain) for token discovery.
//
// The Relay API key is read from the RELAY_API_KEY environment variable at
// runtime. It never lives in this repo, in code, or in logs.

const http = require("node:http");

// Relay base URL. RELAY_API_BASE exists only so tests can point the
// service at a local mock Relay; in production it stays unset and the
// default below is used. It never carries a key.
const RELAY_API_BASE = (process.env.RELAY_API_BASE || "https://api.relay.link").replace(
  /\/+$/,
  ""
);
const RELAY_URL = `${RELAY_API_BASE}/quote/v2`;
const RELAY_STATUS_URL = `${RELAY_API_BASE}/intents/status/v3`;
const RELAY_CHAINS_URL = `${RELAY_API_BASE}/chains`;
const RELAY_CURRENCIES_URL = `${RELAY_API_BASE}/currencies/v2`;
const PORT = Number(process.env.PORT || 3000);
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
  return {
    address: currency.address,
    symbol: currency.symbol,
    decimals: currency.decimals,
    name: typeof currency.name === "string" ? currency.name : "",
  };
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
  sumFeesUsd,
  shapeChain,
  shapeCurrency,
  parseChainIdParam,
  shouldTopUpGas,
  CACHE_TTL_MS,
};
