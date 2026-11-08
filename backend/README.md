# Prime Way backend: Relay quote service

Small Node service (built-ins only, no `npm install` needed) that gives the
Prime Way app live cross-chain quotes from Relay.

## Run it

```sh
RELAY_API_KEY=your-relay-api-key node server.js
```

- `RELAY_API_KEY` (required): your Relay API key. The service refuses to
  start without it and prints a clear message. The key never lives in this
  repo. Keep it in the environment or your hosting provider's secrets, never
  in a file you commit.
- `PORT` (optional): port to listen on. Default is 3000.
- `RELAY_API_BASE` (optional, tests only): base URL for Relay, default
  `https://api.relay.link`. The test suite points it at a local mock Relay;
  leave it unset in production.

Requires Node 18 or newer (uses the global `fetch`).

## Endpoints

### GET /health

Returns `{ "ok": true }`. It does not call Relay. Use it to check the
service is up.

### GET /chains

Returns Relay's chain list, cleaned up and cached in memory for 1 hour:

```json
{ "chains": [
  { "id": 8453, "name": "base", "displayName": "Base",
    "nativeCurrency": { "symbol": "ETH", "decimals": 18 },
    "evm": true, "disabled": false,
    "explorerUrl": "https://basescan.org",
    "iconUrl": "https://assets.relay.link/icons/8453/light.png",
    "rpcUrl": "https://base.drpc.org" }
] }
```

No API key is needed for this endpoint (Relay's `/chains` is public).
`evm` comes from Relay's `vmType` field (`"evm"` vs `"svm"`, `"bvm"`,
`"tvm"`, …). `rpcUrl` is Relay's `httpRpcUrl`, included when Relay
provides one — the backend never invents RPC URLs. `explorerUrl`,
`iconUrl` and `rpcUrl` are omitted when empty. A failed refresh keeps
serving the previous list; Relay unreachable with no cached list returns
`502`. See `CHAINS.md` for the full live shape recorded 2026-11-08
(57 chains, every field, how non-EVM chains are identified).

### GET /currencies?chainId=8453

Returns the currencies Relay lists for one chain, cleaned up and cached
in memory for 1 hour per chain — this is what token discovery uses:

```json
{ "chainId": 8453, "currencies": [
  { "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "symbol": "USDC", "decimals": 6, "name": "USD Coin" }
] }
```

`chainId` must be a positive integer (`400` otherwise). Relay's endpoint
is `POST /currencies/v2` (there is no `GET /currencies/v2` — it 404s);
the backend calls it with `{ chainIds: [id], limit: 100 }` and sends its
API key, though the key is optional for this endpoint (verified live).
At most 100 currencies come back per chain (Relay's cap), duplicates are
removed, and an unknown chain returns `{ "chainId": <id>, "currencies": [] }`.
Addresses are returned exactly as Relay gives them — non-EVM addresses
are not hex, so do not validate them as `0x` + 40 hex on the client.
Relay unreachable with no cached list returns `502`. Full details in
`CHAINS.md`.

### POST /quote

Body (JSON):

```json
{
  "user": "0xA37a186AfE306C3EE01D6ABF912cC42BC568091C",
  "recipient": "0xA37a186AfE306C3EE01D6ABF912cC42BC568091C",
  "originChainId": 8453,
  "destinationChainId": 42161,
  "originCurrency": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "destinationCurrency": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "amount": "1000000"
}
```

- Addresses must look like `0x` followed by 40 hex characters.
- Chain ids must be positive integers (8453 is Base, 42161 is Arbitrum).
- `amount` must be a positive integer string in the token's smallest units
  (USDC has 6 decimals, so `"1000000"` is 1 USDC).
- `topupGas` (optional) must be a boolean when present. When `true`, the
  backend forwards `topupGas: true` to Relay — which includes a small
  amount of the destination chain's native gas token with the bridged
  tokens — **only** when the route is EVM-to-EVM and the origin currency
  is not the origin chain's native token. Otherwise the flag is left out
  and the quote proceeds normally (never sent for a Solana / non-EVM
  route, never when sending the native token, never when the chain list
  cannot be fetched). Default is off. The fee/output effect of the
  top-up was not measured here (no key locally to call `/quote/v2` with
  it) — compare `outputAmount` / `feesUsd` with the flag on and off once
  deployed; see `CHAINS.md`.
- Bad input returns `400` with an `error` message naming the bad field.

Success returns:

```json
{
  "requestId": "0x1794...",
  "outputAmount": "976173",
  "outputAmountFormatted": "0.976173",
  "outputCurrency": "USDC",
  "feesUsd": 0.024928,
  "steps": [
    { "id": "approve", "action": "Confirm transaction in your wallet", "description": "Sign an approval for USDC", "tx": { "to": "0x8335...", "data": "0x095ea7b3...", "value": "0", "chainId": 8453 } },
    { "id": "deposit", "action": "Confirm transaction in your wallet", "description": "Depositing funds to the relayer to execute the swap for USDC", "tx": { "to": "0x4cd0...", "data": "0xe8017952...", "value": "0", "chainId": 8453 } }
  ],
  "timeEstimate": 1
}
```

Each step's `tx` is the transaction the wallet must send for that step
(`to`, `data`, `value`, `chainId`, taken from the step's first item). A
step with no transaction data gets `"tx": null`, and the app keeps its
Send button off for that quote.

The service only asks Relay for a quote. It never signs anything and never
sends a transaction. The `steps` are what the wallet would sign later, when
the app adds the send flow.

### GET /status?requestId=0x...

Asks Relay how far a quoted send has got. `requestId` is the one from the
quote (0x plus 64 hex characters). Success returns:

```json
{
  "requestId": "0x1794...",
  "status": "waiting",
  "txHashes": []
}
```

Statuses: `waiting` (deposit not seen yet), `depositing`, `pending`
(deposit seen, fill on its way), `success` (the money reached the
recipient), `refund`. `success` and `refund` are final. `failure` is not
final: the fill can still retry or move to `refund`. Poll every few seconds
until `success` or `refund`. A bad `requestId` returns `400`.

About `feesUsd`: it sums the fee lines Relay reports (gas, relayer, app,
subsidized). Relay's `relayer` line already contains `relayerGas` and
`relayerService`, so neither is added again. On the sample quote the total
is gas + relayer, about $0.025.

## Test it

```sh
node test.cjs
```

The test checks response shaping against a real Relay response recorded
2026-11-08 (1 USDC Base to USDC Arbitrum: 0.976173 out, about $0.025 in
fees), checks input validation (including `topupGas`), checks
`GET /health`, checks `GET /chains` and `GET /currencies` (shape,
caching, bad `chainId`, Relay unreachable) and checks that `POST /quote`
forwards `topupGas: true` only for an allowed EVM-to-EVM non-native
route, against a local mock Relay — it never calls the real Relay. It
also checks that a missing `RELAY_API_KEY` exits with a clear message.
