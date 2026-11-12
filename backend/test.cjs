// Self-test for the Prime Way quote service.
//
// Run: node backend/test.cjs
// The Relay response below is a real sample returned live by
// POST /quote/v2 for 1 USDC on Base -> USDC on Arbitrum (verified
// 2026-11-08). No numbers are invented. The test never calls the real
// Relay: a local mock Relay stands in for api.relay.link (via the
// RELAY_API_BASE test seam), and the live server is only asked for
// /health and for input validation, which both answer before any Relay
// call is made. The mock chain/currency samples mirror the live shapes
// recorded in CHAINS.md (verified live 2026-11-08).

const assert = require("node:assert");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const {
  validateQuoteInput,
  shapeQuote,
  shapeStatus,
  sumFeesUsd,
  shapeChain,
  shapeCurrency,
  parseChainIdParam,
  parseNativeParam,
  extractCmcLogo,
  shouldTopUpGas,
} = require("./server.js");

const SAMPLE_RELAY_RESPONSE = {
  requestId: "0x17941185062f91cbd8fa0fec080beb94fb3b8943f4647f8b25e19d1670cc53a7",
  steps: [
    {
      id: "approve",
      action: "Confirm transaction in your wallet",
      description: "Sign an approval for USDC",
      kind: "transaction",
      items: [
        {
          status: "incomplete",
          data: {
            from: "0xA37a186AfE306C3EE01D6ABF912cC42BC568091C",
            to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            data: "0x095ea7b30000000000000000000000004cd00e387622c35bddb9b4c962c136462338bc3100000000000000000000000000000000000000000000000000000000000f4240",
            value: "0",
            chainId: 8453,
            gas: "73112",
            maxFeePerGas: "6611743",
            maxPriorityFeePerGas: "1100000",
          },
        },
      ],
      requestId: "0x17941185062f91cbd8fa0fec080beb94fb3b8943f4647f8b25e19d1670cc53a7",
    },
    {
      id: "deposit",
      action: "Confirm transaction in your wallet",
      description: "Depositing funds to the relayer to execute the swap for USDC",
      kind: "transaction",
      items: [
        {
          status: "incomplete",
          data: {
            from: "0xA37a186AfE306C3EE01D6ABF912cC42BC568091C",
            to: "0x4cd00e387622c35bddb9b4c962c136462338bc31",
            data: "0xe8017952000000000000000000000000a37a186afe306c3ee01d6abf912cc42bc568091c000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000000f42407678a5cc85d0f3abdfcfb01e3ea52ec6c44f71f9449dd9a65f72573dda4a4374",
            value: "0",
            chainId: 8453,
            gas: "76194",
            maxFeePerGas: "6611743",
            maxPriorityFeePerGas: "1100000",
          },
        },
      ],
      requestId: "0x17941185062f91cbd8fa0fec080beb94fb3b8943f4647f8b25e19d1670cc53a7",
    },
  ],
  details: {
    currencyOut: {
      currency: {
        chainId: 42161,
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
      },
      amount: "976173",
      amountFormatted: "0.976173",
      amountUsd: "0.975983",
      minimumAmount: "936248",
    },
    timeEstimate: 1,
  },
  fees: {
    gas: { amountUsd: "0.001106" },
    relayer: { amountUsd: "0.023822" },
    relayerGas: { amountUsd: "0.003723" },
    relayerService: { amountUsd: "0.020099" },
    app: { amountUsd: "0" },
    subsidized: { amountUsd: "0" },
  },
};

const GOOD_INPUT = {
  user: "0xA37a186AfE306C3EE01D6ABF912cC42BC568091C",
  recipient: "0xA37a186AfE306C3EE01D6ABF912cC42BC568091C",
  originChainId: 8453,
  destinationChainId: 42161,
  originCurrency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  destinationCurrency: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  amount: "1000000",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Mock Relay data. Shapes mirror the live responses recorded in
// CHAINS.md (2026-11-08): EVM chains carry vmType "evm" and the zero
// address as native currency; Solana/Bitcoin/Tron carry their own
// vmType and native address formats.
const MOCK_CHAINS = [
  {
    id: 1, name: "ethereum", displayName: "Ethereum",
    httpRpcUrl: "https://ethereum.publicnode.com", wsRpcUrl: "wss://ethereum.publicnode.com",
    explorerUrl: "https://etherscan.io", disabled: false, tokenSupport: "All",
    currency: { id: "eth", symbol: "ETH", name: "Ether", address: ZERO_ADDRESS, decimals: 18, supportsBridging: true },
    iconUrl: "https://assets.relay.link/icons/1/light.png", vmType: "evm",
  },
  {
    id: 8453, name: "base", displayName: "Base",
    httpRpcUrl: "https://base.drpc.org", wsRpcUrl: "wss://base.drpc.org",
    explorerUrl: "https://basescan.org", disabled: false, tokenSupport: "All",
    currency: { id: "eth", symbol: "ETH", name: "Ether", address: ZERO_ADDRESS, decimals: 18, supportsBridging: true },
    iconUrl: "https://assets.relay.link/icons/8453/light.png", vmType: "evm",
  },
  {
    id: 42161, name: "arbitrum", displayName: "Arbitrum",
    httpRpcUrl: "https://arbitrum-one.publicnode.com", wsRpcUrl: "wss://arbitrum-one.publicnode.com",
    explorerUrl: "https://arbiscan.io", disabled: false, tokenSupport: "All",
    currency: { id: "eth", symbol: "ETH", name: "Ether", address: ZERO_ADDRESS, decimals: 18, supportsBridging: true },
    iconUrl: "https://assets.relay.link/icons/42161/light.png", vmType: "evm",
  },
  {
    id: 792703809, name: "solana", displayName: "Solana",
    httpRpcUrl: "https://api.mainnet-beta.solana.com", wsRpcUrl: "",
    explorerUrl: "https://solscan.io", disabled: false, tokenSupport: "All",
    currency: { id: "sol", symbol: "SOL", name: "Solana", address: "11111111111111111111111111111111", decimals: 9, supportsBridging: true },
    iconUrl: "https://assets.relay.link/icons/792703809/light.png", vmType: "svm",
  },
  {
    id: 8253038, name: "bitcoin", displayName: "Bitcoin",
    httpRpcUrl: "https://mempool.space", wsRpcUrl: "",
    explorerUrl: "https://mempool.space", disabled: false, tokenSupport: "Limited",
    currency: { id: "btc", symbol: "BTC", name: "Bitcoin", address: "bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmql8k8", decimals: 8, supportsBridging: true },
    iconUrl: "https://assets.relay.link/icons/8253038/light.png", vmType: "bvm",
  },
  {
    id: 728126428, name: "tron", displayName: "Tron",
    httpRpcUrl: "https://api.trongrid.io/jsonrpc", wsRpcUrl: "",
    explorerUrl: "https://tronscan.org/#", disabled: false, tokenSupport: "Limited",
    currency: { id: "trx", symbol: "TRX", name: "TRX", address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", decimals: 6, supportsBridging: true },
    iconUrl: "https://assets.relay.link/icons/728126428/light.png", vmType: "tvm",
  },
  {
    // Empty RPC URL: the shaped chain must not carry rpcUrl.
    id: 999, name: "norpc", displayName: "No RPC",
    httpRpcUrl: "", wsRpcUrl: "",
    explorerUrl: "https://example.invalid", disabled: false, tokenSupport: "All",
    currency: { id: "nrp", symbol: "NRP", name: "No RPC", address: ZERO_ADDRESS, decimals: 18, supportsBridging: true },
    iconUrl: "", vmType: "evm",
  },
  // Malformed entry: no usable id or currency, must be skipped.
  { id: "bad", name: "broken" },
];

const MOCK_CURRENCIES_BASE = [
  { chainId: 8453, address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6, vmType: "evm", metadata: { verified: true } },
  { chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18, vmType: "evm", metadata: { verified: true } },
  { chainId: 8453, address: ZERO_ADDRESS, symbol: "ETH", name: "Ether", decimals: 18, vmType: "evm", metadata: { verified: true } },
  // Duplicate address (Relay does this live): must be deduped.
  { chainId: 8453, address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6, vmType: "evm", metadata: { verified: true } },
  // Malformed entry (no decimals): must be skipped.
  { chainId: 8453, address: "0xdead000000000000000000000000000000000000", symbol: "BROKEN", name: "Broken" },
];

// A tiny mock of api.relay.link. Records hits and request bodies so the
// tests can assert exactly what the backend sent to Relay.
function startMockRelay(port) {
  const hits = { chains: 0, currencies: 0, quote: 0 };
  const bodies = { currencies: null, quote: null };
  const headers = { currencies: null, quote: null };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url === "/chains") {
        hits.chains++;
        res.writeHead(200);
        res.end(JSON.stringify({ chains: MOCK_CHAINS }));
        return;
      }
      if (req.method === "POST" && req.url === "/currencies/v2") {
        hits.currencies++;
        bodies.currencies = body;
        headers.currencies = req.headers;
        if (body && Array.isArray(body.chainIds) && body.chainIds.includes(12345)) {
          // Non-array Relay response: the backend must answer 502.
          res.writeHead(200);
          res.end(JSON.stringify({ not: "an array" }));
          return;
        }
        res.writeHead(200);
        res.end(
          JSON.stringify(
            body && Array.isArray(body.chainIds) && body.chainIds.includes(8453)
              ? MOCK_CURRENCIES_BASE
              : []
          )
        );
        return;
      }
      if (req.method === "POST" && req.url === "/quote/v2") {
        hits.quote++;
        bodies.quote = body;
        headers.quote = req.headers;
        res.writeHead(200);
        res.end(JSON.stringify(SAMPLE_RELAY_RESPONSE));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, hits, bodies, headers }));
  });
}

async function getJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json() };
}

async function postJson(port, path, obj) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  return { status: res.status, body: await res.json() };
}

function check(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

function startServer(env, port) {
  const child = spawn("node", [path.join(__dirname, "server.js")], {
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

function waitForExit(child) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => resolve({ code, out, err }));
  });
}

async function waitForHealth(port, tries = 25) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not come up");
}

async function main() {
  // 1. Response shaping against the real sample.
  check("shaping: output amount and currency", () => {
    const shaped = shapeQuote(SAMPLE_RELAY_RESPONSE, GOOD_INPUT);
    assert.strictEqual(shaped.requestId, SAMPLE_RELAY_RESPONSE.requestId);
    assert.strictEqual(shaped.outputAmount, "976173");
    assert.strictEqual(shaped.outputAmountFormatted, "0.976173");
    assert.strictEqual(shaped.outputCurrency, "USDC");
    assert.strictEqual(shaped.timeEstimate, 1);
    assert.deepStrictEqual(
      shaped.steps.map((s) => s.id),
      ["approve", "deposit"]
    );
  });
  check("shaping: steps carry tx data for the wallet", () => {
    const shaped = shapeQuote(SAMPLE_RELAY_RESPONSE, GOOD_INPUT);
    const [approve, deposit] = shaped.steps;
    assert.deepStrictEqual(approve.tx, {
      to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      data: "0x095ea7b30000000000000000000000004cd00e387622c35bddb9b4c962c136462338bc3100000000000000000000000000000000000000000000000000000000000f4240",
      value: "0",
      chainId: 8453,
    });
    assert.strictEqual(
      deposit.tx.to,
      "0x4cd00e387622c35bddb9b4c962c136462338bc31"
    );
    assert.strictEqual(deposit.tx.chainId, 8453);
    assert.ok(deposit.tx.data.startsWith("0xe8017952"));
  });
  check("shaping: step without item data gets tx null", () => {
    const shaped = shapeQuote(
      { ...SAMPLE_RELAY_RESPONSE, steps: [{ id: "sign", action: "Sign", description: "Sign off-chain", items: [] }] },
      GOOD_INPUT
    );
    assert.strictEqual(shaped.steps[0].tx, null);
  });
  check("shaping: feesUsd about 0.025", () => {
    const shaped = shapeQuote(SAMPLE_RELAY_RESPONSE, GOOD_INPUT);
    assert.ok(
      Math.abs(shaped.feesUsd - 0.024928) < 0.001,
      `feesUsd was ${shaped.feesUsd}, expected about 0.024928`
    );
  });
  check("shaping: non-numeric fee line is skipped, never nulls feesUsd", () => {
    assert.strictEqual(
      sumFeesUsd({ gas: { amountUsd: "oops" }, relayer: { amountUsd: "0.02" } }),
      0.02
    );
    assert.strictEqual(sumFeesUsd({ gas: { amountUsd: "oops" } }), 0);
    assert.strictEqual(sumFeesUsd({}), 0);
    assert.strictEqual(sumFeesUsd(null), 0);
  });
  check("shaping: status waiting (verified live 2026-11-08)", () => {
    const shaped = shapeStatus(
      { status: "waiting", quoteCreatedAt: 1794122301010 },
      "0x17941223001e3ab53a80dc0b4caa968f248d3e4be40d4ff1382bf8edaf25d813"
    );
    assert.strictEqual(shaped.status, "waiting");
    assert.deepStrictEqual(shaped.txHashes, []);
  });

  // 2. Input validation.
  check("validation: good input passes", () => {
    assert.strictEqual(validateQuoteInput(GOOD_INPUT), null);
  });
  check("validation: bad user address rejected", () => {
    const bad = { ...GOOD_INPUT, user: "not-an-address" };
    assert.match(validateQuoteInput(bad), /user/);
  });
  check("validation: bad amount rejected", () => {
    assert.match(validateQuoteInput({ ...GOOD_INPUT, amount: "1.5" }), /amount/);
    assert.match(validateQuoteInput({ ...GOOD_INPUT, amount: "0" }), /amount/);
    assert.match(validateQuoteInput({ ...GOOD_INPUT, amount: "-5" }), /amount/);
  });
  check("validation: bad chain id rejected", () => {
    assert.match(
      validateQuoteInput({ ...GOOD_INPUT, originChainId: "8453" }),
      /originChainId/
    );
  });
  check("validation: topupGas must be a boolean when present", () => {
    assert.strictEqual(validateQuoteInput({ ...GOOD_INPUT, topupGas: true }), null);
    assert.strictEqual(validateQuoteInput({ ...GOOD_INPUT, topupGas: false }), null);
    assert.strictEqual(validateQuoteInput(GOOD_INPUT), null);
    assert.match(validateQuoteInput({ ...GOOD_INPUT, topupGas: "true" }), /topupGas/);
    assert.match(validateQuoteInput({ ...GOOD_INPUT, topupGas: 1 }), /topupGas/);
    assert.match(validateQuoteInput({ ...GOOD_INPUT, topupGas: null }), /topupGas/);
  });
  check("shaping: chain shaping (EVM vs non-EVM, RPC URL)", () => {
    const base = shapeChain(MOCK_CHAINS[1]);
    assert.deepStrictEqual(base, {
      id: 8453,
      name: "base",
      displayName: "Base",
      nativeCurrency: { symbol: "ETH", decimals: 18 },
      evm: true,
      disabled: false,
      explorerUrl: "https://basescan.org",
      iconUrl: "https://assets.relay.link/icons/8453/light.png",
      rpcUrl: "https://base.drpc.org",
    });
    const solana = shapeChain(MOCK_CHAINS[3]);
    assert.strictEqual(solana.evm, false);
    assert.strictEqual(solana.nativeCurrency.symbol, "SOL");
    assert.strictEqual(solana.nativeCurrency.decimals, 9);
    assert.strictEqual(solana.rpcUrl, "https://api.mainnet-beta.solana.com");
    const noRpc = shapeChain(MOCK_CHAINS[6]);
    assert.strictEqual("rpcUrl" in noRpc, false);
    assert.strictEqual("iconUrl" in noRpc, false);
    assert.strictEqual(shapeChain(MOCK_CHAINS[7]), null);
    assert.strictEqual(shapeChain(null), null);
    assert.strictEqual(shapeChain({ id: 1, name: "x" }), null);
  });
  check("shaping: currency shaping keeps non-hex addresses", () => {
    assert.deepStrictEqual(
      shapeCurrency({ address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 }),
      { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6, name: "USD Coin" }
    );
    assert.strictEqual(shapeCurrency({ address: "0xabc", symbol: "X", decimals: "6" }), null);
    assert.strictEqual(shapeCurrency({ symbol: "X", decimals: 6 }), null);
  });
  check("shaping: currency shaping passes Relay logoURI through as iconUrl", () => {
    assert.deepStrictEqual(
      shapeCurrency({
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6,
        metadata: { logoURI: "https://example.invalid/usdc.png", verified: true },
      }),
      {
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6, name: "USD Coin",
        iconUrl: "https://example.invalid/usdc.png",
      }
    );
    // No metadata, or a non-http logoURI, means no iconUrl at all.
    const noMeta = shapeCurrency({ address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6 });
    assert.strictEqual("iconUrl" in noMeta, false);
    const ipfs = shapeCurrency({
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6,
      metadata: { logoURI: "ipfs://Qmdeadbeef" },
    });
    assert.strictEqual("iconUrl" in ipfs, false);
    const nonString = shapeCurrency({
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6,
      metadata: { logoURI: 42 },
    });
    assert.strictEqual("iconUrl" in nonString, false);
  });
  check("token-icon: CoinMarketCap logo extraction picks the matching listing", () => {
    const data = {
      999: {
        id: 999, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/999.png",
        platform: { slug: "bnb", token_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
      },
      3408: {
        id: 3408, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
        platform: { slug: "ethereum", token_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
      },
    };
    // Both entries share the address; the Base chain (8453) has no
    // platform slug match here, so the address-matching pool's first
    // entry wins — but with an ethereum chain (1) the ethereum entry wins.
    assert.deepStrictEqual(
      extractCmcLogo(data, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 1),
      { logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png", cmcId: 3408 }
    );
    assert.deepStrictEqual(extractCmcLogo({}, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 8453), { logoUrl: null, cmcId: null });
    assert.deepStrictEqual(extractCmcLogo(null, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 8453), { logoUrl: null, cmcId: null });
    // A logo from anywhere but CoinMarketCap's static host is not trusted.
    assert.deepStrictEqual(
      extractCmcLogo(
        { 1: { id: 1, logo: "https://evil.invalid/1.png" } },
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 1
      ),
      { logoUrl: null, cmcId: null }
    );
    // Live 2026-11-12: an address lookup can return the right asset
    // with another deployment's platform, so when no platform
    // matches, the first entry with a logo still answers.
    assert.deepStrictEqual(
      extractCmcLogo(
        { 3408: { id: 3408, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
          platform: { slug: "zksync", token_address: "0x1d17cbcF0D6D143135aE902365D2E5e2A16538D4" } } },
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 1
      ),
      { logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png", cmcId: 3408 }
    );
  });
  check("token-icon: native param parsing", () => {
    assert.strictEqual(parseNativeParam(null), false);
    assert.strictEqual(parseNativeParam("0"), false);
    assert.strictEqual(parseNativeParam("1"), true);
    assert.strictEqual(parseNativeParam("true"), null);
    assert.strictEqual(parseNativeParam("2"), null);
    assert.strictEqual(parseNativeParam(""), null);
  });
  check("parsing: chainId query param", () => {
    assert.strictEqual(parseChainIdParam("8453"), 8453);
    assert.strictEqual(parseChainIdParam(null), null);
    assert.strictEqual(parseChainIdParam(""), null);
    assert.strictEqual(parseChainIdParam("abc"), null);
    assert.strictEqual(parseChainIdParam("0"), null);
    assert.strictEqual(parseChainIdParam("-5"), null);
    assert.strictEqual(parseChainIdParam("8453.5"), null);
    assert.strictEqual(parseChainIdParam("0x2105"), null);
    assert.strictEqual(parseChainIdParam(" 8453"), null);
  });
  check("topupGas gate: EVM-to-EVM non-native only", () => {
    const rawById = new Map(MOCK_CHAINS.map((c) => [c.id, c]));
    const chainsData = { rawById };
    assert.strictEqual(shouldTopUpGas({ ...GOOD_INPUT, topupGas: true }, chainsData), true);
    assert.strictEqual(shouldTopUpGas({ ...GOOD_INPUT, topupGas: false }, chainsData), false);
    assert.strictEqual(shouldTopUpGas(GOOD_INPUT, chainsData), false);
    assert.strictEqual(
      shouldTopUpGas({ ...GOOD_INPUT, topupGas: true, originCurrency: ZERO_ADDRESS }, chainsData),
      false,
      "native origin must not top up"
    );
    assert.strictEqual(
      shouldTopUpGas({ ...GOOD_INPUT, topupGas: true, destinationChainId: 792703809 }, chainsData),
      false,
      "Solana destination must not top up"
    );
    assert.strictEqual(
      shouldTopUpGas({ ...GOOD_INPUT, topupGas: true, originChainId: 792703809 }, chainsData),
      false,
      "Solana origin must not top up"
    );
    assert.strictEqual(
      shouldTopUpGas({ ...GOOD_INPUT, topupGas: true, destinationChainId: 8253038 }, chainsData),
      false,
      "Bitcoin destination must not top up"
    );
    assert.strictEqual(
      shouldTopUpGas({ ...GOOD_INPUT, topupGas: true, destinationChainId: 999999 }, chainsData),
      false,
      "unknown chain fails closed"
    );
    assert.strictEqual(shouldTopUpGas({ ...GOOD_INPUT, topupGas: true }, null), false);
  });

  // 3. Live server: /health and 400s (no Relay call is made here).
  // The mock Relay stands in for api.relay.link for every server below.
  const mockPort = 3458;
  const mock = await startMockRelay(mockPort);
  const mockBase = `http://127.0.0.1:${mockPort}`;
  const port = 3456;
  const server = startServer(
    { RELAY_API_KEY: "dummy-key-for-validation-tests-only", RELAY_API_BASE: mockBase },
    port
  );
  try {
    const health = await waitForHealth(port);
    const healthBody = await health.json();
    assert.deepStrictEqual(healthBody, { ok: true });
    assert.strictEqual(health.headers.get("access-control-allow-origin"), "*");
    console.log("ok - http: GET /health returns {ok: true} with CORS header");

    const preflight = await fetch(`http://127.0.0.1:${port}/quote`, {
      method: "OPTIONS",
    });
    assert.strictEqual(preflight.status, 204);
    assert.match(
      preflight.headers.get("access-control-allow-methods") || "",
      /POST/
    );
    assert.strictEqual(preflight.headers.get("access-control-allow-origin"), "*");
    console.log("ok - http: OPTIONS /quote answers 204 with CORS headers");

    const badAddress = await fetch(`http://127.0.0.1:${port}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...GOOD_INPUT, user: "xyz" }),
    });
    assert.strictEqual(badAddress.status, 400);
    const badAddressBody = await badAddress.json();
    assert.match(badAddressBody.error, /user/);
    console.log("ok - http: POST /quote with bad address returns 400");

    const badAmount = await fetch(`http://127.0.0.1:${port}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...GOOD_INPUT, amount: "abc" }),
    });
    assert.strictEqual(badAmount.status, 400);
    const badAmountBody = await badAmount.json();
    assert.match(badAmountBody.error, /amount/);
    console.log("ok - http: POST /quote with bad amount returns 400");

    const badStatus = await fetch(
      `http://127.0.0.1:${port}/status?requestId=not-a-request-id`
    );
    assert.strictEqual(badStatus.status, 400);
    const badStatusBody = await badStatus.json();
    assert.match(badStatusBody.error, /requestId/);
    console.log("ok - http: GET /status with bad requestId returns 400");
  } finally {
    server.kill();
  }

  // 4. Live server against the mock Relay: /chains, /currencies, /quote
  // with topupGas. Each block asserts what the backend actually sent to
  // Relay, not just what it returned.
  const port2 = 3459;
  const server2 = startServer(
    { RELAY_API_KEY: "dummy-key-for-validation-tests-only", RELAY_API_BASE: mockBase },
    port2
  );
  try {
    await waitForHealth(port2);

    const chains1 = await getJson(port2, "/chains");
    assert.strictEqual(chains1.status, 200);
    assert.strictEqual(chains1.body.chains.length, 7, "malformed mock entry must be skipped");
    const base = chains1.body.chains.find((c) => c.id === 8453);
    assert.deepStrictEqual(base, {
      id: 8453, name: "base", displayName: "Base",
      nativeCurrency: { symbol: "ETH", decimals: 18 },
      evm: true, disabled: false,
      explorerUrl: "https://basescan.org",
      iconUrl: "https://assets.relay.link/icons/8453/light.png",
      rpcUrl: "https://base.drpc.org",
    });
    const solana = chains1.body.chains.find((c) => c.id === 792703809);
    assert.strictEqual(solana.evm, false);
    assert.strictEqual(solana.nativeCurrency.symbol, "SOL");
    const noRpc = chains1.body.chains.find((c) => c.id === 999);
    assert.strictEqual("rpcUrl" in noRpc, false);
    assert.strictEqual(mock.hits.chains, 1);
    console.log("ok - http: GET /chains returns clean chains (EVM flag, rpcUrl, malformed skipped)");

    const chains2 = await getJson(port2, "/chains");
    assert.strictEqual(chains2.status, 200);
    assert.strictEqual(mock.hits.chains, 1, "second /chains must be served from cache");
    console.log("ok - http: GET /chains is cached (one Relay fetch for two calls)");

    const curr1 = await getJson(port2, "/currencies?chainId=8453");
    assert.strictEqual(curr1.status, 200);
    assert.strictEqual(curr1.body.chainId, 8453);
    assert.deepStrictEqual(
      curr1.body.currencies.map((c) => c.symbol),
      ["USDC", "WETH", "ETH"],
      "duplicate address deduped, malformed entry skipped"
    );
    assert.deepStrictEqual(mock.bodies.currencies, { chainIds: [8453], limit: 100 });
    assert.strictEqual(mock.headers.currencies["x-api-key"], "dummy-key-for-validation-tests-only");
    assert.strictEqual(mock.hits.currencies, 1);
    console.log("ok - http: GET /currencies returns clean currencies (POST to Relay, limit 100, key sent)");

    const curr2 = await getJson(port2, "/currencies?chainId=8453");
    assert.strictEqual(curr2.status, 200);
    assert.strictEqual(mock.hits.currencies, 1, "second /currencies for the same chain must be cached");
    const currOther = await getJson(port2, "/currencies?chainId=1");
    assert.strictEqual(currOther.status, 200);
    assert.deepStrictEqual(currOther.body.currencies, []);
    assert.strictEqual(mock.hits.currencies, 2, "a different chain is a separate cache entry");
    const currUnknown = await getJson(port2, "/currencies?chainId=999999999");
    assert.strictEqual(currUnknown.status, 200);
    assert.deepStrictEqual(currUnknown.body.currencies, []);
    console.log("ok - http: GET /currencies caches per chain and returns [] for unknown chains");

    for (const bad of ["/currencies", "/currencies?chainId=abc", "/currencies?chainId=0", "/currencies?chainId=-5", "/currencies?chainId=8453.5", "/currencies?chainId=0x2105"]) {
      const r = await getJson(port2, bad);
      assert.strictEqual(r.status, 400, `${bad} must be 400`);
      assert.match(r.body.error, /chainId/);
    }
    console.log("ok - http: GET /currencies rejects missing/bad chainId with 400");

    const currBadShape = await getJson(port2, "/currencies?chainId=12345");
    assert.strictEqual(currBadShape.status, 502, "non-array Relay response must be 502");
    console.log("ok - http: GET /currencies returns 502 when Relay's shape is wrong");

    const quoteTopUp = await postJson(port2, "/quote", { ...GOOD_INPUT, topupGas: true });
    assert.strictEqual(quoteTopUp.status, 200);
    assert.strictEqual(quoteTopUp.body.outputAmount, "976173");
    assert.strictEqual(mock.bodies.quote.topupGas, true);
    assert.strictEqual(mock.hits.chains, 1, "quote top-up reuses the cached chain list");
    console.log("ok - http: POST /quote topupGas true (EVM->EVM, non-native) forwards topupGas: true");

    const quoteNoTopUp = await postJson(port2, "/quote", { ...GOOD_INPUT, topupGas: false });
    assert.strictEqual(quoteNoTopUp.status, 200);
    assert.strictEqual("topupGas" in mock.bodies.quote, false);
    const quoteDefault = await postJson(port2, "/quote", GOOD_INPUT);
    assert.strictEqual(quoteDefault.status, 200);
    assert.strictEqual("topupGas" in mock.bodies.quote, false);
    console.log("ok - http: POST /quote topupGas false/absent sends no flag (default off)");

    const quotesBefore = mock.hits.quote;
    for (const badFlag of ["true", 1, null]) {
      const r = await postJson(port2, "/quote", { ...GOOD_INPUT, topupGas: badFlag });
      assert.strictEqual(r.status, 400, `topupGas ${JSON.stringify(badFlag)} must be 400`);
      assert.match(r.body.error, /topupGas/);
    }
    assert.strictEqual(mock.hits.quote, quotesBefore, "invalid topupGas must not reach Relay");
    console.log("ok - http: POST /quote rejects non-boolean topupGas with 400");

    const quoteNative = await postJson(port2, "/quote", {
      ...GOOD_INPUT, topupGas: true, originCurrency: ZERO_ADDRESS,
    });
    assert.strictEqual(quoteNative.status, 200);
    assert.strictEqual("topupGas" in mock.bodies.quote, false, "native origin must not forward the flag");
    const quoteSolana = await postJson(port2, "/quote", {
      ...GOOD_INPUT, topupGas: true, destinationChainId: 792703809,
    });
    assert.strictEqual(quoteSolana.status, 200);
    assert.strictEqual("topupGas" in mock.bodies.quote, false, "Solana route must not forward the flag");
    const quoteUnknownChain = await postJson(port2, "/quote", {
      ...GOOD_INPUT, topupGas: true, destinationChainId: 999999,
    });
    assert.strictEqual(quoteUnknownChain.status, 200);
    assert.strictEqual("topupGas" in mock.bodies.quote, false, "unknown chain fails closed");
    console.log("ok - http: POST /quote drops topupGas for native origin, Solana route, unknown chain");
  } finally {
    server2.kill();
  }

  // 4b. Live server against a mock CoinMarketCap: /token-icon.
  // The mock answers for one known token (USDC on Base, address
  // 0x8335...2913) and for the ETH symbol; anything else is unknown.
  const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const UNKNOWN_ADDR = "0x0000000000000000000000000000000000000001";
  const RETRY_ADDR = "0x0000000000000000000000000000000000000002";
  let cmcMode = "ok";
  const cmcMock = await (async () => {
    const hits = { info: 0 };
    const headers = { info: null };
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      const u = new URL(req.url, "http://localhost");
      if (req.method === "GET" && u.pathname === "/v2/cryptocurrency/info") {
        hits.info++;
        headers.info = req.headers;
        if (cmcMode === "rate-limited") {
          res.writeHead(429);
          res.end(JSON.stringify({ status: { error_code: 429, error_message: "Too Many Requests" } }));
          return;
        }
        if (cmcMode === "down") {
          res.writeHead(500);
          res.end(JSON.stringify({ status: { error_code: 500, error_message: "Server error" } }));
          return;
        }
        const address = (u.searchParams.get("address") || "").toLowerCase();
        const symbol = (u.searchParams.get("symbol") || "").toUpperCase();
        if (address === USDC_BASE) {
          res.writeHead(200);
          res.end(JSON.stringify({
            status: { error_code: 0 },
            data: {
              3408: {
                id: 3408, name: "USD Coin", symbol: "USDC",
                logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
                platform: { id: 1027, name: "Ethereum", slug: "ethereum", symbol: "ETH", token_address: USDC_BASE },
              },
            },
          }));
          return;
        }
        if (symbol === "ETH") {
          res.writeHead(200);
          res.end(JSON.stringify({
            status: { error_code: 0 },
            data: {
              1: {
                id: 1, name: "Ethereum", symbol: "ETH",
                logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
                platform: null,
              },
            },
          }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ status: { error_code: 0 }, data: {} }));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ error: "not found" }));
    });
    await new Promise((resolve) => server.listen(3461, "127.0.0.1", resolve));
    return { server, hits, headers };
  })();
  const cmcBase = "http://127.0.0.1:3461";
  const port4 = 3462;
  const server4 = startServer(
    {
      RELAY_API_KEY: "dummy-key-for-validation-tests-only",
      RELAY_API_BASE: mockBase,
      CMC_API_KEY: "dummy-cmc-key-for-tests-only",
      CMC_API_BASE: cmcBase,
      CMC_BACKOFF_MS: "300",
    },
    port4
  );
  try {
    await waitForHealth(port4);

    const icon1 = await getJson(port4, `/token-icon?chainId=8453&address=${USDC_BASE}&native=0`);
    assert.strictEqual(icon1.status, 200);
    assert.deepStrictEqual(icon1.body, {
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
      cmcId: 3408,
    });
    assert.strictEqual(cmcMock.headers.info["x-cmc_pro_api_key"], "dummy-cmc-key-for-tests-only");
    assert.strictEqual(cmcMock.hits.info, 1);
    console.log("ok - http: GET /token-icon returns the CoinMarketCap logo for a known token");

    const iconCached = await getJson(port4, `/token-icon?chainId=8453&address=${USDC_BASE}&native=0`);
    assert.strictEqual(iconCached.status, 200);
    assert.strictEqual(cmcMock.hits.info, 1, "second /token-icon for the same token must be cached");
    console.log("ok - http: GET /token-icon is cached (one CoinMarketCap fetch for two calls)");

    const iconUnknown = await getJson(port4, `/token-icon?chainId=8453&address=${UNKNOWN_ADDR}&native=0`);
    assert.strictEqual(iconUnknown.status, 200);
    assert.deepStrictEqual(iconUnknown.body, { logoUrl: null, cmcId: null });
    console.log("ok - http: GET /token-icon returns logoUrl null for an unknown token");

    const iconNative = await getJson(port4, `/token-icon?chainId=1&address=${ZERO_ADDRESS}&native=1&symbol=ETH`);
    assert.strictEqual(iconNative.status, 200);
    assert.deepStrictEqual(iconNative.body, {
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
      cmcId: 1,
    });
    console.log("ok - http: GET /token-icon looks a native up by symbol");

    const hitsBeforeNativeNoSymbol = cmcMock.hits.info;
    const iconNativeNoSymbol = await getJson(port4, `/token-icon?chainId=1&address=${ZERO_ADDRESS}&native=1`);
    assert.strictEqual(iconNativeNoSymbol.status, 200);
    assert.deepStrictEqual(iconNativeNoSymbol.body, { logoUrl: null, cmcId: null });
    assert.strictEqual(cmcMock.hits.info, hitsBeforeNativeNoSymbol, "native without a symbol must not call CoinMarketCap");
    console.log("ok - http: GET /token-icon native without symbol answers null without a call");

    for (const bad of [
      "/token-icon",
      "/token-icon?address=" + USDC_BASE,
      "/token-icon?chainId=abc&address=" + USDC_BASE,
      "/token-icon?chainId=8453&address=0x1234",
      "/token-icon?chainId=8453&address=" + USDC_BASE + "&native=2",
      "/token-icon?chainId=8453&address=" + USDC_BASE + "&native=true",
      "/token-icon?chainId=8453&address=" + USDC_BASE + "&native=1",
      "/token-icon?chainId=8453&address=" + USDC_BASE + "&native=0&symbol=TOOLONGSYMBOL123",
      "/token-icon?chainId=8453&address=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    ]) {
      const r = await getJson(port4, bad);
      assert.strictEqual(r.status, 400, `${bad} must be 400`);
      assert.ok(typeof r.body.error === "string" && r.body.error.length > 0);
    }
    console.log("ok - http: GET /token-icon rejects missing/bad chainId, address, native and symbol with 400");

    // 429: unavailable, and NOT cached as a miss — after the short
    // test backoff expires, the same address is asked again and the
    // mock answers.
    cmcMode = "rate-limited";
    const icon429 = await getJson(port4, `/token-icon?chainId=8453&address=${RETRY_ADDR}&native=0`);
    assert.strictEqual(icon429.status, 503);
    assert.strictEqual(icon429.body.error, "coinmarketcap unavailable");
    assert.strictEqual(icon429.body.logoUrl, null);
    const hitsAfter429 = cmcMock.hits.info;
    cmcMode = "ok";
    await new Promise((r) => setTimeout(r, 400));
    const iconRetry = await getJson(port4, `/token-icon?chainId=8453&address=${RETRY_ADDR}&native=0`);
    assert.strictEqual(iconRetry.status, 200);
    assert.deepStrictEqual(iconRetry.body, { logoUrl: null, cmcId: null });
    assert.ok(cmcMock.hits.info > hitsAfter429, "a 429 must not be cached as a miss");
    console.log("ok - http: GET /token-icon answers 503 on CoinMarketCap 429 and retries next time");
  } finally {
    server4.kill();
    cmcMock.server.close();
  }

  // 4c. No CMC_API_KEY: the service still starts, /health answers,
  // and /token-icon answers 503 "not configured" instead of calling
  // CoinMarketCap or crashing.
  const port5 = 3463;
  const server5 = startServer(
    { RELAY_API_KEY: "dummy-key-for-validation-tests-only", RELAY_API_BASE: mockBase },
    port5
  );
  try {
    await waitForHealth(port5);
    const iconNoKey = await getJson(port5, `/token-icon?chainId=8453&address=${USDC_BASE}&native=0`);
    assert.strictEqual(iconNoKey.status, 503);
    assert.strictEqual(iconNoKey.body.error, "coinmarketcap not configured");
    assert.strictEqual(iconNoKey.body.logoUrl, null);
    console.log("ok - http: GET /token-icon without CMC_API_KEY answers 503 not configured (service still starts)");
  } finally {
    server5.kill();
  }

  // Relay unreachable: list endpoints answer 502, never crash.
  const port3 = 3460;
  const server3 = startServer(
    { RELAY_API_KEY: "dummy-key-for-validation-tests-only", RELAY_API_BASE: "http://127.0.0.1:59999" },
    port3
  );
  try {
    await waitForHealth(port3);
    const downChains = await getJson(port3, "/chains");
    assert.strictEqual(downChains.status, 502);
    const downCurr = await getJson(port3, "/currencies?chainId=8453");
    assert.strictEqual(downCurr.status, 502);
    console.log("ok - http: GET /chains and /currencies return 502 when Relay is unreachable");
  } finally {
    server3.kill();
  }
  mock.server.close();

  // 5. Missing RELAY_API_KEY: clear startup error, exit 1, no stack trace.
  const noKeyEnv = { ...process.env };
  delete noKeyEnv.RELAY_API_KEY;
  const noKey = spawn("node", [path.join(__dirname, "server.js")], {
    env: { ...noKeyEnv, PORT: "3457" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const result = await waitForExit(noKey);
  assert.strictEqual(result.code, 1, `expected exit 1, got ${result.code}`);
  assert.match(result.err, /RELAY_API_KEY is not set/);
  assert.doesNotMatch(result.err, /Error:|at\s+\S+\s+\(/);
  console.log("ok - startup: missing RELAY_API_KEY exits 1 with a clear message");

  console.log("\nAll tests passed.");
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
