// Self-test for the Prime Way quote service.
//
// Run: node backend/test.cjs
// The Relay response below is a real sample returned live by
// POST /quote/v2 for 1 USDC on Base -> USDC on Arbitrum (verified
// 2026-11-08). No numbers are invented. The test never calls Relay:
// the live server is only asked for /health and for input validation,
// which both answer before any Relay call is made.

const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { validateQuoteInput, shapeQuote } = require("./server.js");

const SAMPLE_RELAY_RESPONSE = {
  requestId: "0x17941185062f91cbd8fa0fec080beb94fb3b8943f4647f8b25e19d1670cc53a7",
  steps: [
    {
      id: "approve",
      action: "Confirm transaction in your wallet",
      description: "Sign an approval for USDC",
      kind: "transaction",
      items: [{ status: "incomplete" }],
      requestId: "0x17941185062f91cbd8fa0fec080beb94fb3b8943f4647f8b25e19d1670cc53a7",
    },
    {
      id: "deposit",
      action: "Confirm transaction in your wallet",
      description: "Depositing funds to the relayer to execute the swap for USDC",
      kind: "transaction",
      items: [{ status: "incomplete" }],
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
  check("shaping: feesUsd about 0.029", () => {
    const shaped = shapeQuote(SAMPLE_RELAY_RESPONSE, GOOD_INPUT);
    assert.ok(
      Math.abs(shaped.feesUsd - 0.029) < 0.001,
      `feesUsd was ${shaped.feesUsd}, expected about 0.029`
    );
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

  // 3. Live server: /health and 400s (no Relay call is made here).
  const port = 3456;
  const server = startServer({ RELAY_API_KEY: "dummy-key-for-validation-tests-only" }, port);
  try {
    const health = await waitForHealth(port);
    const healthBody = await health.json();
    assert.deepStrictEqual(healthBody, { ok: true });
    console.log("ok - http: GET /health returns {ok: true}");

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
  } finally {
    server.kill();
  }

  // 4. Missing RELAY_API_KEY: clear startup error, exit 1, no stack trace.
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
