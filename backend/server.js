// Prime Way backend: Relay quote service.
//
// Small Node service using only Node built-ins (no npm install needed).
// One endpoint, POST /quote, takes a send request from the Prime Way app,
// asks Relay for a cross-chain quote and returns a small clean JSON.
//
// The Relay API key is read from the RELAY_API_KEY environment variable at
// runtime. It never lives in this repo, in code, or in logs.

const http = require("node:http");

const RELAY_URL = "https://api.relay.link/quote/v2";
const PORT = Number(process.env.PORT || 3000);
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
  res.writeHead(status, { "Content-Type": "application/json" });
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

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && req.url === "/quote") {
      handleQuote(req, res).catch(() => {
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

module.exports = { createServer, validateQuoteInput, shapeQuote, sumFeesUsd };
