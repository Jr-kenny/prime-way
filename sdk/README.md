# @prime-way/sdk

Send money through Prime Way, for agents. Same backend, same quotes,
same routes as the human app. The human app stays unchanged; this
layer sits behind it.

Normal usage, the same as a person using the app: get a live quote,
send money through the quote's steps, check how the send is doing.
People and agents build with it.

## Install

```sh
npm install @prime-way/sdk
```

The SDK has no required runtime dependencies. `viem` is an optional
peer dependency: install it only if you use the viem signer adapter.

## Quick start

```ts
import { PrimeWay } from '@prime-way/sdk';
import { viemSigner, localWalletClient } from '@prime-way/sdk/viem';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`);
const client = new PrimeWay({
  wallet: account.address,
  signer: viemSigner(localWalletClient(account, 8453), account),
});

const receipt = await client.send({
  usdAmount: '25',
  payChainId: 8453,
  paySymbol: 'USDC',
  payPrice: 1,
  destinationChainId: 42161,
  receiveSymbol: 'USDC',
  recipient: '0x1111...',
});

console.log('sent', receipt.requestId, receipt.status);
```

## What it does

- `getQuote(req)` — a live quote from the Prime Way backend. Read-only:
  quoting never moves money.
- `send(req)` — runs the quote's steps (approve, then deposit) with
  your signer, then watches the send until it lands or is refunded,
  and returns the receipt: requestId, step transaction hashes, and
  the final status.
- `checkStatus(requestId)` — asks the backend how far a send has got:
  `waiting`, `depositing`, `pending`, `success`, `refund`. `failure`
  is not final: the fill can still retry or refund.

`send` throws only for mistakes (a bad amount, an unknown chain or
token, a bad address) and for backend failures. A send that goes out
and then fails on-chain comes back in the receipt's status.

## The signer

The SDK never holds a private key. You supply a `Signer`: an object
with an `address` and a `sendTransaction(tx)` that sends one step
transaction and returns its hash. The viem adapter covers the common
case:

```ts
import { viemSigner, localWalletClient } from '@prime-way/sdk/viem';
```

`localWalletClient(account, chainId)` builds a viem wallet client
that signs with a local key, using the public RPC for that chain.
Anything else that can send a transaction works too: wrap it in the
two-method `Signer` shape.

## Configuration

| Option | What it is |
| --- | --- |
| `backendUrl` | The Prime Way backend. Default: the live service at https://prime-way-backend.onrender.com. It is public config, not a secret. |
| `wallet` | The wallet that sends. Must match the signer. |
| `signer` | Sends the step transactions. |
| `pollIntervalMs` | Status polling interval. Default 5000. |
| `pollTimeoutMs` | How long to watch a send. Default 10 minutes. After a timeout the receipt keeps the last known status: use `checkStatus` for the truth, the money may still land. |

No secret or API key belongs in this package or in your code. The
Relay API key lives in the backend's environment on Render; the SDK
never needs it. Your agent's own wallet key stays in your
environment, never in a file you commit.

## Tokens and chains

The token map mirrors the app (`app/src/lib/chains.ts`): BNB Chain,
Base, Arbitrum, Ethereum, Optimism, Polygon, Avalanche. Addresses
were checked against Relay's own chain list on 2026-11-08. The SDK
never sends a token it cannot look up.

## Tests

```sh
npm install
npm test        # mock backend + mock signer, no money moves
npm run typecheck
npm run build
```

The fixtures use a real quote recorded live from the backend on
2026-11-08 (1 USDC Base to USDC Arbitrum: 0.976173 out, about
$0.025 in fees, full step transaction data).
