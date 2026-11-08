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

Requires Node 18 or newer (uses the global `fetch`).

## Endpoints

### GET /health

Returns `{ "ok": true }`. It does not call Relay. Use it to check the
service is up.

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
fees), checks input validation, checks `GET /health`, and checks that a
missing `RELAY_API_KEY` exits with a clear message. It never calls Relay.
