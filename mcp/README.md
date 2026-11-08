# @prime-way/mcp

Prime Way as MCP tools: any MCP-client agent can send money through
Prime Way directly, without custom code. Same backend, same quotes,
same routes as the human app. The human app stays unchanged.

Normal usage, the same as a person using the app: get a live quote,
send money through the quote's steps, check how the send is doing.

## Tools

| Tool | What it does |
| --- | --- |
| `primeway_quote` | A live quote: what the recipient receives and what it costs. Read-only, never moves money. |
| `primeway_send` | Send money: quotes, runs the approve and deposit steps, and watches until the money lands or is refunded. Returns the receipt. |
| `primeway_status` | How far a send has got, by requestId: `waiting`, `depositing`, `pending`, `success`, `refund`. `failure` is not final. |

## Run it

The server runs on the owner's own machine, over stdio. It signs
with the owner's agent key, which lives only in the environment.

```sh
npm install
npm run build

PRIMEWAY_PRIVATE_KEY=0x... \
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
        "PRIMEWAY_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### Environment

| Variable | Required | What it is |
| --- | --- | --- |
| `PRIMEWAY_PRIVATE_KEY` | yes | The agent wallet's key (0x plus 64 hex). Never printed, never logged, never committed. |
| `PRIMEWAY_BACKEND_URL` | no | Default: the live Prime Way backend at https://prime-way-backend.onrender.com. Public config, not a secret. |

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
  "recipient": "0x1111..."
}
```

```json
// answer when the send lands
{
  "requestId": "0x1794...",
  "approveTx": "0x0000...01",
  "depositTx": "0x0000...02",
  "status": "success",
  "txHashes": ["0x..."],
  "usdAmount": 25,
  "recipient": "0x1111...",
  "originChainId": 8453,
  "destinationChainId": 42161
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
