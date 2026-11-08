# Relay chains & currencies — live findings and backend contracts

Verified live against `https://api.relay.link` on 2026-11-08. No API key
was used for any of these calls except where noted. All counts and field
names below are from the live responses that day, not from the docs.

## GET /chains (Relay) — live shape

`GET https://api.relay.link/chains` — **public, no API key needed**
(200 with no key). Top level is `{ "chains": [...] }`, **57 chains**.

Every chain carries these fields (present on all 57):

| Field | Type | Notes |
|---|---|---|
| `id` | integer | The chain id the app and `/quote` use (1, 10, 56, 8453, 42161, …) |
| `name` | string | Slug: `"ethereum"`, `"base"`, `"solana"` |
| `displayName` | string | Human name: `"Ethereum"`, `"Base"`, `"Solana"` |
| `httpRpcUrl` | string | **An RPC URL IS included per chain, on all 57.** E.g. Base: `https://base.drpc.org`. Never empty live. |
| `wsRpcUrl` | string | Often `""` — empty on 37 of 57 chains (all non-EVM chains and some EVM ones). Do not assume a websocket URL exists. |
| `explorerUrl` / `explorerName` | string | E.g. `https://basescan.org` / `BaseScan` |
| `depositEnabled`, `depositAddressEnabled` | boolean | |
| `tokenSupport` | string | `"All"` (46 chains) or `"Limited"` (11) |
| `disabled` | boolean | `false` on all 57 live — no chain was disabled that day |
| `partialDisableLimit` | integer | `0` on the chains checked |
| `blockProductionLagging` | boolean | |
| `currency` | object | The native currency (see below) |
| `withdrawalFee`, `depositFee` | number | Relay fees in USD-ish units, per chain |
| `surgeEnabled` | boolean | |
| `featuredTokens`, `erc20Currencies`, `solverCurrencies` | arrays | Token lists embedded per chain (the backend does not return these; use `GET /currencies` instead) |
| `iconUrl` | string | E.g. `https://assets.relay.link/icons/8453/light.png` |
| `contracts` | object | `multicall3`, `relayReceiver`, `erc20Router`, `approvalProxy`, `v3`, `v3.2` |
| `vmType` | string | **This is how a chain's VM is identified** (see below) |
| `baseChainId` | integer | `1` on every chain seen |
| `solverAddresses` | string[] | |
| `tags` | array | `[]` on the chains checked |
| `protocol` | object | `{ "v2": { "chainId": "<slug>", "depository": "<address>" } }` |

Rare extra fields (do not rely on them): `logoUrl` (only 3 chains:
360, 480, 7777777), `brandColor` (only 360, 480), `explorerPaths`
(only 7 chains, all non-EVM or app-chains).

### Native currency

`currency` is `{ id, symbol, name, address, decimals, supportsBridging }`.
Examples:

- Ethereum / Base / Arbitrum: `{ id: "eth", symbol: "ETH", name: "Ether", address: "0x0000000000000000000000000000000000000000", decimals: 18 }`
- BSC: `{ symbol: "BNB", decimals: 18, address: "0x0000…0000" }`
- Solana: `{ id: "sol", symbol: "SOL", name: "Solana", address: "11111111111111111111111111111111", decimals: 9 }`
- Bitcoin: `{ id: "btc", symbol: "BTC", address: "bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmql8k8", decimals: 8 }`
- Tron: `{ id: "trx", symbol: "TRX", name: "TRX", address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", decimals: 6 }`

**EVM chains use the zero address `0x0000…0000` as the native-currency
address** (48 of 48 EVM chains live). Non-EVM chains use their own
address format: Solana base58 (`1111…`), Bitcoin bech32 (`bc1q…`),
Tron base58 (`T…`), XRP literally `"xrp"`, Hyperliquid `"0x00000000000000000000000000000000"`
(32 hex chars, not 40), Lighter `"0"`. Never validate a native address
with the EVM `0x`+40-hex pattern.

### How non-EVM chains are identified

There is **no `evm` boolean and no `isEVM` flag** in Relay's response.
The identifier is **`vmType`**:

| `vmType` | Chains live | Examples |
|---|---|---|
| `"evm"` | 48 | 1, 10, 56, 8453, 42161, … |
| `"svm"` | 2 | 792703809 Solana, 9286185 Eclipse |
| `"lvm"` | 2 | 3586256 Lighter, 548123634 Robinhood Lighter |
| `"bvm"` | 1 | 8253038 Bitcoin |
| `"tvm"` | 1 | 728126428 Tron |
| `"hypevm"` | 1 | 1337 Hyperliquid |
| `"xrpvm"` | 1 | 537724 XRP |
| `"tonvm"` | 1 | 224235520 TON |

So: EVM ⟺ `vmType === "evm"`. The backend's `/chains` response exposes
this as `evm: true/false` per chain. Non-EVM chains also have
`wsRpcUrl: ""` and a non-`0x` native address, but `vmType` is the
authoritative check — use it, not the address format.

Full id list live (57): 1, 10, 25, 56, 100, 130, 137, 143, 146, 169, 196,
288, 324, 360, 480, 747, 988, 999, 1088, 1337, 1868, 2020, 2741, 2818,
4217, 4326, 4663, 5000, 5031, 5042, 8453, 9745, 33139, 34443, 42018,
42161, 42220, 43114, 48900, 57073, 59144, 60808, 80094, 97477, 98866,
534352, 537724, 685689, 747474, 3586256, 7777777, 8253038, 9286185,
224235520, 548123634, 728126428, 792703809.

## GET /currencies (Relay) — correction: it is POST, not GET

**`GET /currencies/v2` does not exist.** Live it answers
`404 {"message":"Route GET:/currencies/v2?chainIds=8453&limit=5 not found","error":"Not Found","statusCode":404}`.
The real endpoint is **`POST /currencies/v2`** (confirmed by Relay's
migration guide, updated 2026-10-29; v1 is deprecated since 2026-10-30
and retires 2027-01-28).

- Request body: `{ "chainIds": [<id>], "limit": <n> }`. `limit` defaults
  to **20** and caps at **100**; the backend requests 100.
- Response: a **flat array** `Currency[]` (v2), ranked verified-first —
  not the nested `Currency[][]` groups v1 returned.
- Per currency: `{ chainId, address, symbol, name, decimals, vmType, metadata: { logoURI, verified } }`.
  Example (Base): `{ "chainId": 8453, "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "symbol": "USDC", "name": "USD Coin", "decimals": 6, "vmType": "evm", "metadata": { "logoURI": "…", "verified": true } }`.
  Solana currencies keep `vmType: "svm"` and base58 addresses, e.g.
  USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, SOL
  `11111111111111111111111111111111`.
- **API key: NOT required.** Verified live 2026-11-08: the call returns
  200 with no key and the same 200 with a dummy key; the docs call the
  `x-api-key` header optional. The backend still sends its key when it
  has one, in case Relay tightens this later.
- Unknown chain id: HTTP **200 with `[]`** (verified live for
  `999999999`), not an error.
- **Truncation caveat:** Base returns exactly 100 entries at
  `limit: 100`, so the list is capped — there may be more currencies
  Relay knows that this endpoint will not return in one call. The
  backend returns at most 100 per chain.
- **Duplicate caveat:** Relay's own list can repeat an address (seen
  live on Base: HOTMOM and RDAC each appear twice in the top 100). The
  backend dedupes by address (first occurrence wins).

## Backend contracts (this service)

### GET /chains

No API key needed. Cached in memory, 1-hour TTL; a failed refresh keeps
serving the previous list, and concurrent callers share one in-flight
fetch. Relay failure with no cached list → `502 { "error": "could not reach Relay" }`.

Response: `{ "chains": [ … ] }`, one object per chain:

```json
{
  "id": 8453,
  "name": "base",
  "displayName": "Base",
  "nativeCurrency": { "symbol": "ETH", "decimals": 18 },
  "evm": true,
  "disabled": false,
  "explorerUrl": "https://basescan.org",
  "iconUrl": "https://assets.relay.link/icons/8453/light.png",
  "rpcUrl": "https://base.drpc.org"
}
```

`explorerUrl`, `iconUrl` and `rpcUrl` are omitted when Relay gives an
empty/missing value (live, `rpcUrl` is present on every chain).
Malformed Relay entries (bad id, missing native currency) are skipped,
never returned. `rpcUrl` comes from Relay's `httpRpcUrl` — the backend
never invents RPC URLs.

### GET /currencies?chainId=<id>

Cached in memory, 1-hour TTL per chain (same stale-on-failure behaviour
as `/chains`). `chainId` must be a plain positive decimal integer:
missing, `abc`, `0`, `-5`, `8453.5` → `400 { "error": "chainId must be a positive integer chain id" }`.
Relay failure with no cached list → `502`.

Response: `{ "chainId": 8453, "currencies": [ … ] }`, one object per
currency (deduped by address, malformed entries skipped):

```json
{ "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "symbol": "USDC", "decimals": 6, "name": "USD Coin" }
```

Addresses are returned exactly as Relay gives them — non-EVM addresses
are not hex, so do not validate them as `0x`+40-hex on the client.

### POST /quote — `topupGas`

Optional boolean in the request body, default off:

```json
{ "user": "0x…", "recipient": "0x…", "originChainId": 8453, "destinationChainId": 42161,
  "originCurrency": "0x8335…", "destinationCurrency": "0xaf88…", "amount": "1000000",
  "topupGas": true }
```

- Non-boolean when present (`"true"`, `1`, `null`) → `400 { "error": "topupGas must be a boolean when present" }`.
- When `true`, the backend forwards `topupGas: true` to Relay's
  `/quote/v2` **only if** the route is EVM-to-EVM (both chains'
  `vmType === "evm"` in the cached chain list) **and** the origin
  currency is not the origin chain's native token (checked against the
  chain's native address, plus the EVM zero-address sentinel).
- Otherwise the flag is left out and the quote proceeds as a normal
  quote. In particular the flag is **never** sent for a Solana route
  (or any non-EVM route), never when sending the chain's native token,
  and never when the chain list cannot be fetched (the route cannot be
  proven EVM-to-EVM, so it fails closed). The quote response does not
  say whether the flag was applied — the app must not assume a top-up
  happened just because it asked for one.
- Relay's own rules (from https://docs.relay.link/features/gas-top-up):
  EVM only; not when bridging the chain's native token; bridging must
  be enabled (`tokenSupport === "All"` or
  `currency.supportsBridging === true`). Relay enforces those itself.
  The backend does not send `topupGasAmount` — Relay chooses the
  top-up amount when only `topupGas: true` is given.

**Fee impact — not measured.** Relay's docs do not publish the default
top-up amount, and the real fee/output effect could not be measured
here: there is no Relay API key available locally and the deployed
backend runs the old code, so no live `/quote/v2` call with
`topupGas: true` was made. What is known: the top-up is a small amount
of the destination chain's native gas token included with the bridged
tokens, so expect the received amount of the destination token to be
slightly lower (or the fee slightly higher) than the same quote without
the flag — compare `outputAmount` / `feesUsd` with the flag on and off
on the deployed backend once this ships. Do not quote a dollar figure
for the top-up until that comparison is done.
