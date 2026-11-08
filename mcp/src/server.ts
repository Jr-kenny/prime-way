// The Prime Way MCP server: the SDK's abilities as tools.
//
// Tools:
//   primeway_quote   a live quote (read-only, never moves money)
//   primeway_send    send money through a quote's steps
//   primeway_status  how far a send has got
//
// Normal usage, the same as a person using the app: quote, send,
// check. The tools are plain pass-throughs to the SDK.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PrimeWay, PrimeWayError } from '@prime-way/sdk';

const sendShape = {
  usdAmount: z
    .string()
    .describe('Dollars to send, e.g. "25".'),
  payChainId: z
    .number()
    .int()
    .describe('Chain id to pay from, e.g. 8453 for Base, 56 for BNB Chain.'),
  paySymbol: z.string().describe('Token to pay with, e.g. USDC, BNB, ETH.'),
  payPrice: z
    .number()
    .positive()
    .describe('Dollars per unit of the pay token, e.g. 780 for BNB, 1 for USDC.'),
  destinationChainId: z
    .number()
    .int()
    .describe('Chain id the recipient is on, e.g. 42161 for Arbitrum.'),
  receiveSymbol: z
    .string()
    .describe('Token the recipient receives, e.g. USDC.'),
  recipient: z
    .string()
    .describe('Recipient address (0x...).'),
};

type TextResult =
  | { content: { type: 'text'; text: string }[] }
  | { content: { type: 'text'; text: string }[]; isError: true };

function ok(value: unknown): TextResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err: unknown): TextResult {
  const message =
    err instanceof PrimeWayError || err instanceof Error
      ? err.message
      : 'primeway failed';
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function createPrimeWayServer(client: PrimeWay): McpServer {
  const server = new McpServer({
    name: 'prime-way',
    version: '0.1.0',
  });

  server.tool(
    'primeway_quote',
    'Get a live Prime Way quote for a send: what the recipient receives and what it costs. Read-only: quoting never moves money.',
    {
      usdAmount: sendShape.usdAmount,
      payChainId: sendShape.payChainId,
      paySymbol: sendShape.paySymbol,
      payPrice: sendShape.payPrice,
      destinationChainId: sendShape.destinationChainId,
      receiveSymbol: sendShape.receiveSymbol,
      recipient: sendShape.recipient,
    },
    async (args) => {
      try {
        const quote = await client.getQuote({
          ...args,
          recipient: args.recipient as `0x${string}`,
        });
        return ok(quote);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'primeway_send',
    'Send money through Prime Way: quotes, runs the approve and deposit steps, and watches until the money lands or is refunded. Returns the receipt: requestId, step transaction hashes, and the final status.',
    sendShape,
    async (args) => {
      try {
        const receipt = await client.send({
          ...args,
          recipient: args.recipient as `0x${string}`,
        });
        return ok(receipt);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'primeway_status',
    'Check how far a Prime Way send has got, by its requestId. Statuses: waiting, depositing, pending, success, refund. Failure is not final.',
    {
      requestId: z
        .string()
        .describe('The requestId from the quote, 0x plus 64 hex characters.'),
    },
    async (args) => {
      try {
        const status = await client.checkStatus(args.requestId);
        return ok(status);
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
