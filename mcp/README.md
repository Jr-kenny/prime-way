# @prime-way/mcp

Prime Way as MCP tools: any MCP-client agent can send money through
Prime Way directly, without custom code. Same backend, same quotes,
same routes as the human app. The human app stays unchanged.

## Tools

| Tool | What it does |
| --- | --- |
| `primeway_quote` | A live quote: what the recipient receives and what it costs. Read-only, never moves money. |
| `primeway_send` | Send money: quotes, runs the approve and deposit steps, and watches until the money lands or is refunded. |
| `primeway_status` | How far a send has got, by requestId: `waiting`, `depositing`, `pending`, `success`, `refund`. `failure` is not final. |
| `primeway_decisions` | The recorded decisions and receipts. Read-only audit. |

## Run it

The server runs on the owner's own machine, over stdio. It signs
with the owner's agent key, which lives only in the environment.

```sh
npm install
npm run build

PRIMEWAY_PRIVATE_KEY=0x... \
PRIMEWAY_RECIPIENTS='[{"address":"0x1111...","chainId":42161,"label":"Sarah"}]' \
PRIMEWAY_MAX_SEND_USD=100 \
node dist/index.js
```

Point your MCP client at it, e.g. in a client config:

```json
{
  "mcpServers": {
    "prime-way": {
      "command": "node",
      "args": ["/path/to/prime-way/mcp/dist/index.js"],
      "env": {
        "PRIMEWAY_PRIVATE_KEY": "0x...",
        "PRIMEWAY_RECIPIENTS": "[{\"address\":\"0x1111...\",\"chainId\":42161,\"label\":\"Sarah\"}]",
        "PRIMEWAY_MAX_SEND_USD": "100"
      }
    }
  }
}
```

### Environment

| Variable | Required | What it is |
| --- | --- | --- |
| `PRIMEWAY_PRIVATE_KEY` | yes | The agent wallet's key (0x plus 64 hex). Never printed, never logged, never committed. |
| `PRIMEWAY_RECIPIENTS` | yes | JSON list of who may receive: `[{"address":"0x...","chainId":42161,"label":"Sarah"}]`. An entry without `chainId` allows that address on any chain. Empty means nobody. |
| `PRIMEWAY_MAX_SEND_USD` | yes | Most dollars in one send. |
| `PRIMEWAY_MAX_DAILY_USD` | no | Most dollars in a rolling 24 hours. |
| `PRIMEWAY_BACKEND_URL` | no | Default: the live Prime Way backend at https://prime-way-backend.onrender.com. Public config, not a secret. |
| `PRIMEWAY_STORE_PATH` | no | Decision store. Default: `~/.prime-way/decisions.json`. |
| `PRIMEWAY_APPROVALS_PATH` | no | Owner approvals file. Default: `~/.prime-way/approvals.json`. |

## Safety rules (enforced server-side, not left to the caller)

The same rules as the SDK (`../sdk/README.md`), enforced by the
server itself. The calling agent cannot switch them off.

- **One decision = one send.** Every send carries a decision key
  (supplied, or derived from a nonce). An executed decision is
  recorded in the local store; a retry with the same key returns the
  stored receipt and never sends again.
- **Spending limits.** `PRIMEWAY_MAX_SEND_USD` per send, and
  `PRIMEWAY_MAX_DAILY_USD` per rolling day. Over a limit, the send
  returns `needs-approval` with the full details and sends nothing.
- **Approved recipients only.** A send to anyone not on the
  `PRIMEWAY_RECIPIENTS` list returns `refused` and sends nothing.
- **Human approval, and no approve tool.** `primeway_send` takes no
  approval flag: an agent that passes `approved: true` has it ignored.
  There is deliberately no `primeway_approve` tool. The owner
  approves by writing the decision key into the approvals file
  (or with the SDK's `approve()` from their own code), and the agent
  then re-issues the same decision key. Nothing approves on a timeout.

## Example

```json
// primeway_send
{
  "usdAmount": "25",
  "payChainId": 8453,
  "paySymbol": "USDC",
  "payPrice": 1,
  "destinationChainId": 42161,
  "receiveSymbol": "USDC",
  "recipient": "0x1111...",
  "nonce": "pay-sarah-nov-08-001"
}
```

```json
// answer when the send is over the limit
{
  "outcome": "needs-approval",
  "decision": {
    "decisionKey": "pw_...",
    "usdAmount": 250,
    "recipient": "0x1111...",
    "reason": "over-per-send-limit",
    "limitUsd": 100
  }
}
```

## Tests

```sh
npm install
npm run build
npm test        # tools over the MCP protocol (in-memory transport)
                # with a mock backend and mock signer, plus a stdio
                # smoke test of the built server. No money moves.
npm run typecheck
```

The fixtures use a real quote recorded live from the backend on
2026-11-08 (1 USDC Base to USDC Arbitrum: 0.976173 out, about
$0.025 in fees, full step transaction data).
