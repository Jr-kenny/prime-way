// Prime Way backend: Relay quote service.
//
// Small Node service using only Node built-ins (no npm install needed).
// Two endpoints: POST /quote takes a send request from the Prime Way app,
// asks Relay for a cross-chain quote and returns a small clean JSON;
// GET /status?requestId=... asks Relay how far a quoted send has got
// (waiting, pending, success, refund) so the app can show it landing.
//
// The Relay API key is read from the RELAY_API_KEY environment variable at
// runtime. It never lives in this repo, in code, or in logs.

const http = require("node:http");

const RELAY_URL = "https://api.relay.link/quote/v2";
const RELAY_STATUS_URL = "https://api.relay.link/intents/status/v3";
const PORT = Number(process.env.PORT || 3000);
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const REQUEST_ID_RE = /^0x[0-9a-fA-F]{64}$/;

// Fee lines summed into feesUsd. Relay's `relayer` line already contains
// `relayerGas` + `relayerService`, so neither is added again.
const FEE_LINES = ["gas", "relayer", "app", "subsidized"];

function sumFeesUsd(fees) {
  let total = 0;
  for (const line of FEE_LINES) {
    const entry = fees && fees[line];
    if (entry && entry.amountUsd !== undefined) {
      total += Number(entry.amountUsd);
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
  return null;
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
    steps: (relay.steps || []).map((step) => ({
      id: step.id,
      action: step.action,
      description: step.description,
    })),
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

module.exports = { createServer, validateQuoteInput, shapeQuote, shapeStatus, sumFeesUsd };
