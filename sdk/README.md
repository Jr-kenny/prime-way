# @prime-way/sdk

Send money through Prime Way, for agents. Same backend, same quotes,
same routes as the human app. The human app stays unchanged; this
layer sits behind it.

## Install

```sh
npm install @prime-way/sdk
```

The SDK has no required runtime dependencies. `viem` is an optional
peer dependency: install it only if you use the viem signer adapter.

## Quick start

```ts
import { PrimeWay, MemoryDecisionStore } from '@prime-way/sdk';
import { viemSigner, localWalletClient } from '@prime-way/sdk/viem';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`);
const client = new PrimeWay({
  wallet: account.address,
  signer: viemSigner(localWalletClient(account, 8453), account),
  recipients: [
    { address: '0x1111...', chainId: 42161, label: 'Sarah' },
  ],
  maxSendUsd: 100,
  maxDailyUsd: 500,
});

const out = await client.send({
  usdAmount: '25',
  payChainId: 8453,
  paySymbol: 'USDC',
  payPrice: 1,
  destinationChainId: 42161,
  receiveSymbol: 'USDC',
  recipient: '0x1111...',
  nonce: 'pay-sarah-nov-08-001',
});

if (out.outcome === 'sent') console.log('sent', out.receipt);
if (out.outcome === 'needs-approval') console.log('waiting for a human', out.decision);
if (out.outcome === 'refused') console.log('not allowed', out.reason);
if (out.outcome === 'already-sent') console.log('already sent', out.receipt);
```

## What it does

- `getQuote(req)` — a live quote from the Prime Way backend. Read-only:
  quoting never moves money and never checks the recipient list.
- `send(req)` — runs the quote's steps (approve, then deposit) with
  your signer, then watches the send until it lands or is refunded.
  Returns a `SendOutcome`, never throws for being refused.
- `checkStatus(requestId)` — asks the backend how far a send has got:
  `waiting`, `depositing`, `pending`, `success`, `refund`. `failure`
  is not final: the fill can still retry or refund.
- `approve(decisionKey)` — the owner approves a waiting decision.
- `listDecisions()` — every recorded decision and receipt, for audit.

## Safety rules (enforced in code, not in documentation)

### One decision = one send

Every send carries a decision key. Supply `decisionKey` yourself, or
supply a `nonce` and the key is a hash of recipient + amount + chains
+ nonce. The nonce is what makes two identical sends (same person,
same amount) two different decisions.

Executed decisions are recorded in a local store (a JSON file at
`~/.prime-way/decisions.json` by default, so retries survive
restarts). A retry with the same key returns the stored receipt —
requestId, tx hashes, status — and never sends again. The receipt is
written the moment the deposit transaction is sent, before the send
is watched, so a crash mid-watch still cannot double-send.

### Spending limits

`maxSendUsd` is required: the most dollars in one send. `maxDailyUsd`
is optional: the most dollars in a rolling 24 hours (refunded sends
do not count). A send over a limit does not send. It returns
`needs-approval` with the full details, and the decision is recorded
as waiting.

### Approved recipients

`recipients` is the list of addresses (and chains) the agent may send
to. An empty list means nobody: it fails closed. A send to anyone not
on the list returns `refused` and sends nothing.

### Human approval

Approval is an explicit act by the owner, never by the agent:

1. The owner re-issues the same decision with `approved: true`, or
2. the owner calls `approve(decisionKey)`, which writes the key into
   the approvals file (`~/.prime-way/approvals.json` by default), and
   the agent re-issues the same decision key.

There is no approve tool an agent can call, and no timeout that
approves on its own. A decision that needs approval stays waiting
until a human acts.

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
| `recipients` | Who may receive. Empty means nobody. |
| `maxSendUsd` | Per-send cap. Required, no default. |
| `maxDailyUsd` | Rolling 24-hour cap. Optional. |
| `store` | Decision store. Default: a JSON file at `~/.prime-way/decisions.json` (or `PRIMEWAY_STORE_PATH`). |
| `approvalsPath` | Owner approvals file. Default: `~/.prime-way/approvals.json` (or `PRIMEWAY_APPROVALS_PATH`). |
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
